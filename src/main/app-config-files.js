'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { execFile } = require('child_process');
const { tunnelAppConfig } = require('./cluster-monitor');
const { fileStatus, resourceKey } = require('./config-file-status');

const LIMIT = 4 * 1024 * 1024;
const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'target', 'coverage', 'venv', '__pycache__']);
const eligible = name => !name.startsWith('.') && !/^(?:kubeconfig|devspace)(?:[._-]|$)/i.test(name) && /\.(?:ya?ml|json)$/i.test(name);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const identity = resource => ({ apiVersion: resource.apiVersion, kind: resource.kind,
    metadata: { name: resource.metadata.name, namespace: resource.metadata.namespace } });

function parseManifest(content) {
    let documents;
    try { documents = yaml.loadAll(content).filter(item => item != null); }
    catch (error) { return { error: `Invalid YAML${error.mark ? ' at line ' + (error.mark.line + 1) : ''}. ${error.reason || 'Check the file in your editor.'}` }; }
    if (!documents.length || documents.some(item => item && item.kind === 'Config' && item.apiVersion === 'v1')) return { ignored: true };
    if (!documents.some(item => item && typeof item === 'object' && (item.apiVersion || item.kind))) return { ignored: true };
    const resources = [], queue = documents.slice(), seen = new Set();
    while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== 'object' || seen.has(item) || seen.size >= 1000) return { error: 'Invalid or overly complex Kubernetes resource list.' };
        seen.add(item);
        if (typeof item.kind === 'string' && item.kind.endsWith('List') && Array.isArray(item.items)) { queue.push(...item.items); continue; }
        const metadata = item.metadata || {};
        if (typeof item.apiVersion !== 'string' || !/^(?:[a-z0-9]+(?:[.-][a-z0-9]+)*\/)?v[0-9]+(?:(?:alpha|beta)[0-9]+)?$/.test(item.apiVersion)
            || typeof item.kind !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(item.kind)
            || typeof metadata.name !== 'string' || metadata.name.length > 253 || !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(metadata.name)
            || metadata.namespace !== undefined && (typeof metadata.namespace !== 'string' || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(metadata.namespace))) {
            return { error: 'Every document needs a valid Kubernetes apiVersion, kind and metadata.name.' };
        }
        resources.push(item);
        if (resources.length > 500) return { error: 'A file may contain at most 500 resources.' };
    }
    return resources.length ? { resources } : { ignored: true };
}

class AppConfigFiles {
    constructor({ monitor, execute = execFile, openFile, trashFile, confirm = async () => false, canMutate = () => true, onChanged = () => {} }) {
        Object.assign(this, { monitor, execute, openFile, trashFile, confirm, canMutate, onChanged });
        this.pending = new Map(); this.statusJobs = new Map(); this.closed = false;
    }

    workspace(appId) {
        if (this.closed) throw new Error('Configuration files are shutting down.');
        if (!validId(appId)) throw new Error('Invalid app.');
        const appDir = path.join(this.monitor.connections.baseDir, appId);
        const settingsContent = fs.readFileSync(path.join(appDir, '.kenzap'), 'utf8');
        const app = JSON.parse(settingsContent);
        return { appId, app, appDir, settingsDigest: digest(settingsContent), directory: fs.realpathSync(app.path || appDir), statePath: path.join(appDir, '.config-files-state.json') };
    }

    file(workspace, relative) {
        if (typeof relative !== 'string' || /[\\\x00-\x1f]/.test(relative) || path.isAbsolute(relative)) throw new Error('Invalid configuration file path.');
        const parts = relative.split('/');
        if (parts.some(part => !part || part.startsWith('.') || SKIP.has(part)) || !eligible(parts[parts.length - 1])) throw new Error('Choose a workspace manifest, not a kubeconfig or DevSpace file.');
        let target = workspace.directory;
        for (const part of parts) {
            target = path.join(target, part);
            if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Configuration file links are not supported.');
        }
        const descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        try {
            const stat = fs.fstatSync(descriptor);
            if (!stat.isFile() || stat.size > LIMIT) throw new Error('Choose a regular manifest file smaller than 4 MiB.');
            const content = fs.readFileSync(descriptor, 'utf8');
            if (Buffer.byteLength(content) > LIMIT) throw new Error('The configuration file exceeds 4 MiB.');
            return { target, file: relative, content, digest: digest(content), modifiedAt: stat.mtimeMs, ...parseManifest(content) };
        } finally { fs.closeSync(descriptor); }
    }

    history(workspace) {
        if (!fs.existsSync(workspace.statePath)) return {};
        if (fs.statSync(workspace.statePath).size > LIMIT) throw new Error('Configuration history is too large.');
        const state = JSON.parse(fs.readFileSync(workspace.statePath, 'utf8'));
        if (!state || state.version !== 1 || !state.files || typeof state.files !== 'object') throw new Error('Configuration history is invalid.');
        return state.files;
    }

    list(request) {
        const workspace = this.workspace(request && request.appId), rows = [];
        let visited = 0, truncated = false, warning = '', history = {};
        try { history = this.history(workspace); } catch (_) { warning = 'Last-action history could not be read. Files are still available.'; }
        const walk = (directory, prefix = '', depth = 0) => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
                if (++visited > 5000 || rows.length >= 500) { truncated = true; break; }
                if (entry.name.startsWith('.') || entry.isSymbolicLink() || SKIP.has(entry.name)) continue;
                const file = prefix + entry.name;
                if (entry.isDirectory()) { if (depth < 6) walk(path.join(directory, entry.name), file + '/', depth + 1); else truncated = true; continue; }
                if (!entry.isFile() || !eligible(entry.name)) continue;
                let item;
                try { item = this.file(workspace, file); }
                catch (_) { rows.push({ file, error: 'Unable to read this file, or it exceeds 4 MiB.', resources: [], history: {} }); continue; }
                if (item.ignored) continue;
                rows.push({ file, digest: item.digest, modifiedAt: item.modifiedAt, error: item.error || '',
                    resources: (item.resources || []).map(identity), history: history[file] || {} });
            }
        };
        walk(workspace.directory);
        const settingsFile = path.join(this.monitor.connections.baseDir, '.kenzap', '.config');
        const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
        const clusters = (workspace.app.clusters || []).map(id => {
            const cluster = (settings.clusters || []).find(item => item.id === id);
            try {
                const route = this.route(workspace, id);
                return { id, name: cluster && cluster.name || (id === 'local' ? 'Minikube' : id), namespace: route.namespace, transport: route.transport };
            } catch (error) { return { id, name: cluster && cluster.name || id, error: error.message }; }
        });
        return { rows, clusters, warning: [warning, truncated ? 'Showing a limited scan (500 manifests, 5,000 entries and six subfolder levels).' : ''].filter(Boolean).join(' ') };
    }

    route(workspace, clusterId) {
        return this.monitor.describe({ appId: workspace.appId, clusterId, operation: 'deployments' }, { allowSecondaryCluster: true });
    }

    current(workspace, request) {
        if (digest(fs.readFileSync(path.join(workspace.appDir, '.kenzap'), 'utf8')) !== workspace.settingsDigest) throw new Error('The app settings changed. Refresh and review the target before trying again.');
        const item = this.file(workspace, request.file);
        if (item.ignored) throw new Error('This file is not a Kubernetes manifest.');
        if (!request.digest || item.digest !== request.digest) throw new Error('The file changed in your editor. Refresh the list and review it before trying again.');
        return item;
    }

    async edit(request) {
        const workspace = this.workspace(request && request.appId);
        const item = this.file(workspace, request.file);
        if (item.ignored) throw new Error('This file is not a Kubernetes manifest.');
        const error = await this.openFile(item.target);
        if (error) throw new Error(error);
        return { opened: true };
    }

    check(job) {
        if (this.closed || job.aborted) throw new Error('Configuration action interrupted. Reconnect and review the file before retrying.');
        if (job.deadline && Date.now() >= job.deadline) throw new Error('Configuration status check timed out.');
        if (job.route && job.route.transport === 'ssh' && (job.route.connection.stopped || job.route.connection.state !== 'connected'
            || this.monitor.connections.connections.get(job.route.clusterId) !== job.route.connection)) throw new Error('SSH disconnected. Reconnect before applying configurations.');
    }

    scrub(job, value) {
        let output = String(value || '');
        for (const secret of job.secrets || []) if (typeof secret === 'string' && secret) {
            output = output.split(secret).join('[redacted]').split(JSON.stringify(secret).slice(1, -1)).join('[redacted]');
        }
        return output.slice(-16384);
    }

    command(job, args, input = '') {
        this.check(job);
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error, output) => {
                if (settled) return;
                settled = true; job.abort = null; job.child = null;
                try { this.check(job); } catch (changed) { reject(changed); return; }
                if (error) reject(new Error(this.scrub(job, error.message))); else resolve(output);
            };
            job.abort = () => { if (job.child) job.child.kill(); finish(new Error('Configuration action interrupted.')); };
            try {
                job.child = this.execute(this.monitor.kubectl(), [...args, ...job.flags], { shell: false, encoding: 'utf8', timeout: job.deadline ? Math.max(1, Math.min(15000, job.deadline - Date.now())) : 45000, maxBuffer: LIMIT, env: job.env },
                    (error, stdout, stderr) => finish(error ? new Error(stderr || error.message) : null, stdout));
                if (job.child.stdin) {
                    job.child.stdin.on('error', error => { if (error.code !== 'EPIPE') { if (job.child) job.child.kill(); finish(error); } });
                    job.child.stdin.end(input);
                }
            } catch (error) { finish(error); }
        });
    }

    prepare(job) {
        const route = job.route;
        job.flags = ['--namespace', route.namespace, '--request-timeout=30s', '--cache-dir', path.join(this.monitor.connections.runtimeDir, 'discovery-cache')];
        job.env = { ...process.env };
        if (route.transport === 'local') { job.flags.push('--context', 'minikube'); return; }
        let configPath = route.sourcePath, content = fs.readFileSync(configPath, 'utf8');
        if (digest(content) !== job.configDigest) throw new Error('The app credentials changed. Refresh and review the target before trying again.');
        if (route.transport === 'ssh') {
            content = tunnelAppConfig(content, path.dirname(configPath), route.connection);
            job.temporary = fs.mkdtempSync(path.join(this.monitor.connections.runtimeDir, 'configs-'));
            configPath = path.join(job.temporary, 'kubeconfig.yaml');
            fs.writeFileSync(configPath, content, { mode: 0o600 });
            for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete job.env[name];
        }
        const config = yaml.load(content);
        job.secrets.push(...(config.users || []).flatMap(user => Object.values(user.user || {}).filter(value => typeof value === 'string')));
        job.flags.push('--kubeconfig', configPath, '--context', config['current-context']);
    }

    async mutate(request, action) {
        if (!['apply', 'remove', 'trash'].includes(action)) throw new Error('Invalid configuration action.');
        const workspace = this.workspace(request && request.appId);
        if (this.pending.has(workspace.appId)) throw new Error('Another configuration action is already running for this app.');
        if (!this.canMutate(workspace.appId)) throw new Error('Stop live sync or wait for Publish to finish before changing configuration files.');
        const item = this.current(workspace, request);
        if (action !== 'trash' && item.error) throw new Error(item.error);
        const job = { workspace, secrets: [], route: action === 'trash' ? null : this.route(workspace, request.clusterId) };
        this.cancelStatus(workspace.appId);
        this.pending.set(workspace.appId, job);
        try {
            if (job.route && job.route.transport !== 'local') job.configDigest = digest(fs.readFileSync(job.route.sourcePath, 'utf8'));
            const resources = item.resources || [];
            if (job.route && resources.some(resource => resource.metadata.namespace && resource.metadata.namespace !== job.route.namespace)) throw new Error('This file contains resources outside the app namespace. Use a matching app workspace instead.');
            const accepted = await this.confirm({ action, file: item.file, clusterId: job.route && job.route.clusterId,
                namespace: job.route && job.route.namespace, resources: resources.map(identity) });
            this.check(job);
            if (!accepted) return { canceled: true };
            this.current(workspace, request);
            if (action === 'trash') { await this.trashFile(item.target); return { trashed: true, file: item.file }; }
            this.prepare(job);
            const discovered = new Map();
            for (const resource of resources) {
                if (!discovered.has(resource.apiVersion)) {
                    const endpoint = resource.apiVersion.includes('/') ? '/apis/' + resource.apiVersion : '/api/' + resource.apiVersion;
                    discovered.set(resource.apiVersion, JSON.parse(await this.command(job, ['get', '--raw', endpoint])));
                }
                const api = (discovered.get(resource.apiVersion).resources || []).find(entry => entry.kind === resource.kind && !entry.name.includes('/'));
                if (!api || api.namespaced !== true) throw new Error('Only namespaced resources supported by this cluster can be managed here. Cluster-wide resources require separate administration.');
                resource.metadata.namespace = job.route.namespace;
                if (resource.kind === 'Secret') {
                    job.secrets.push(...Object.values(resource.stringData || {}));
                    for (const value of Object.values(resource.data || {})) if (typeof value === 'string') job.secrets.push(value, Buffer.from(value, 'base64').toString('utf8'));
                }
            }
            this.check(job);
            this.current(workspace, request);
            const payload = (action === 'remove' ? resources.map(identity) : resources).map(resource => yaml.dump(resource)).join('---\n');
            if (Buffer.byteLength(payload) > LIMIT) throw new Error('The expanded manifest exceeds 4 MiB. Split it into smaller files.');
            const output = await this.command(job, action === 'remove' ? ['delete', '-f', '-', '--ignore-not-found=true', '--wait=false', '-o', 'name'] : ['apply', '-f', '-', '-o', 'name'], payload);
            const warnings = [];
            try { if (this.file(workspace, request.file).digest !== item.digest) warnings.push('The file changed during this action. The reviewed version was submitted; refresh before applying the latest edits.'); }
            catch (_) { warnings.push('The local file was moved or deleted during this action.'); }
            try {
                const history = this.history(workspace);
                if (!history[item.file]) history[item.file] = {};
                history[item.file][job.route.clusterId] = { digest: item.digest, namespace: job.route.namespace, action, at: Date.now() };
                const temporary = workspace.statePath + '.' + crypto.randomUUID();
                try { fs.writeFileSync(temporary, JSON.stringify({ version: 1, files: history }), { mode: 0o600 }); fs.renameSync(temporary, workspace.statePath); }
                finally { fs.rmSync(temporary, { force: true }); }
            } catch (_) { warnings.push('The cluster action succeeded, but its local history could not be saved.'); }
            try { this.onChanged({ appId: workspace.appId, clusterId: job.route.clusterId }); }
            catch (_) { warnings.push('Refresh the app to reload its cluster status.'); }
            return { file: item.file, action, namespace: job.route.namespace, transport: job.route.transport, output: this.scrub(job, output), warning: warnings.join(' ') };
        } catch (error) {
            throw new Error(this.scrub(job, error.message) + (action === 'trash' ? '' : ' Any changes already accepted by the cluster are not rolled back.'));
        } finally {
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
            this.pending.delete(workspace.appId);
        }
    }

    invalidate(clusterId) {
        for (const job of [...this.pending.values(), ...this.statusJobs.values()]) if (job.route && job.route.clusterId === clusterId && job.route.transport === 'ssh') {
            job.aborted = true; if (job.abort) job.abort();
        }
    }

    close() {
        this.closed = true;
        for (const job of [...this.pending.values(), ...this.statusJobs.values()]) {
            job.aborted = true; if (job.abort) job.abort();
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
        }
    }

    cancelStatus(appId) {
        const job = this.statusJobs.get(appId);
        if (job) { job.aborted = true; if (job.abort) job.abort(); }
    }

    async statuses(request) {
        const workspace = this.workspace(request && request.appId);
        if (!Array.isArray(request.files) || !request.files.length || request.files.length > 20) throw new Error('Check between 1 and 20 configuration files at a time.');
        if (this.pending.has(workspace.appId)) throw new Error('A configuration action is in progress. Check again when it finishes.');
        const route = this.route(workspace, request.clusterId);
        const job = { workspace, route, secrets: [], deadline: Date.now() + 60000 };
        this.cancelStatus(workspace.appId);
        this.statusJobs.set(workspace.appId, job);
        const rows = [], items = [];
        try {
            for (const file of request.files) {
                const row = { file: file.file, digest: file.digest, status: 'unknown' }; rows.push(row);
                try {
                    const item = this.current(workspace, file);
                    if (item.error) { row.status = 'invalid'; continue; }
                    if (item.resources.some(resource => resource.metadata.namespace && resource.metadata.namespace !== route.namespace)) { row.status = 'wrong-namespace'; continue; }
                    items.push({ item, row });
                } catch (_) { row.message = 'The local file or app settings changed. Refresh before checking again.'; }
            }
            if (items.length) {
                job.configDigest = route.transport === 'local' ? null : digest(fs.readFileSync(route.sourcePath, 'utf8'));
                this.prepare(job);
                const discovery = new Map(), unique = new Map();
                for (const { item, row } of items) {
                    for (const resource of item.resources) {
                        if (!discovery.has(resource.apiVersion)) {
                            const endpoint = resource.apiVersion.includes('/') ? '/apis/' + resource.apiVersion : '/api/' + resource.apiVersion;
                            discovery.set(resource.apiVersion, JSON.parse(await this.command(job, ['get', '--raw', endpoint])));
                        }
                        const api = (discovery.get(resource.apiVersion).resources || []).find(entry => entry.kind === resource.kind && !entry.name.includes('/'));
                        if (!api || api.namespaced !== true) { row.status = 'unsupported'; break; }
                    }
                    if (row.status !== 'unsupported') for (const resource of item.resources) unique.set(resourceKey(resource, route.namespace), { ...identity(resource), metadata: { ...identity(resource).metadata, namespace: route.namespace } });
                }
                if (unique.size > 1000) throw new Error('Too many resources in this status check.');
                const resources = [...unique.values()], live = [];
                for (let offset = 0; offset < resources.length; offset += 50) {
                    const payload = yaml.dump({ apiVersion: 'v1', kind: 'List', items: resources.slice(offset, offset + 50) });
                    const output = await this.command(job, ['get', '-f', '-', '--ignore-not-found=true', '-o', 'json'], payload);
                    if (!output.trim()) continue;
                    const document = JSON.parse(output);
                    if (!document || typeof document !== 'object') throw new Error('Invalid cluster response.');
                    if (document.kind && document.kind.endsWith('List') && Array.isArray(document.items)) live.push(...document.items);
                    else if (document.apiVersion && document.kind && document.metadata) live.push(document);
                    else throw new Error('Invalid cluster response.');
                }
                this.check(job);
                for (const { item, row } of items) {
                    if (row.status === 'unsupported') continue;
                    try { this.current(workspace, { file: item.file, digest: item.digest }); }
                    catch (_) { row.status = 'unknown'; row.message = 'The file changed while checking. Refresh to review the latest version.'; continue; }
                    Object.assign(row, fileStatus(item.resources, live, route.namespace));
                }
            }
            return { clusterId: route.clusterId, namespace: route.namespace, transport: route.transport, checkedAt: Date.now(), rows };
        } catch (_) {
            // Status responses never include kubectl output: live objects may contain Secrets.
            throw new Error('Unable to verify configuration status. Check the SSH connection and app read permissions, then refresh.');
        } finally {
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
            if (this.statusJobs.get(workspace.appId) === job) this.statusJobs.delete(workspace.appId);
        }
    }
}

module.exports = { AppConfigFiles, parseManifest };
