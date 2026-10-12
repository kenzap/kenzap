'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');
const { ClusterConnections, prepareKubeconfig } = require('../src/main/cluster-connections');
const { ClusterMonitor } = require('../src/main/cluster-monitor');

let certificateDir, certificate, privateKey;
before(() => {
    certificateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-test-cert-'));
    fs.writeFileSync(path.join(certificateDir, 'openssl.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=kubernetes.internal\n[ext]\nsubjectAltName=DNS:kubernetes.internal\nbasicConstraints=critical,CA:TRUE\n');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-config', path.join(certificateDir, 'openssl.cnf'), '-keyout', path.join(certificateDir, 'key.pem'),
        '-out', path.join(certificateDir, 'cert.pem')], { stdio: 'ignore' });
    certificate = fs.readFileSync(path.join(certificateDir, 'cert.pem'));
    privateKey = fs.readFileSync(path.join(certificateDir, 'key.pem'));
});
after(() => fs.rmSync(certificateDir, { recursive: true, force: true }));

function config(port) {
    return {
        apiVersion: 'v1', kind: 'Config', 'current-context': 'monitor',
        clusters: [{ name: 'test', cluster: { server: `https://127.0.0.1:${port}`,
            'tls-server-name': 'kubernetes.internal', 'certificate-authority-data': certificate.toString('base64') } }],
        users: [{ name: 'reader', user: { token: 'test-token' } }],
        contexts: [{ name: 'monitor', context: { cluster: 'test', user: 'reader', namespace: 'app' } }]
    };
}

async function fixture(t, { trusted = true, accept = true, wrongName = false, rawConfig = false, monitoring = false } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-ssh-test-'));
    const requests = [];
    const api = https.createServer({ cert: certificate, key: privateKey }, (request, response) => {
        if (monitoring) {
            const url = new URL(request.url, 'https://api.test');
            requests.push({ path: url.pathname, authorization: request.headers.authorization });
            if (!['Bearer test-token', 'Bearer app-token'].includes(request.headers.authorization)) {
                response.writeHead(401); response.end(); return;
            }
            const resource = (name, kind, namespaced) => ({ name, singularName: name.slice(0, -1), kind, namespaced, verbs: ['get', 'list'] });
            const pod = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'demo-pod', namespace: 'app' },
                spec: { containers: [{ name: 'app', image: 'app:v1' }] }, status: { phase: 'Running' } };
            const routes = {
                '/version': { major: '1', minor: '31', gitVersion: 'v1.31.0' },
                '/api': { apiVersion: 'v1', kind: 'APIVersions', versions: ['v1'] },
                '/apis': { apiVersion: 'v1', kind: 'APIGroupList', groups: [{ name: 'apps',
                    versions: [{ groupVersion: 'apps/v1', version: 'v1' }], preferredVersion: { groupVersion: 'apps/v1', version: 'v1' } }] },
                '/api/v1': { apiVersion: 'v1', kind: 'APIResourceList', groupVersion: 'v1',
                    resources: [resource('nodes', 'Node', false), resource('pods', 'Pod', true), resource('events', 'Event', true)] },
                '/apis/apps/v1': { apiVersion: 'v1', kind: 'APIResourceList', groupVersion: 'apps/v1', resources: [resource('deployments', 'Deployment', true)] },
                '/api/v1/nodes': { apiVersion: 'v1', kind: 'NodeList', metadata: { resourceVersion: '1' }, items: [{
                    apiVersion: 'v1', kind: 'Node', metadata: { name: 'test-node' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }] },
                '/apis/apps/v1/namespaces/app/deployments': { apiVersion: 'apps/v1', kind: 'DeploymentList', metadata: { resourceVersion: '1' }, items: [{
                    apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'demo', namespace: 'app' } }] },
                '/api/v1/namespaces/app/pods': { apiVersion: 'v1', kind: 'PodList', metadata: { resourceVersion: '1' }, items: [pod] },
                '/api/v1/namespaces/app/pods/demo-pod': pod,
                '/api/v1/namespaces/app/events': { apiVersion: 'v1', kind: 'EventList', metadata: { resourceVersion: '1' }, items: [] }
            };
            if (url.pathname === '/api/v1/namespaces/app/pods/demo-pod/log') {
                response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('test log through SSH\n'); return;
            }
            response.writeHead(routes[url.pathname] ? 200 : 404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify(routes[url.pathname] || { kind: 'Status', apiVersion: 'v1', status: 'Failure', reason: 'NotFound', code: 404 }));
            return;
        }
        response.writeHead(request.headers.authorization === 'Bearer test-token' ? 200 : 401);
        response.end('{"gitVersion":"test"}');
    });
    await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
    const original = config(api.address().port);
    if (wrongName) original.clusters[0].cluster['tls-server-name'] = 'wrong.internal';
    if (rawConfig) delete original.clusters[0].cluster['certificate-authority-data'];
    const baseDir = path.join(directory, 'Kenzap');
    const settingsDir = path.join(baseDir, '.kenzap');
    const runtimeDir = path.join(directory, 'runtime');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.mkdirSync(runtimeDir);
    const keyPath = path.join(directory, 'ssh-key');
    fs.writeFileSync(keyPath, 'test-private-key');
    fs.writeFileSync(path.join(settingsDir, '.config'), JSON.stringify({ clusters: [
        { id: 'test', servers: [{ server: 'server.example', username: 'reader', port: 22, key: keyPath }] }
    ] }));
    const sourcePath = path.join(settingsDir, 'kubeconfig-test.yaml');
    fs.writeFileSync(sourcePath, yaml.dump(original));
    if (!trusted) fs.writeFileSync(path.join(runtimeDir, 'ssh-hosts.json'), JSON.stringify({ 'server.example:22': 'SHA256:other-key' }));
    const clients = [];
    let confirmations = 0;
    class FakeClient extends EventEmitter {
        constructor() { super(); clients.push(this); }
        connect(options) {
            options.hostVerifier(Buffer.from('test-server-key'), accepted => {
                if (this.destroyed) return;
                if (accepted) { this.emit('ready'); }
                else { this.emit('error', new Error('Host verification failed')); this.destroy(); }
            });
        }
        forwardOut(source, sourcePort, host, port, callback) {
            const channel = net.connect(port, host);
            channel.once('connect', () => callback(null, channel));
            channel.once('error', error => callback(error));
        }
        exec(command, callback) {
            assert.equal(command, 'microk8s config');
            const stream = new EventEmitter();
            stream.stderr = new EventEmitter();
            stream.destroy = () => stream.emit('close', 1);
            callback(null, stream);
            setImmediate(() => { stream.emit('data', yaml.dump(config(api.address().port))); stream.emit('close', 0); });
        }
        destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
    }
    const manager = new ClusterConnections({ baseDir, runtimeDir, SSHClient: FakeClient,
        confirmHost: async () => { confirmations += 1; return accept; } });
    t.after(async () => {
        manager.close();
        api.closeAllConnections();
        await new Promise(resolve => api.close(resolve));
        fs.rmSync(directory, { recursive: true, force: true });
    });
    const restart = (options = {}) => {
        manager.close();
        const restored = new ClusterConnections({ baseDir, runtimeDir, SSHClient: FakeClient,
            confirmHost: async () => { confirmations += 1; return accept; }, ...options });
        t.after(() => restored.close());
        return restored;
    };
    return { manager, clients, sourcePath, requests, restart, confirmations: () => confirmations };
}

test('connection verifies API TLS, binds only localhost, and preserves source kubeconfig', async t => {
    const f = await fixture(t);
    const original = fs.readFileSync(f.sourcePath, 'utf8');
    const status = await f.manager.connect('test');
    assert.equal(status.state, 'connected');
    assert.equal(f.confirmations(), 1);
    assert.equal(f.manager.connections.get('test').listener.address().address, '127.0.0.1');
    const runtime = yaml.load(fs.readFileSync(status.kubeconfigPath, 'utf8'));
    assert.equal(runtime.clusters[0].cluster['tls-server-name'], 'kubernetes.internal');
    assert.ok(runtime.clusters[0].cluster['certificate-authority-data']);
    assert.equal(runtime.clusters[0].cluster['insecure-skip-tls-verify'], undefined);
    assert.equal(fs.statSync(status.kubeconfigPath).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), original);
    f.manager.disconnect('test');
    assert.equal(fs.existsSync(status.kubeconfigPath), false);
});

test('simultaneous connect requests share one SSH session', async t => {
    const f = await fixture(t);
    const [first, second] = await Promise.all([f.manager.connect('test'), f.manager.connect('test')]);
    assert.equal(first.kubeconfigPath, second.kubeconfigPath);
    assert.equal(f.clients.length, 1);
});

test('changed SSH host key is rejected without a new trust prompt', async t => {
    const f = await fixture(t, { trusted: false });
    await assert.rejects(f.manager.connect('test'), /host key changed/);
    assert.equal(f.confirmations(), 0);
    assert.equal(f.manager.list()[0].state, 'error');
});

test('declining first-use trust aborts connection', async t => {
    const f = await fixture(t, { accept: false });
    await assert.rejects(f.manager.connect('test'), /not trusted/);
    assert.equal(f.manager.list()[0].kubeconfigPath, null);
});

test('disconnect during host verification cancels work and does not store trust', async t => {
    let finishTrust;
    const trust = new Promise(resolve => { finishTrust = resolve; });
    const f = await fixture(t, { accept: trust });
    const pending = f.manager.connect('test');
    assert.equal(f.manager.list()[0].state, 'verifying');
    f.manager.disconnect('test');
    await assert.rejects(pending, /closed|cancelled/i);
    finishTrust(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.manager.list(), []);
    assert.equal(fs.existsSync(f.manager.pinsPath), false);
    assert.equal(f.clients[0].destroyed, true);
});

test('incorrect Kubernetes certificate name fails closed', async t => {
    const f = await fixture(t, { wrongName: true });
    await assert.rejects(f.manager.connect('test'), /certificate|altnames|Hostname/i);
    assert.equal(f.manager.list()[0].state, 'error');
    assert.equal(f.clients[0].destroyed, true);
    assert.equal(f.manager.autoConnect.has('test'), false);
});

test('successful connections resume after restart without another host trust prompt', async t => {
    const f = await fixture(t);
    const connected = await f.manager.connect('test');
    assert.equal(connected.autoConnect, true);
    assert.equal(fs.statSync(f.manager.autoConnectPath).mode & 0o777, 0o600);
    const restored = f.restart();
    assert.equal(fs.existsSync(connected.kubeconfigPath), false);
    const first = restored.restore();
    assert.equal(restored.restore(), first);
    const results = await first;
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(restored.list()[0].state, 'connected');
    assert.equal(restored.list()[0].autoConnect, true);
    assert.equal(f.confirmations(), 1);
    assert.equal(f.clients.length, 2);
});

test('manual disconnect stays disabled after restart and connecting again re-enables it', async t => {
    const f = await fixture(t);
    await f.manager.connect('test');
    f.manager.disconnect('test');
    assert.deepEqual(JSON.parse(fs.readFileSync(f.manager.autoConnectPath, 'utf8')), []);
    const restored = f.restart();
    assert.deepEqual(await restored.restore(), []);
    assert.equal(f.clients.length, 1);
    assert.equal(restored.usesSSHForMonitoring('test'), true);
    assert.equal(restored.list(true)[0].autoConnect, false);
    await restored.connect('test');
    assert.equal(restored.autoConnect.has('test'), true);
    restored.close();
    const again = f.restart();
    await again.restore();
    assert.equal(again.list()[0].state, 'connected');
    assert.equal(f.confirmations(), 1);
});

test('manual disconnect before startup restoration cancels a saved preference without a session', async t => {
    const f = await fixture(t);
    await f.manager.connect('test');
    const restored = f.restart();
    const pending = restored.restore();
    restored.disconnect('test');
    await pending;
    assert.equal(f.clients.length, 1);
    assert.equal(restored.list(true)[0].state, 'disconnected');
    assert.equal(restored.autoConnect.has('test'), false);
});

test('startup restoration rejects changed host keys without accepting or prompting', async t => {
    const f = await fixture(t);
    await f.manager.connect('test');
    f.manager.close();
    fs.writeFileSync(f.manager.pinsPath, JSON.stringify({ 'server.example:22': 'SHA256:changed' }));
    const restored = f.restart();
    const results = await restored.restore();
    assert.equal(results[0].status, 'rejected');
    assert.match(results[0].reason.message, /host key changed/);
    assert.equal(restored.list()[0].state, 'error');
    assert.equal(restored.list()[0].kubeconfigPath, null);
    assert.equal(f.confirmations(), 1);
    assert.equal(restored.usesSSHForMonitoring('test'), true);
});

test('legacy SSH preferences migrate once and restore already trusted servers', async t => {
    const f = await fixture(t);
    await f.manager.connect('test');
    f.manager.close();
    fs.unlinkSync(f.manager.autoConnectPath);
    const restored = f.restart();
    assert.equal(restored.autoConnect.has('test'), true);
    await restored.restore();
    assert.equal(restored.list()[0].state, 'connected');
    assert.equal(f.confirmations(), 1);
    restored.disconnect('test');
    restored.close();
    const again = f.restart();
    assert.deepEqual(await again.restore(), []);
    assert.equal(again.autoConnect.has('test'), false);
});

test('automatic restoration never prompts for an untrusted or newly configured server', async t => {
    const f = await fixture(t);
    await f.manager.connect('test');
    f.manager.close();
    fs.unlinkSync(f.manager.pinsPath);
    const restored = f.restart();
    const results = await restored.restore();
    assert.equal(results[0].status, 'rejected');
    assert.match(results[0].reason.message, /needs verification/);
    assert.equal(f.confirmations(), 1);
    assert.equal(fs.existsSync(restored.pinsPath), false);
    await restored.connect('test');
    assert.equal(restored.list()[0].state, 'connected');
    assert.equal(f.confirmations(), 2);
});

test('startup restoration forgets removed clusters and never connects Minikube or unselected clusters', async t => {
    const f = await fixture(t);
    await f.manager.connect('test');
    f.manager.close();
    fs.writeFileSync(f.manager.autoConnectPath, JSON.stringify(['test', 'removed', 'local']));
    const settingsPath = path.join(f.manager.baseDir, '.kenzap', '.config');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.clusters.push({ id: 'local' }, { id: 'direct' });
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
    const restored = f.restart();
    await restored.restore();
    assert.deepEqual([...restored.autoConnect], ['test']);
    assert.equal(restored.list().length, 1);
    assert.equal(f.clients.length, 2);
});

test('a failed startup connection does not block another cluster or erase the saved preference', async t => {
    const f = await fixture(t);
    await f.manager.connect('test');
    f.manager.close();
    const settingsPath = path.join(f.manager.baseDir, '.kenzap', '.config');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.clusters.push({ ...settings.clusters[0], id: 'other' });
    settings.clusters[0].servers = [{ ...settings.clusters[0].servers[0], key: '/nonexistent-ssh-key' }];
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
    fs.copyFileSync(f.sourcePath, path.join(path.dirname(f.sourcePath), 'kubeconfig-other.yaml'));
    fs.writeFileSync(f.manager.autoConnectPath, JSON.stringify(['test', 'other']));
    const restored = f.restart();
    const results = await restored.restore();
    assert.deepEqual(results.map(result => result.status), ['rejected', 'fulfilled']);
    assert.equal(restored.list().find(item => item.id === 'test').state, 'error');
    assert.equal(restored.list().find(item => item.id === 'other').state, 'connected');
    assert.ok(restored.autoConnect.has('test'));
    assert.equal(restored.usesSSHForMonitoring('test'), true);
});

test('startup restoration tolerates first launch without settings and shutdown before opening sessions', async t => {
    const f = await fixture(t);
    await f.manager.connect('test');
    const restored = f.restart();
    const pending = restored.restore();
    restored.close();
    await pending;
    assert.equal(f.clients.length, 1);
    assert.ok(restored.autoConnect.has('test'));
    fs.unlinkSync(path.join(restored.baseDir, '.kenzap', '.config'));
    const empty = f.restart();
    assert.deepEqual(await empty.restore(), []);
    assert.equal(f.clients.length, 1);
});

test('missing CA is refreshed through authenticated SSH without altering source', async t => {
    const f = await fixture(t, { rawConfig: true });
    const original = fs.readFileSync(f.sourcePath, 'utf8');
    assert.equal((await f.manager.connect('test')).state, 'connected');
    assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), original);
});

test('reconnect keeps the same tunnel port and reuses pinned host identity', async t => {
    const f = await fixture(t);
    const status = await f.manager.connect('test');
    const content = fs.readFileSync(status.kubeconfigPath, 'utf8');
    f.clients[0].destroy();
    assert.equal(f.manager.list()[0].state, 'reconnecting');
    assert.equal(f.manager.list()[0].kubeconfigPath, null);
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Reconnect timed out')), 5000);
        f.manager.onStatus = state => { if (state.state === 'connected') { clearTimeout(timeout); resolve(); } };
    });
    assert.equal(f.clients.length, 2);
    assert.equal(f.confirmations(), 1);
    assert.equal(fs.readFileSync(status.kubeconfigPath, 'utf8'), content);
});

test('export retains only the selected context and embeds relative certificate files', () => {
    const original = config(16443);
    original.clusters.push({ name: 'unrelated', cluster: { server: 'https://other.example' } });
    original.users.push({ name: 'unrelated', user: { token: 'secret' } });
    delete original.clusters[0].cluster['certificate-authority-data'];
    original.clusters[0].cluster['certificate-authority'] = 'cert.pem';
    original.clusters[0].cluster['insecure-skip-tls-verify'] = true;
    const result = prepareKubeconfig(yaml.dump(original), 26443, certificateDir);
    const exported = yaml.load(result.content);
    assert.equal(exported.clusters.length, 1);
    assert.equal(exported.users.length, 1);
    assert.equal(exported.clusters[0].cluster.server, 'https://127.0.0.1:26443');
    assert.equal(exported.clusters[0].cluster['certificate-authority'], undefined);
    assert.equal(exported.contexts[0].context.namespace, 'app');
});

test('real kubectl reads cluster health, app pods, deployments and logs through the tunnel', async t => {
    const kubectl = ['/opt/homebrew/bin/kubectl', '/usr/local/bin/kubectl', '/usr/bin/kubectl'].find(file => fs.existsSync(file));
    if (!kubectl) { t.skip('kubectl is not installed'); return; }
    const f = await fixture(t, { monitoring: true });
    const monitor = new ClusterMonitor({ connections: f.manager, kubectl: () => kubectl });
    t.after(() => monitor.close());
    f.manager.onStatus = status => monitor.invalidate(status.id);
    await f.manager.connect('test');
    // The public source is deliberately unusable. Only the already verified tunnel can work.
    const inaccessible = config(1);
    inaccessible.clusters[0].cluster.server = 'https://public-api.invalid:16443';
    fs.writeFileSync(f.sourcePath, yaml.dump(inaccessible));
    const appDir = path.join(f.manager.baseDir, 'demo');
    fs.mkdirSync(appDir);
    fs.writeFileSync(path.join(appDir, '.kenzap'), JSON.stringify({ clusters: ['test'], slug: 'demo', path: appDir }));
    const appConfig = config(1);
    appConfig.users[0].user.token = 'app-token';
    appConfig.clusters[0].cluster.server = 'https://public-api.invalid:16443';
    fs.writeFileSync(path.join(appDir, 'kubeconfig-test.yaml'), yaml.dump(appConfig));
    const nodes = await monitor.read({ clusterId: 'test', operation: 'nodes' });
    assert.equal(nodes.transport, 'ssh');
    assert.equal(nodes.data.items[0].metadata.name, 'test-node');
    const deployments = await monitor.read({ clusterId: 'test', appId: 'demo', operation: 'deployments' });
    assert.equal(deployments.data.items[0].metadata.namespace, 'app');
    const pods = await monitor.read({ clusterId: 'test', appId: 'demo', operation: 'pods' });
    assert.equal(pods.data.items[0].metadata.name, 'demo-pod');
    const logs = await monitor.read({ clusterId: 'test', appId: 'demo', operation: 'logs', pod: 'demo-pod' });
    assert.match(logs.data, /test log through SSH/);
    const diagnostics = f.requests.filter(request => request.path.includes('/namespaces/app/'));
    assert.ok(diagnostics.length >= 4);
    assert.ok(diagnostics.every(request => request.authorization === 'Bearer app-token'));
    f.manager.disconnect('test');
    await assert.rejects(monitor.read({ clusterId: 'test', operation: 'nodes' }), /Monitoring paused/);
    const restarted = new ClusterConnections({ baseDir: f.manager.baseDir, runtimeDir: f.manager.runtimeDir, confirmHost: () => false });
    t.after(() => restarted.close());
    assert.equal(restarted.usesSSHForMonitoring('test'), true);
    assert.equal(restarted.list(true)[0].state, 'disconnected');
});
