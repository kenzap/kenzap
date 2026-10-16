'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { execFile } = require('child_process');
const { buildWorkspace } = require('./app-workspace');

class AppCreator {
    constructor({ monitor, templatesDir, execute = execFile, onUpdate = () => {}, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
        validateCertificate = (certificate, key) => new crypto.X509Certificate(certificate).checkPrivateKey(crypto.createPrivateKey(key)) }) {
        Object.assign(this, { monitor, templatesDir, execute, onUpdate, sleep, validateCertificate });
        this.jobs = new Map();
    }

    check(job) {
        if (this.closed || job.aborted) throw new Error('App creation stopped. Reconnect and try again.');
        const route = job.route;
        if (route.transport === 'ssh' && (route.connection.state !== 'connected' || route.connection.stopped
            || this.monitor.connections.connections.get(route.clusterId) !== route.connection)) throw new Error('SSH disconnected during app creation. Reconnect before retrying.');
    }

    progress(job, message) { this.onUpdate({ appId: job.app.id, message }); }

    command(job, executable, args, input = '') {
        this.check(job);
        return new Promise((resolve, reject) => {
            const child = this.execute(executable, args, { shell: false, timeout: 20000, maxBuffer: 4 * 1024 * 1024,
                encoding: 'utf8', env: job.env }, (error, stdout, stderr) => {
                job.child = null;
                try { this.check(job); } catch (changed) { reject(changed); return; }
                if (error) reject(new Error((stderr || error.message).trim())); else resolve(stdout);
            });
            job.child = child;
            if (child.stdin) { child.stdin.on('error', () => {}); child.stdin.end(input); }
        });
    }

    kubectl(job, args, input = '', flags = job.flags) {
        return this.command(job, this.monitor.kubectl(), [...args, ...flags, '--request-timeout=15s'], input);
    }

    async create(request) {
        if (this.closed) throw new Error('App creation is shutting down.');
        const input = request || {}, id = input.namespace;
        if (typeof id !== 'string' || id.length > 63 || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(id)
            || /^(?:default|kube-.+|local)$/.test(id)) throw new Error('Choose a unique lowercase app namespace (up to 63 characters).');
        if (this.jobs.has(id)) throw new Error('This app is already being created.');
        if (typeof input.title !== 'string' || input.title.trim().length < 2 || input.title.length > 100) throw new Error('Enter an app name between 2 and 100 characters.');
        if (!Array.isArray(input.clusters) || input.clusters.length !== 1) throw new Error('Select one cluster for the new app.');
        const route = this.monitor.describe({ clusterId: input.clusters[0], operation: 'nodes' });
        const appDir = path.join(this.monitor.connections.baseDir, id);
        if (fs.existsSync(appDir)) throw new Error('An app or folder with this name already exists. Choose another name; existing files will not be overwritten.');
        const registry = input.registry || {};
        if (typeof registry.domain !== 'string' || typeof registry.user !== 'string' || typeof registry.pass !== 'string'
            || !!registry.user !== !!registry.pass) throw new Error('Provide both registry username and password, or leave both blank.');
        const app = { id, slug: id, namespace: id, title: input.title.trim(), image: input.image, image_id: input.image_id,
            icon: typeof input.icon === 'string' ? input.icon : '', project: typeof input.project === 'string' ? input.project : '',
            description: '', keywords: '', ui: '', path: appDir, clusters: input.clusters.slice(), registry: { ...registry },
            status: 'unpublished', dnsManaged: false, new: true, platform: input.platform || 'linux/amd64', dockerfiles: input.dockerfiles || [] };
        if (!['linux/amd64', 'linux/arm64'].includes(app.platform)) throw new Error('Select a supported cluster architecture.');
        const job = { app, route, env: { ...process.env }, flags: [], namespaceCreated: false, filesCommitted: false };
        this.jobs.set(id, job);
        try {
            job.temporary = fs.mkdtempSync(path.join(this.monitor.connections.runtimeDir, 'create-'));
            job.workspace = path.join(job.temporary, 'workspace'); fs.mkdirSync(job.workspace, { mode: 0o700 });
            if (route.transport === 'local') job.flags = ['--context', 'minikube'];
            else {
                const raw = yaml.load(fs.readFileSync(route.sourcePath, 'utf8'));
                const context = (raw.contexts || []).find(item => item.name === raw['current-context']);
                const cluster = context && (raw.clusters || []).find(item => item.name === context.context.cluster);
                if (!cluster || !cluster.cluster.server.startsWith('https://')) throw new Error('The cluster must have a valid HTTPS kubeconfig.');
                const selected = route.transport === 'ssh' ? yaml.load(route.connection.content).clusters[0].cluster : cluster.cluster;
                const ca = selected['certificate-authority-data'] || cluster.cluster['certificate-authority-data']
                    || (cluster.cluster['certificate-authority'] && fs.readFileSync(path.resolve(path.dirname(route.sourcePath), cluster.cluster['certificate-authority'])).toString('base64'));
                if (!ca) throw new Error('Refresh the cluster kubeconfig with its CA certificate before creating apps.');
                job.appCluster = { server: cluster.cluster.server, 'certificate-authority-data': ca,
                    'tls-server-name': selected['tls-server-name'] || new URL(cluster.cluster.server).hostname };
                const admin = route.transport === 'ssh' ? route.connection.kubeconfigPath : route.sourcePath;
                job.flags = ['--kubeconfig', admin, '--context', route.transport === 'ssh' ? yaml.load(route.connection.content)['current-context'] : raw['current-context']];
                if (route.transport === 'ssh') job.env.NO_PROXY = job.env.no_proxy = '127.0.0.1,localhost,::1,' + (job.env.NO_PROXY || '');
            }
            const settingsFile = path.join(this.monitor.connections.baseDir, '.kenzap', '.config');
            const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
            this.progress(job, 'Preparing application files...');
            buildWorkspace({ directory: job.workspace, app, templatesDir: this.templatesDir, settings, variables: input.variables });
            // Read before create: never adopt, clear, or delete an existing namespace.
            const namespace = await this.kubectl(job, ['get', 'namespace', id, '--ignore-not-found', '-o', 'json']);
            if (namespace.trim()) throw new Error('This namespace already exists. Choose another name; existing workloads will not be changed.');
            let user, key, csr;
            if (route.transport !== 'local') {
                this.progress(job, 'Preparing app credentials...');
                const openssl = ['/usr/bin/openssl', '/opt/homebrew/bin/openssl', '/usr/local/bin/openssl'].find(file => {
                    try { fs.accessSync(file, fs.constants.X_OK); return true; } catch (_) { return false; }
                });
                if (!openssl) throw new Error('Install OpenSSL to create app certificates.');
                user = 'kenzap-app-' + crypto.randomUUID();
                key = await new Promise((resolve, reject) => crypto.generateKeyPair('rsa', { modulusLength: 2048,
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' }
                }, (error, publicKey, privateKey) => error ? reject(error) : resolve(privateKey)));
                this.check(job);
                const keyPath = path.join(job.temporary, 'app.key'); fs.writeFileSync(keyPath, key, { mode: 0o600 });
                csr = await this.command(job, openssl, ['req', '-new', '-key', keyPath, '-subj', '/CN=' + user]);
            }
            this.progress(job, 'Creating a new namespace...');
            await this.kubectl(job, ['create', '-f', '-'], yaml.dump({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: id, labels: { 'app.kubernetes.io/managed-by': 'kenzap' } } }));
            job.namespaceCreated = true;
            if (route.transport !== 'local') {
                this.progress(job, 'Creating namespace-scoped app credentials...');
                job.csrName = user;
                await this.kubectl(job, ['create', '-f', '-'], yaml.dump({ apiVersion: 'certificates.k8s.io/v1', kind: 'CertificateSigningRequest', metadata: { name: user },
                    spec: { request: Buffer.from(csr).toString('base64'), signerName: 'kubernetes.io/kube-apiserver-client', expirationSeconds: 31536000,
                        usages: ['digital signature', 'key encipherment', 'client auth'] } }));
                await this.kubectl(job, ['certificate', 'approve', user]);
                let certificate = '';
                for (let attempt = 0; attempt < 20 && !certificate; attempt++) {
                    const signed = JSON.parse(await this.kubectl(job, ['get', 'csr', user, '-o', 'json']));
                    if ((signed.status && signed.status.conditions || []).some(condition => ['Denied', 'Failed'].includes(condition.type))) throw new Error('The cluster rejected the app certificate request.');
                    certificate = signed.status && signed.status.certificate || '';
                    if (!certificate) await this.sleep(500);
                }
                if (!certificate || !this.validateCertificate(Buffer.from(certificate, 'base64'), key)) throw new Error('The cluster did not issue a valid app certificate. Check certificate-signing permissions and retry with a new app name.');
                const role = { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role', metadata: { name: 'kenzap-app', namespace: id }, rules: [
                    { apiGroups: [''], resources: ['pods', 'pods/log', 'pods/exec', 'pods/portforward', 'services', 'endpoints', 'configmaps', 'secrets', 'persistentvolumeclaims', 'serviceaccounts', 'events'], verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'] },
                    { apiGroups: ['apps', 'batch', 'networking.k8s.io', 'autoscaling', 'policy'], resources: ['deployments', 'replicasets', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs', 'ingresses', 'networkpolicies', 'horizontalpodautoscalers', 'poddisruptionbudgets'], verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'] },
                    { apiGroups: ['metrics.k8s.io'], resources: ['pods'], verbs: ['get', 'list'] }
                ] };
                const binding = { apiVersion: role.apiVersion, kind: 'RoleBinding', metadata: { name: 'kenzap-app', namespace: id }, subjects: [{ kind: 'User', name: user, apiGroup: 'rbac.authorization.k8s.io' }], roleRef: { kind: 'Role', name: 'kenzap-app', apiGroup: 'rbac.authorization.k8s.io' } };
                await this.kubectl(job, ['create', '-f', '-'], [role, binding].map(doc => yaml.dump(doc)).join('---\n'));
                const context = 'app-' + id;
                const config = { apiVersion: 'v1', kind: 'Config', 'current-context': context, clusters: [{ name: 'cluster', cluster: job.appCluster }],
                    users: [{ name: user, user: { 'client-certificate-data': certificate, 'client-key-data': Buffer.from(key).toString('base64') } }],
                    contexts: [{ name: context, context: { cluster: 'cluster', user, namespace: id } }] };
                fs.writeFileSync(path.join(job.workspace, `kubeconfig-${route.clusterId}.yaml`), yaml.dump(config), { mode: 0o600 });
                // This unique CSR belongs to this creation only; existing CSRs are never touched.
                await this.kubectl(job, ['delete', 'csr', user, '--ignore-not-found']); job.csrName = null;
            }
            this.check(job);
            this.progress(job, 'Saving the app. Publish will build and deploy it.');
            fs.mkdirSync(appDir, { mode: 0o700 }); job.filesCommitted = true;
            for (const file of fs.readdirSync(job.workspace)) fs.renameSync(path.join(job.workspace, file), path.join(appDir, file));
            fs.writeFileSync(path.join(appDir, '.kenzap'), JSON.stringify(app), { mode: 0o600 });
            return app;
        } catch (error) {
            let message = error.message;
            for (const secret of [registry.pass, ...((adminConfigSafe(job) || []))]) if (secret) message = message.split(secret).join('[redacted]');
            if (job.namespaceCreated) message += ` Namespace "${id}" was created but was not deleted. No existing workloads were removed. Choose a new name or ask an administrator to inspect that namespace before retrying.`;
            throw new Error(message);
        } finally {
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
            this.jobs.delete(id);
        }
    }

    invalidate(clusterId) {
        for (const job of this.jobs.values()) if (job.route.clusterId === clusterId && job.route.transport === 'ssh') {
            job.aborted = true; if (job.child) job.child.kill();
        }
    }

    close() {
        this.closed = true;
        for (const job of this.jobs.values()) {
            job.aborted = true; if (job.child) job.child.kill();
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
        }
    }
}

function adminConfigSafe(job) {
    try {
        const config = yaml.load(fs.readFileSync(job.route.transport === 'ssh' ? job.route.connection.kubeconfigPath : job.route.sourcePath, 'utf8'));
        return (config.users || []).flatMap(user => Object.values(user.user || {}).filter(value => typeof value === 'string'));
    } catch (_) { return []; }
}

module.exports = { AppCreator };
