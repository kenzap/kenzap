'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { execFile } = require('child_process');
const { prepareKubeconfig } = require('./cluster-connections');

const OPERATIONS = new Set(['nodes', 'topNodes', 'topPods', 'deployments', 'pods', 'events', 'logs']);
const APP_OPERATIONS = new Set(['topPods', 'deployments', 'pods', 'events', 'logs']);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
const validNamespace = value => typeof value === 'string' && value.length <= 63 && /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value);

function findKubectl() {
    const candidates = ['/opt/homebrew/bin/kubectl', '/usr/local/bin/kubectl', '/usr/bin/kubectl',
        path.join(os.homedir(), '.kube', 'kubectl'),
        ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'kubectl'))];
    for (const candidate of candidates) {
        try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch (_) {}
    }
    throw new Error('Install kubectl to monitor this cluster.');
}

function currentContext(config) {
    const context = config && (config.contexts || []).find(item => item.name === config['current-context']);
    if (!context) throw new Error('The monitoring kubeconfig has no current context.');
    return context.context;
}

function selectedCluster(config) {
    const context = currentContext(config);
    const cluster = (config.clusters || []).find(item => item.name === context.cluster);
    if (!cluster) throw new Error('The monitoring kubeconfig has no matching cluster.');
    return cluster.cluster;
}

function caData(cluster, sourceDir) {
    if (cluster['certificate-authority-data']) return Buffer.from(cluster['certificate-authority-data'], 'base64');
    if (cluster['certificate-authority']) return fs.readFileSync(path.resolve(sourceDir, cluster['certificate-authority']));
    return null;
}

function resolveAppKubeconfig(dirs, clusterId, clusterSourcePath, connection) {
    for (const name of [`kubeconfig-${clusterId}.yaml`, 'kubeconfig.yaml']) {
        const file = dirs.map(dir => path.join(dir, name)).find(candidate => fs.existsSync(candidate));
        if (file) return file;
    }
    const references = [];
    if (fs.existsSync(clusterSourcePath)) {
        references.push({ cluster: selectedCluster(yaml.load(fs.readFileSync(clusterSourcePath, 'utf8'))), dir: path.dirname(clusterSourcePath) });
    }
    if (connection && connection.content) {
        references.push({ cluster: selectedCluster(yaml.load(connection.content)), dir: path.dirname(connection.kubeconfigPath) });
    }
    const matches = [];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const name of fs.readdirSync(dir).filter(file => /^kubeconfig-\d{8}\.ya?ml$/.test(file))) {
            const file = path.join(dir, name);
            try {
                const candidate = selectedCluster(yaml.load(fs.readFileSync(file, 'utf8')));
                const candidateCA = caData(candidate, dir);
                // Dated configs are legacy aliases only when their API endpoint or CA matches this cluster.
                if (references.some(reference => {
                    const trustedCA = caData(reference.cluster, reference.dir);
                    return new URL(candidate.server).origin === new URL(reference.cluster.server).origin
                        || (candidateCA && trustedCA && candidateCA.length && candidateCA.equals(trustedCA));
                })) matches.push(file);
            } catch (_) {}
        }
    }
    if (matches.length > 1) throw new Error(`Multiple app kubeconfigs match this cluster. Use kubeconfig-${clusterId}.yaml to select one explicitly.`);
    if (matches.length === 1) return matches[0];
    throw new Error('The app monitoring kubeconfig is missing or does not match its assigned cluster.');
}

function appNamespace(app, appDir, context = {}) {
    if (context.namespace) return context.namespace;
    if (app.namespace) return app.namespace;
    const manifestPath = path.join(app.path || appDir, 'app.yaml');
    if (fs.existsSync(manifestPath)) {
        const documents = yaml.loadAll(fs.readFileSync(manifestPath, 'utf8'));
        const workloads = documents.flatMap(item => item && item.kind === 'List' ? item.items || [] : [item]);
        const namespaces = [...new Set(workloads.filter(item => item && /^(Deployment|StatefulSet|DaemonSet|Job|CronJob|Pod)$/.test(item.kind))
            .map(item => item.metadata && item.metadata.namespace).filter(Boolean))];
        if (namespaces.length > 1) throw new Error('App manifests contain multiple namespaces. Select a namespace in the app kubeconfig.');
        if (namespaces.length === 1) return namespaces[0];
    }
    return app.id || path.basename(appDir);
}

function tunnelAppConfig(source, sourceDir, connection) {
    const config = yaml.load(source);
    const context = currentContext(config);
    const cluster = (config.clusters || []).find(item => item.name === context.cluster);
    if (!cluster) throw new Error('The app kubeconfig has no matching cluster.');
    const trusted = yaml.load(connection.content);
    // Use verified cluster TLS settings, but keep the app user and namespace (no privilege escalation).
    cluster.cluster = { ...trusted.clusters[0].cluster };
    return prepareKubeconfig(yaml.dump(config), connection.listener.address().port, sourceDir).content;
}

class ClusterMonitor {
    constructor({ connections, execute = execFile, kubectl = findKubectl, cacheMs = 2000 }) {
        this.connections = connections;
        this.execute = execute;
        this.kubectl = kubectl;
        this.cacheMs = cacheMs;
        this.cache = new Map();
        this.pending = new Map();
        this.active = new Set();
        this.epochs = new Map();
        this.closed = false;
    }

    invalidate(id) {
        this.epochs.set(id, (this.epochs.get(id) || 0) + 1);
        for (const [key, item] of this.cache) if (item.clusterId === id) this.cache.delete(key);
        for (const item of this.active) if (item.clusterId === id) item.abort();
    }

    describe(request, { allowSecondaryCluster = false } = {}) {
        if (!request || !validId(request.clusterId) || !OPERATIONS.has(request.operation)) {
            throw new Error('Invalid monitoring request.');
        }
        const { clusterId, operation, appId, pod } = request;
        const settingsPath = path.join(this.connections.baseDir, '.kenzap', '.config');
        const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
        const knownCluster = clusterId === 'local' ? settings.localClusterEnabled !== false
            : (settings.clusters || []).some(cluster => cluster.id === clusterId);
        if (!knownCluster) throw new Error('Unknown cluster.');
        if ((operation === 'logs' || operation === 'events' || operation === 'pods' || operation === 'topPods') && !appId) {
            throw new Error('Select an app for pod diagnostics.');
        }
        if (appId && (!validId(appId) || !APP_OPERATIONS.has(operation))) throw new Error('Invalid app monitoring request.');
        if (operation === 'logs' && (typeof pod !== 'string' || pod.length > 253 || !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(pod))) {
            throw new Error('Invalid pod name.');
        }
        const transport = clusterId === 'local' ? 'local'
            : this.connections.usesSSHForMonitoring(clusterId) ? 'ssh' : 'direct';
        const connection = this.connections.connections.get(clusterId);
        if (transport === 'ssh' && (!connection || connection.state !== 'connected' || connection.stopped)) {
            const error = new Error('Monitoring paused. Connect this cluster via SSH to read its status and logs.');
            error.code = 'SSH_UNAVAILABLE';
            throw error;
        }
        let sourcePath = path.join(this.connections.baseDir, '.kenzap', `kubeconfig-${clusterId}.yaml`);
        let namespace;
        if (appId) {
            const appDir = path.join(this.connections.baseDir, appId);
            const app = JSON.parse(fs.readFileSync(path.join(appDir, '.kenzap'), 'utf8'));
            if (!app.clusters || !(allowSecondaryCluster ? app.clusters.includes(clusterId) : app.clusters[0] === clusterId)) {
                throw new Error('This app is not assigned to the selected cluster.');
            }
            let context = {};
            if (transport !== 'local') {
                const dirs = [...new Set([app.path || appDir, appDir])];
                sourcePath = resolveAppKubeconfig(dirs, clusterId, sourcePath, connection);
                context = currentContext(yaml.load(fs.readFileSync(sourcePath, 'utf8')));
            }
            namespace = appNamespace(app, appDir, context);
            if (!validNamespace(namespace)) throw new Error('The app monitoring namespace is invalid.');
        }
        return { clusterId, operation, appId, pod, transport, connection, sourcePath, namespace };
    }

    async read(request) {
        if (this.closed) throw new Error('Monitoring is shutting down.');
        const route = this.describe(request);
        const epoch = this.epochs.get(route.clusterId) || 0;
        const key = JSON.stringify([route.clusterId, route.operation, route.appId, route.pod, route.namespace, epoch]);
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.at < this.cacheMs) return cached.value;
        if (this.pending.has(key)) return this.pending.get(key);
        const promise = this.query(route, epoch).then(value => {
            if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value);
            this.cache.set(key, { clusterId: route.clusterId, at: Date.now(), value });
            return value;
        }).finally(() => this.pending.delete(key));
        this.pending.set(key, promise);
        return promise;
    }

    async query(route, epoch) {
        let temporary;
        try {
            const args = route.operation === 'topNodes' ? ['top', 'nodes']
                : route.operation === 'topPods' ? ['top', 'pods']
                : route.operation === 'logs' ? ['logs', route.pod, '--tail=200', '--limit-bytes=262144', '--all-containers=true']
                    : ['get', route.operation, '-o', 'json'];
            if (route.namespace) args.push('--namespace', route.namespace);
            else if (route.operation === 'deployments') args.push('--all-namespaces');
            if (route.transport === 'local') args.push('--context', 'minikube');
            else {
                let kubeconfigPath = route.sourcePath;
                if (route.transport === 'ssh') {
                    if (route.appId) {
                        temporary = fs.mkdtempSync(path.join(this.connections.runtimeDir, 'monitor-'));
                        const content = tunnelAppConfig(fs.readFileSync(route.sourcePath, 'utf8'), path.dirname(route.sourcePath), route.connection);
                        kubeconfigPath = path.join(temporary, 'kubeconfig.yaml');
                        fs.writeFileSync(kubeconfigPath, content, { mode: 0o600 });
                    } else kubeconfigPath = route.connection.kubeconfigPath;
                }
                args.push('--kubeconfig', kubeconfigPath);
            }
            args.push('--request-timeout=12s');
            args.push('--cache-dir', path.join(this.connections.runtimeDir, 'discovery-cache'));
            const env = { ...process.env };
            if (route.transport === 'ssh') {
                for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[name];
            }
            const executable = this.kubectl();
            const output = await new Promise((resolve, reject) => {
                let settled = false;
                const finish = (error, stdout) => {
                    if (settled) return;
                    settled = true;
                    this.active.delete(item);
                    if (error) reject(error); else resolve(stdout);
                };
                const item = { clusterId: route.clusterId, child: null, abort: () => {
                    const error = new Error('Monitoring connection changed. Waiting for a verified SSH connection.');
                    error.code = 'CONNECTION_CHANGED';
                    if (item.child) item.child.kill();
                    finish(error);
                } };
                this.active.add(item);
                try {
                    item.child = this.execute(executable, args, {
                        shell: false, timeout: 15000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', env
                    }, (error, stdout, stderr) => {
                        if (error) finish(new Error(error.killed ? 'Monitoring request timed out.' : (stderr || error.message).trim()));
                        else finish(null, stdout);
                    });
                } catch (error) { finish(error); }
            });
            if ((this.epochs.get(route.clusterId) || 0) !== epoch) throw new Error('Monitoring connection changed. Retry after reconnecting.');
            const data = route.operation === 'logs' || route.operation === 'topNodes' || route.operation === 'topPods' ? output : JSON.parse(output);
            return { data, transport: route.transport, observedAt: Date.now(), namespace: route.namespace || null };
        } finally {
            if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
        }
    }

    close() {
        this.closed = true;
        for (const item of this.active) item.abort();
        this.cache.clear();
    }
}

module.exports = { ClusterMonitor, tunnelAppConfig };
