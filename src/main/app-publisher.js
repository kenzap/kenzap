'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { ManagedJobs } = require('./managed-jobs');
const { tunnelAppConfig } = require('./cluster-monitor');
const { findDevspace } = require('./pod-console');

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
const validFile = file => typeof file === 'string' && !file.includes('\0') && file === path.basename(file)
    && file.startsWith('devspace') && file.endsWith('.yaml');
const RUNNING = new Set(['queued', 'running', 'canceling']);

function findDocker() {
    for (const candidate of ['/opt/homebrew/bin/docker', '/usr/local/bin/docker', '/usr/bin/docker',
        path.join(os.homedir(), '.docker', 'bin', 'docker'),
        ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'docker'))]) {
        try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch (_) {}
    }
    throw new Error('Install Docker before publishing images with registry credentials.');
}

class AppPublisher extends ManagedJobs {
    constructor({ monitor, launch, devspace = findDevspace, docker = findDocker,
        kill, onUpdate = () => {}, timeoutMs = 30 * 60 * 1000 }) {
        super({ launch, kill, onUpdate, timeoutMs,
            timeoutMessage: 'Publishing timed out. Check the build or connection and try again.' });
        Object.assign(this, { monitor, devspace, docker });
    }

    snapshot(job) {
        return { appId: job.appId, jobId: job.jobId, status: job.status, running: RUNNING.has(job.status),
            transport: job.route.transport, namespace: job.route.namespace, file: job.file,
            completed: job.completed, total: job.files.length, error: job.error, log: job.log, revision: job.revision };
    }

    start(request) {
        if (this.closed) throw new Error('Publishing is shutting down.');
        const { appId, file } = request || {};
        if (!validId(appId) || !(file === 'all' || validFile(file))) throw new Error('Invalid publishing request.');
        const existing = this.jobs.get(appId);
        if (existing && RUNNING.has(existing.status)) throw new Error('This app is already publishing.');
        const appDir = path.join(this.monitor.connections.baseDir, appId);
        const app = JSON.parse(fs.readFileSync(path.join(appDir, '.kenzap'), 'utf8'));
        if (!app.clusters || !app.clusters.length) throw new Error('Assign a cluster before publishing.');
        const directory = app.path || appDir;
        const files = file === 'all' ? fs.readdirSync(directory).filter(name => validFile(name)
            && fs.statSync(path.join(directory, name)).isFile()).sort() : [file];
        if (!files.length) throw new Error('No DevSpace configurations found in this workspace.');
        const route = this.monitor.describe({ clusterId: app.clusters[0], appId, operation: 'deployments' });
        const executable = this.devspace();
        const configs = files.map(name => {
            const config = yaml.load(fs.readFileSync(path.join(directory, name), 'utf8'));
            if (!config || typeof config !== 'object') throw new Error(`Invalid DevSpace configuration: ${name}`);
            return config;
        });
        const resources = fs.readdirSync(directory).filter(name => /^(secret-|pvc-).*\.yaml$/.test(name))
            .flatMap(name => yaml.loadAll(fs.readFileSync(path.join(directory, name), 'utf8')))
            .flatMap(item => item && item.kind === 'List' ? item.items || [] : [item]).filter(Boolean);
        for (const resource of resources) {
            const metadata = resource.metadata || {};
            if (resource.apiVersion !== 'v1' || !['Secret', 'PersistentVolumeClaim'].includes(resource.kind)
                || !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(metadata.name || '')
                || (metadata.namespace && metadata.namespace !== route.namespace)) {
                throw new Error('Publishing prerequisites must be Secrets or PVCs in the app namespace.');
            }
        }
        // Only static credentials need the legacy Docker login step; DevSpace resolves templated values itself.
        const logins = configs.map(config => Object.values(config.pullSecrets || {}).filter(secret => secret
            && [secret.registry, secret.username, secret.password].every(value => typeof value === 'string' && value.length && !value.includes('${')))
            .map(secret => {
                const url = new URL(secret.registry.includes('://') ? secret.registry : `https://${secret.registry}`);
                if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Invalid registry address.');
                return { registry: url.host, username: secret.username, password: secret.password };
            }));
        const docker = logins.some(items => items.length) && route.transport !== 'local' ? this.docker() : null;
        const job = { appId, jobId: crypto.randomUUID(), directory, files, configs, logins, resources, executable, docker,
            route, status: 'queued', file: null, completed: 0, log: '', error: '', secrets: logins.flat().map(item => item.password) };
        for (const resource of resources.filter(item => item.kind === 'Secret')) {
            job.secrets.push(...Object.values(resource.stringData || {}));
            for (const value of Object.values(resource.data || {})) {
                job.secrets.push(value, Buffer.from(value, 'base64').toString('utf8'));
            }
        }
        for (const [id, old] of this.jobs) if (this.jobs.size >= 64 && !RUNNING.has(old.status)) this.jobs.delete(id);
        this.jobs.set(appId, job);
        this.emit(job);
        job.completion = Promise.resolve().then(() => this.publish(job));
        return this.snapshot(job);
    }

    abort(job, message, status) {
        if (!RUNNING.has(job.status) || job.aborted) return;
        job.aborted = true;
        job.abortMessage = message;
        job.abortStatus = status;
        job.status = 'canceling';
        if (job.stop) job.stop();
        this.emit(job);
    }

    cancel(request) {
        if (!request || !validId(request.appId) || typeof request.jobId !== 'string') throw new Error('Invalid cancellation request.');
        const job = this.jobs.get(request.appId);
        if (!job || job.jobId !== request.jobId) throw new Error('This publishing job is no longer current.');
        this.abort(job, 'Publishing canceled. Changes already applied are not rolled back.', 'canceled');
        return this.snapshot(job);
    }

    invalidate(clusterId) {
        for (const job of this.jobs.values()) {
            if (job.route.clusterId === clusterId && job.route.transport === 'ssh') {
                this.abort(job, 'Publishing interrupted by an SSH connection change. Reconnect and publish again.', 'failed');
            }
        }
    }

    check(job) {
        if (this.closed || job.aborted) throw new Error(job.abortMessage || 'Publishing is shutting down.');
        const route = job.route;
        if (route.transport === 'ssh' && (route.connection.stopped || route.connection.state !== 'connected'
            || this.monitor.connections.connections.get(route.clusterId) !== route.connection)) {
            throw new Error('Publishing paused. Reconnect the cluster via SSH and publish again.');
        }
    }

    async publish(job) {
        let temporary;
        try {
            this.check(job);
            const env = { ...process.env, FORCE_COLOR: '0',
                PATH: `${path.dirname(job.executable)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}` };
            delete env.DEVSPACE_FLAGS;
            const flags = ['--namespace', job.route.namespace, '--no-warn', '--no-colors', '--force-build'];
            const kubectlFlags = ['--namespace', job.route.namespace, '--request-timeout=30s'];
            if (job.route.transport === 'local') {
                flags.push('--kube-context', 'minikube');
                kubectlFlags.push('--context', 'minikube');
            } else {
                let content = fs.readFileSync(job.route.sourcePath, 'utf8');
                let kubeconfig = job.route.sourcePath;
                if (job.route.transport === 'ssh') {
                    content = tunnelAppConfig(content, path.dirname(job.route.sourcePath), job.route.connection);
                    temporary = fs.mkdtempSync(path.join(this.monitor.connections.runtimeDir, 'publish-'));
                    job.temporary = temporary;
                    kubeconfig = path.join(temporary, 'kubeconfig.yaml');
                    fs.writeFileSync(kubeconfig, content, { mode: 0o600 });
                    // Keep registry proxies working while never proxying the loopback Kubernetes connection.
                    env.NO_PROXY = env.no_proxy = `127.0.0.1,localhost,::1,${env.NO_PROXY || ''},${env.no_proxy || ''}`;
                }
                const config = yaml.load(content);
                job.secrets.push(...(config.users || []).flatMap(user => Object.values(user.user || {})
                    .filter(value => typeof value === 'string' && value.length)));
                env.KUBECONFIG = kubeconfig;
                flags.push('--kubeconfig', kubeconfig, '--kube-context', config['current-context'], '--skip-push-local-kube=false');
                kubectlFlags.push('--kubeconfig', kubeconfig, '--context', config['current-context']);
            }
            job.status = 'running';
            this.log(job, `Publishing via ${job.route.transport} in namespace ${job.route.namespace}.\n`);
            this.emit(job);
            if (job.resources.length) {
                this.log(job, 'Applying app Secrets and PVCs.\n');
                await this.run(job, this.monitor.kubectl(), ['apply', '-f', '-', ...kubectlFlags], env,
                    job.resources.map(resource => yaml.dump(resource)).join('---\n'), 45000);
            }
            for (let i = 0; i < job.files.length; i++) {
                this.check(job);
                job.file = job.files[i];
                this.log(job, `\nPublishing ${job.file} (${i + 1}/${job.files.length}).\n`);
                this.emit(job);
                for (const login of job.docker ? job.logins[i] : []) {
                    this.log(job, `Signing in to registry ${login.registry}.\n`);
                    await this.run(job, job.docker, ['login', login.registry, '--username', login.username, '--password-stdin'],
                        { ...process.env, PATH: env.PATH }, login.password + '\n', 120000);
                }
                await this.run(job, job.executable, ['deploy', '--config', job.file, ...flags], env);
                job.completed++;
            }
            this.check(job);
            job.status = 'succeeded';
            this.log(job, '\nPublishing completed.\n');
        } catch (error) {
            job.status = job.abortStatus || 'failed';
            job.error = this.scrub(job, job.abortMessage || error.message);
            this.log(job, `\n${job.error}\n`);
        } finally {
            if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
            job.temporary = null;
            job.secrets = [];
            job.configs = [];
            job.logins = [];
            job.resources = [];
            this.emit(job);
        }
    }

    close() {
        this.closed = true;
        for (const job of this.jobs.values()) {
            this.abort(job, 'Publishing stopped because the app is closing.', 'canceled');
            // Electron may exit before asynchronous child cleanup can run.
            if (job.stop) job.stop(true);
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
        }
    }
}

module.exports = { AppPublisher };
