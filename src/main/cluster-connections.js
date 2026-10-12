'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const https = require('https');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { Client } = require('ssh2');

function prepareKubeconfig(content, localPort, sourceDir) {
    const config = yaml.load(content);
    const context = config && (config.contexts || []).find(item => item.name === config['current-context']);
    const cluster = context && (config.clusters || []).find(item => item.name === context.context.cluster);
    const user = context && (config.users || []).find(item => item.name === context.context.user);
    if (!cluster || !user) throw new Error('Kubeconfig must have a current context, cluster and user.');

    const api = new URL(cluster.cluster.server);
    if (api.protocol !== 'https:') throw new Error('The Kubernetes API must use HTTPS.');
    const connection = cluster.cluster;
    const readData = (object, key) => {
        if (object[key + '-data']) return Buffer.from(object[key + '-data'], 'base64');
        if (object[key]) return fs.readFileSync(path.resolve(sourceDir, object[key]));
        return undefined;
    };
    const ca = readData(connection, 'certificate-authority');
    if (!ca) throw new Error('A Kubernetes CA certificate is required. Refresh the cluster kubeconfig first.');
    const credentials = user.user;
    const cert = readData(credentials, 'client-certificate');
    const key = readData(credentials, 'client-key');
    if (!(cert && key) && !credentials.token) {
        throw new Error('This connection requires a client certificate or token kubeconfig.');
    }
    const tlsName = connection['tls-server-name'] || api.hostname.replace(/^\[|\]$/g, '');
    connection.server = `https://127.0.0.1:${localPort}`;
    connection['tls-server-name'] = tlsName;
    connection['certificate-authority-data'] = ca.toString('base64');
    delete connection['certificate-authority'];
    delete connection['insecure-skip-tls-verify'];
    delete connection['proxy-url'];
    if (cert) credentials['client-certificate-data'] = cert.toString('base64');
    if (key) credentials['client-key-data'] = key.toString('base64');
    delete credentials['client-certificate'];
    delete credentials['client-key'];
    // Export only the selected context, so other cluster credentials do not leak into exports.
    config.clusters = [cluster];
    config.contexts = [context];
    config.users = [user];
    return {
        content: yaml.dump(config),
        target: { host: api.hostname.replace(/^\[|\]$/g, ''), port: Number(api.port || 443) },
        tls: { ca, cert, key, tlsName, token: credentials.token }
    };
}

function probeApi(port, tls) {
    return new Promise((resolve, reject) => {
        // tls.checkServerIdentity handles both DNS names and IP certificate SANs.
        const request = https.get({
            hostname: '127.0.0.1', port, path: '/version', ca: tls.ca,
            cert: tls.cert, key: tls.key,
            servername: net.isIP(tls.tlsName) ? undefined : tls.tlsName,
            checkServerIdentity: (_, certificate) => require('tls').checkServerIdentity(tls.tlsName, certificate),
            headers: tls.token ? { Authorization: `Bearer ${tls.token}` } : {},
            agent: false, rejectUnauthorized: true
        }, response => {
            response.resume();
            if (response.statusCode >= 200 && response.statusCode < 300) resolve();
            else reject(new Error(`Kubernetes API returned HTTP ${response.statusCode}. Check the kubeconfig permissions.`));
        });
        request.setTimeout(10000, () => request.destroy(new Error('Kubernetes API connection timed out.')));
        request.on('error', reject);
    });
}

class ClusterConnections {
    constructor({ baseDir, runtimeDir, confirmHost, onStatus = () => {}, SSHClient = Client, probe = probeApi }) {
        this.baseDir = baseDir;
        this.runtimeDir = runtimeDir;
        this.confirmHost = confirmHost;
        this.onStatus = onStatus;
        this.SSHClient = SSHClient;
        this.probe = probe;
        this.connections = new Map();
        this.closed = false;
        fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
        this.pinsPath = path.join(runtimeDir, 'ssh-hosts.json');
        this.pins = fs.existsSync(this.pinsPath) ? JSON.parse(fs.readFileSync(this.pinsPath, 'utf8')) : {};
        this.monitoringPath = path.join(runtimeDir, 'monitoring-ssh.json');
        this.sshMonitoring = new Set(fs.existsSync(this.monitoringPath)
            ? JSON.parse(fs.readFileSync(this.monitoringPath, 'utf8')) : []);
        this.autoConnectPath = path.join(runtimeDir, 'auto-connect.json');
        // Migrate existing SSH preferences once; future manual disconnects remain disabled.
        this.autoConnect = new Set(fs.existsSync(this.autoConnectPath)
            ? JSON.parse(fs.readFileSync(this.autoConnectPath, 'utf8')) : this.sshMonitoring);
        this.saveAutoConnect();
    }

    status(entry) {
        return { id: entry.id, state: entry.state, error: entry.error || '',
            autoConnect: this.autoConnect.has(entry.id),
            kubeconfigPath: entry.state === 'connected' ? entry.kubeconfigPath : null };
    }

    list(includePreferences = false) {
        const statuses = [...this.connections.values()].map(entry => this.status(entry));
        if (includePreferences) {
            for (const id of this.sshMonitoring) {
                if (!this.connections.has(id)) statuses.push({ id, state: 'disconnected', error: '',
                    autoConnect: this.autoConnect.has(id), kubeconfigPath: null });
            }
        }
        return statuses;
    }

    usesSSHForMonitoring(id) { return this.sshMonitoring.has(id); }

    saveAutoConnect() {
        fs.writeFileSync(this.autoConnectPath, JSON.stringify([...this.autoConnect]), { mode: 0o600 });
    }

    setAutoConnect(id, enabled) {
        if (enabled === this.autoConnect.has(id)) return;
        if (enabled) this.autoConnect.add(id); else this.autoConnect.delete(id);
        this.saveAutoConnect();
    }

    restore() {
        if (this.closed) return Promise.resolve([]);
        if (!this.restorePromise) this.restorePromise = this.restoreSavedConnections();
        return this.restorePromise;
    }

    async restoreSavedConnections() {
        const settingsPath = path.join(this.baseDir, '.kenzap', '.config');
        if (!fs.existsSync(settingsPath)) return [];
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const clusters = new Set((settings.clusters || []).map(cluster => cluster.id));
        for (const id of this.autoConnect) {
            if (!clusters.has(id) || id === 'local') this.setAutoConnect(id, false);
        }
        // A failed cluster must not block another cluster or the app's startup.
        return Promise.allSettled([...this.autoConnect].map(id => Promise.resolve().then(() => {
            if (this.closed || !this.autoConnect.has(id)) return null;
            return this.connect(id, { automatic: true });
        })));
    }

    update(entry, state, error = '') {
        entry.state = state;
        entry.error = error;
        this.onStatus(this.status(entry));
    }

    connect(id, { automatic = false } = {}) {
        if (this.closed) return Promise.reject(new Error('Connection manager is shutting down.'));
        if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id) || id === 'local') {
            return Promise.reject(new Error('Choose a remote cluster.'));
        }
        const current = this.connections.get(id);
        if (current && current.pending) return current.pending;
        if (current && current.state === 'connected') return Promise.resolve(this.status(current));
        if (current) this.disconnect(id, { preservePreference: true });
        const settings = JSON.parse(fs.readFileSync(path.join(this.baseDir, '.kenzap', '.config'), 'utf8'));
        const cluster = (settings.clusters || []).find(item => item.id === id);
        const server = cluster && cluster.servers && cluster.servers[0];
        if (!server || !server.server || !server.username || !server.key) {
            return Promise.reject(new Error('Configure a server, SSH username and SSH key for this cluster first.'));
        }
        // Once SSH is selected, monitoring must never silently fall back to the public API.
        this.sshMonitoring.add(id);
        fs.writeFileSync(this.monitoringPath, JSON.stringify([...this.sshMonitoring]), { mode: 0o600 });
        const entry = { id, server, automatic, state: 'connecting', sockets: new Set(), attempt: 0, stopped: false };
        this.connections.set(id, entry);
        entry.pending = this.open(entry).then(() => this.status(entry)).catch(error => {
            if (!entry.stopped) {
                this.release(entry);
                this.update(entry, 'error', error.message);
            }
            throw error;
        }).finally(() => { entry.pending = null; });
        return entry.pending;
    }

    async verifyHost(entry, key) {
        const endpoint = `${entry.server.server}:${Number(entry.server.port || 22)}`;
        const fingerprint = 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
        if (this.pins[endpoint]) {
            if (this.pins[endpoint] !== fingerprint) {
                entry.hostRejected = true;
                entry.error = 'SSH host key changed. Verify the server identity before reconnecting.';
                return false;
            }
            return true;
        }
        if (entry.automatic) {
            entry.hostRejected = true;
            entry.error = 'SSH server identity needs verification. Choose Connect via SSH to trust this server first.';
            return false;
        }
        this.update(entry, 'verifying');
        if (!await this.confirmHost({ endpoint, fingerprint }) || entry.stopped) {
            entry.hostRejected = true;
            entry.error = 'SSH server identity was not trusted.';
            return false;
        }
        this.pins[endpoint] = fingerprint;
        fs.writeFileSync(this.pinsPath, JSON.stringify(this.pins, null, 2), { mode: 0o600 });
        return true;
    }

    async open(entry) {
        this.update(entry, entry.attempt ? 'reconnecting' : 'connecting');
        const client = new this.SSHClient();
        entry.client = client;
        entry.sshReady = false;
        await new Promise((resolve, reject) => {
            let ready = false;
            client.once('ready', () => { ready = true; entry.sshReady = true; resolve(); });
            client.on('error', error => {
                if (!ready) reject(new Error(entry.error || error.message));
                else entry.error = error.message;
            });
            client.once('close', () => {
                entry.sshReady = false;
                if (!ready) reject(new Error(entry.error || 'SSH connection closed before authentication.'));
                if (entry.state === 'connected' && !entry.stopped) this.retry(entry);
            });
            client.connect({
                host: entry.server.server, port: Number(entry.server.port || 22), username: entry.server.username,
                privateKey: fs.readFileSync(entry.server.key), readyTimeout: 60000,
                keepaliveInterval: 15000, keepaliveCountMax: 3,
                hostVerifier: (key, callback) => {
                    this.verifyHost(entry, key).then(callback, () => callback(false));
                }
            });
        });
        if (entry.stopped) throw new Error('Connection cancelled.');

        if (!entry.listener) {
            const sourcePath = path.join(this.baseDir, '.kenzap', `kubeconfig-${entry.id}.yaml`);
            let content = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
            try { prepareKubeconfig(content, 1, path.dirname(sourcePath)); }
            catch (_) { content = await this.fetchKubeconfig(client); }
            if (entry.stopped) throw new Error('Connection cancelled.');
            entry.listener = net.createServer(socket => {
                if (!entry.sshReady || entry.stopped) { socket.destroy(); return; }
                entry.sockets.add(socket);
                socket.on('error', () => socket.destroy());
                socket.once('close', () => entry.sockets.delete(socket));
                try {
                    entry.client.forwardOut('127.0.0.1', socket.remotePort || 0, entry.target.host, entry.target.port, (error, channel) => {
                        if (error || entry.stopped || socket.destroyed) { socket.destroy(); if (channel) channel.destroy(); return; }
                        channel.on('error', () => socket.destroy());
                        channel.once('close', () => socket.destroy());
                        socket.once('close', () => channel.destroy());
                        socket.pipe(channel).pipe(socket);
                    });
                } catch (_) { socket.destroy(); }
            });
            await new Promise((resolve, reject) => {
                entry.listener.once('error', reject);
                entry.listener.listen(0, '127.0.0.1', resolve);
            });
            if (entry.stopped) { entry.listener.close(); throw new Error('Connection cancelled.'); }
            entry.listener.on('error', error => { entry.error = error.message; });
            const prepared = prepareKubeconfig(content, entry.listener.address().port, path.dirname(sourcePath));
            entry.target = prepared.target;
            entry.tls = prepared.tls;
            entry.content = prepared.content;
            entry.kubeconfigPath = path.join(this.runtimeDir, `kubeconfig-${entry.id}.yaml`);
        }
        // Allow the readiness probe to use the tunnel before announcing connection success.
        entry.state = 'connecting';
        await this.probe(entry.listener.address().port, entry.tls);
        if (entry.stopped) throw new Error('Connection cancelled.');
        fs.writeFileSync(entry.kubeconfigPath, entry.content, { mode: 0o600 });
        this.setAutoConnect(entry.id, true);
        entry.attempt = 0;
        this.update(entry, 'connected');
    }

    fetchKubeconfig(client) {
        return new Promise((resolve, reject) => {
            client.exec('microk8s config', (error, stream) => {
                if (error) { reject(error); return; }
                let content = '';
                const timer = setTimeout(() => { stream.destroy(); reject(new Error('Reading MicroK8s kubeconfig timed out.')); }, 15000);
                stream.on('data', data => {
                    content += data.toString();
                    if (content.length > 1024 * 1024) { stream.destroy(); reject(new Error('Kubeconfig exceeds size limit.')); }
                });
                stream.stderr.on('data', () => {});
                stream.once('error', error => { clearTimeout(timer); reject(error); });
                stream.once('close', code => {
                    clearTimeout(timer);
                    if (code !== 0) reject(new Error('Cannot read MicroK8s kubeconfig. The SSH user needs permission to run microk8s config.'));
                    else resolve(content);
                });
            });
        });
    }

    retry(entry) {
        for (const socket of entry.sockets) socket.destroy();
        entry.attempt += 1;
        this.update(entry, 'reconnecting', entry.error || 'SSH connection interrupted.');
        entry.timer = setTimeout(() => {
            if (entry.stopped) return;
            this.open(entry).catch(error => {
                entry.client.destroy();
                if (entry.stopped) return;
                if (entry.hostRejected) { this.release(entry); this.update(entry, 'error', error.message); }
                else { entry.error = error.message; this.retry(entry); }
            });
        }, Math.min(30000, 1000 * Math.pow(2, Math.min(entry.attempt - 1, 5))));
    }

    release(entry) {
        entry.stopped = true;
        entry.sshReady = false;
        clearTimeout(entry.timer);
        for (const socket of entry.sockets) socket.destroy();
        if (entry.listener) entry.listener.close();
        if (entry.client) entry.client.destroy();
        if (entry.kubeconfigPath && fs.existsSync(entry.kubeconfigPath)) fs.unlinkSync(entry.kubeconfigPath);
    }

    disconnect(id, { preservePreference = false } = {}) {
        if (!preservePreference) this.setAutoConnect(id, false);
        const entry = this.connections.get(id);
        if (!entry) return;
        this.release(entry);
        this.update(entry, 'disconnected');
        this.connections.delete(id);
    }

    close() {
        this.closed = true;
        for (const id of this.connections.keys()) this.disconnect(id, { preservePreference: true });
    }
}

module.exports = { ClusterConnections, prepareKubeconfig, probeApi };
