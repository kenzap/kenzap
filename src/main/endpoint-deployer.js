'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execFile } = require('child_process');
const { EndpointState, resourceKey } = require('../assets/js/endpoint-state');
const { tunnelAppConfig } = require('./cluster-monitor');

const NAMESPACED_RESOURCES = new Set(['v1/Service', 'v1/ConfigMap', 'v1/Secret', 'v1/Endpoints',
    'networking.k8s.io/v1/Ingress', 'networking.k8s.io/v1/NetworkPolicy',
    'discovery.k8s.io/v1/EndpointSlice', 'cert-manager.io/v1/Certificate', 'cert-manager.io/v1/Issuer']);

class EndpointDeployer {
    constructor({ monitor, execute = execFile }) {
        this.monitor = monitor;
        this.execute = execute;
        this.pending = new Set();
        this.active = new Set();
        this.closed = false;
    }

    invalidate(clusterId) {
        for (const item of this.active) if (item.clusterId === clusterId) item.abort();
    }

    async deploy(appId) {
        if (this.closed) throw new Error('Endpoint deployment is shutting down.');
        if (typeof appId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(appId)) throw new Error('Invalid app.');
        if (this.pending.has(appId)) throw new Error('Endpoint deployment is already running for this app.');
        this.pending.add(appId);
        try {
            const connections = this.monitor.connections;
            const appDir = path.join(connections.baseDir, appId);
            const app = JSON.parse(fs.readFileSync(path.join(appDir, '.kenzap'), 'utf8'));
            if (!app.clusters || !app.clusters.length) throw new Error('Assign a cluster before deploying endpoints.');
            const store = new EndpointState(app.path || appDir, app);
            const { resources, state } = store.read();
            const manifest = fs.readFileSync(store.manifestPath, 'utf8');
            const stateContent = fs.existsSync(store.statePath) ? fs.readFileSync(store.statePath, 'utf8') : null;
            if (Buffer.byteLength(manifest) > 4 * 1024 * 1024) throw new Error('The endpoint manifest exceeds the deployment size limit.');
            const activeKeys = new Set(resources.map(resourceKey));
            const removed = state.pendingDeletes.filter(resource => !activeKeys.has(resourceKey(resource)));
            if (removed.some(resource => !['Service', 'Ingress'].includes(resource.kind))) {
                throw new Error('Only removed Services and Ingresses can be deleted by endpoint saving.');
            }
            if (resources.some(resource => !NAMESPACED_RESOURCES.has(`${resource.apiVersion}/${resource.kind}`))) {
                throw new Error('Endpoint saving only deploys supported namespaced endpoint resources. Cluster-wide resources must be deployed separately.');
            }
            // Resolve every target before changing any cluster, using app credentials and the verified route.
            const routes = [...new Set(app.clusters)].map(clusterId => this.monitor.describe(
                { clusterId, appId, operation: 'deployments' }, { allowSecondaryCluster: true }));
            for (const route of routes) {
                for (const resource of [...resources, ...removed]) {
                    const metadata = resource.metadata || {};
                    if (!resource.apiVersion || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(resource.kind)
                        || !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(metadata.name || '')
                        || (metadata.namespace && metadata.namespace !== route.namespace)) {
                        throw new Error('Endpoint resources must have valid names and belong to the app monitoring namespace.');
                    }
                }
            }
            for (const route of routes) await this.apply(route, resources, removed);
            // Do not acknowledge a newer save that happened while this snapshot was deploying.
            if (fs.readFileSync(store.manifestPath, 'utf8') !== manifest
                || (fs.existsSync(store.statePath) ? fs.readFileSync(store.statePath, 'utf8') : null) !== stateContent) {
                throw new Error('Endpoints changed during deployment. Save again to deploy the latest version.');
            }
            if (stateContent !== null) store.writeAtomic(store.statePath, JSON.stringify({ ...state, pendingDeletes: [] }, null, 2));
            return { clusters: routes.map(route => ({ id: route.clusterId, transport: route.transport })) };
        } finally { this.pending.delete(appId); }
    }

    async apply(route, resources, removed) {
        let temporary;
        try {
            const connections = this.monitor.connections;
            const flags = ['--namespace', route.namespace, '--request-timeout=30s', '--cache-dir', path.join(connections.runtimeDir, 'discovery-cache')];
            if (route.transport === 'local') flags.push('--context', 'minikube');
            else {
                let kubeconfigPath = route.sourcePath;
                if (route.transport === 'ssh') {
                    temporary = fs.mkdtempSync(path.join(connections.runtimeDir, 'endpoints-'));
                    kubeconfigPath = path.join(temporary, 'kubeconfig.yaml');
                    const content = tunnelAppConfig(fs.readFileSync(route.sourcePath, 'utf8'), path.dirname(route.sourcePath), route.connection);
                    fs.writeFileSync(kubeconfigPath, content, { mode: 0o600 });
                }
                flags.push('--kubeconfig', kubeconfigPath);
            }
            if (resources.length) await this.run(route, ['apply', '-f', '-', ...flags], resources.map(resource => yaml.dump(resource)).join('---\n'));
            for (const resource of removed) {
                await this.run(route, ['delete', resource.kind.toLowerCase(), resource.metadata.name,
                    '--ignore-not-found=true', ...flags]);
            }
        } finally { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
    }

    run(route, args, input) {
        if (this.closed || (route.transport === 'ssh' && (route.connection.stopped || route.connection.state !== 'connected'))) {
            return Promise.reject(new Error('Endpoint deployment paused. Reconnect the cluster via SSH and save again.'));
        }
        const env = { ...process.env };
        if (route.transport === 'ssh') {
            for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[name];
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error, output) => {
                if (settled) return;
                settled = true;
                this.active.delete(item);
                if (error) reject(error); else resolve(output);
            };
            const item = { clusterId: route.clusterId, child: null, abort: () => {
                if (item.child) item.child.kill();
                finish(new Error('Endpoint deployment interrupted by a connection change. Reconnect and save again.'));
            } };
            this.active.add(item);
            try {
                item.child = this.execute(this.monitor.kubectl(), args, {
                    shell: false, timeout: 45000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', env
                }, (error, stdout, stderr) => finish(error ? new Error((stderr || error.message).trim()) : null, stdout));
                if (item.child.stdin) {
                    item.child.stdin.on('error', error => { item.child.kill(); finish(error); });
                    item.child.stdin.end(input || '');
                }
            } catch (error) { finish(error); }
        });
    }

    close() {
        this.closed = true;
        for (const item of this.active) item.abort();
    }
}

module.exports = { EndpointDeployer };
