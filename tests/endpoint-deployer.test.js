const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const yaml = require('js-yaml');
const { EndpointState } = require('../src/assets/js/endpoint-state');
const { ClusterMonitor } = require('../src/main/cluster-monitor');
const { EndpointDeployer } = require('../src/main/endpoint-deployer');

function config(token, server = 'https://public.test:16443') {
    return { apiVersion: 'v1', kind: 'Config', 'current-context': 'app',
        clusters: [{ name: 'cluster', cluster: { server, 'tls-server-name': 'kubernetes.internal',
            'certificate-authority-data': Buffer.from('trusted-ca').toString('base64') } }],
        contexts: [{ name: 'app', context: { cluster: 'cluster', user: 'reader', namespace: 'office' } }],
        users: [{ name: 'reader', user: { token } }] };
}

function fixture(t, { ssh = true, local = false, execute } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-endpoint-deploy-'));
    const baseDir = path.join(directory, 'Kenzap');
    const runtimeDir = path.join(directory, 'runtime');
    const appDir = path.join(baseDir, 'app-id');
    fs.mkdirSync(path.join(baseDir, '.kenzap'), { recursive: true });
    fs.mkdirSync(runtimeDir, { mode: 0o700 });
    fs.mkdirSync(appDir);
    fs.writeFileSync(path.join(baseDir, '.kenzap', '.config'), JSON.stringify({ clusters: [{ id: 'remote' }, { id: 'second' }] }));
    const app = { id: 'app-id', slug: 'display', namespace: 'office', path: appDir, clusters: [local ? 'local' : 'remote'] };
    const settingsPath = path.join(appDir, '.kenzap');
    fs.writeFileSync(settingsPath, JSON.stringify(app));
    const appConfigPath = path.join(appDir, 'kubeconfig-20261007.yaml');
    fs.writeFileSync(appConfigPath, yaml.dump(config('app-writer')));
    for (const id of ['remote', 'second']) fs.writeFileSync(path.join(baseDir, '.kenzap', `kubeconfig-${id}.yaml`), yaml.dump(config('cluster-admin')));
    const entry = { state: 'connected', stopped: false, content: yaml.dump(config('cluster-admin', 'https://127.0.0.1:45678')),
        listener: { address: () => ({ port: 45678 }) }, kubeconfigPath: path.join(runtimeDir, 'kubeconfig-remote.yaml') };
    const connections = { baseDir, runtimeDir, connections: new Map([['remote', entry], ['second', { ...entry }]]), usesSSHForMonitoring: () => ssh };
    const monitor = new ClusterMonitor({ connections, kubectl: () => '/trusted/kubectl' });
    const calls = [];
    const deployer = new EndpointDeployer({ monitor, execute: (executable, args, options, callback) => {
        const record = { executable, args, options, callback, input: '', killed: false };
        const index = args.indexOf('--kubeconfig');
        if (index >= 0) {
            record.configPath = args[index + 1];
            record.config = yaml.load(fs.readFileSync(record.configPath, 'utf8'));
            record.mode = fs.statSync(record.configPath).mode & 0o777;
        }
        const stdin = new EventEmitter();
        stdin.end = input => { record.input = input; };
        calls.push(record);
        if (execute) execute(record);
        else setImmediate(() => callback(null, 'configured', ''));
        return { stdin, kill: () => { record.killed = true; } };
    } });
    const resources = [
        { apiVersion: 'v1', kind: 'Service', metadata: { name: 'web', namespace: 'office' }, spec: { selector: { app: 'web' }, ports: [{ port: 80 }] } },
        { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: { name: 'custom-ingress', namespace: 'office' },
            spec: { ingressClassName: 'public', rules: [{ host: 'office.test', http: { paths: [
                { path: '/office', pathType: 'Exact', backend: { service: { name: 'web', port: { number: 80 } } } }
            ] } }] } }
    ];
    const store = new EndpointState(appDir, app);
    fs.writeFileSync(store.manifestPath, resources.map(resource => yaml.dump(resource)).join('---\n'));
    const endpoints = store.load();
    const baseline = JSON.parse(JSON.stringify(endpoints));
    endpoints[0].active_public = 0;
    store.save(endpoints, baseline);
    t.after(() => { deployer.close(); monitor.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    return { deployer, monitor, connections, entry, calls, app, appDir, appConfigPath, settingsPath, store, endpoints };
}

test('endpoint saving applies the active manifest then deletes removed resources through SSH with app credentials', async t => {
    const f = fixture(t);
    const originalConfig = fs.readFileSync(f.appConfigPath, 'utf8');
    const result = await f.deployer.deploy('app-id');
    assert.equal(result.clusters[0].transport, 'ssh');
    assert.equal(f.calls.length, 2);
    assert.deepEqual(f.calls[0].args.slice(0, 3), ['apply', '-f', '-']);
    assert.equal(yaml.load(f.calls[0].input).kind, 'Service');
    assert.deepEqual(f.calls[1].args.slice(0, 6), ['delete', 'ingress', 'custom-ingress', '--ignore-not-found=true', '--namespace', 'office']);
    assert.equal(f.calls[0].config.users[0].user.token, 'app-writer');
    assert.equal(f.calls[0].config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(f.calls[0].options.shell, false);
    assert.equal(f.calls[0].options.env.HTTPS_PROXY, undefined);
    assert.equal(f.calls[0].mode, 0o600);
    assert.equal(fs.existsSync(f.calls[0].configPath), false);
    assert.equal(fs.readFileSync(f.appConfigPath, 'utf8'), originalConfig);
    assert.deepEqual(f.store.read().state.pendingDeletes, []);
    assert.equal(f.store.read().state.disabledEndpoints.length, 1);
});

test('an empty manifest skips apply and deletes disabled services and ingresses', async t => {
    const f = fixture(t);
    const current = f.store.load();
    const baseline = JSON.parse(JSON.stringify(current));
    current[0].active_private = 0;
    f.store.save(current, baseline);
    await f.deployer.deploy('app-id');
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(call => call.args[0] === 'delete'));
    assert.deepEqual(f.store.read().resources, []);
});

test('deployment failure retains deletion intent and disabled configuration for a retry', async t => {
    let fail = true;
    const f = fixture(t, { execute: call => setImmediate(() => call.callback(
        fail && call.args[0] === 'delete' ? new Error('forbidden') : null, '', fail && call.args[0] === 'delete' ? 'RBAC denied ingress deletion' : '')) });
    await assert.rejects(f.deployer.deploy('app-id'), /RBAC denied/);
    assert.equal(f.store.read().state.pendingDeletes.length, 1);
    assert.equal(f.store.read().state.disabledResources.length, 1);
    fail = false;
    await f.deployer.deploy('app-id');
    assert.deepEqual(f.store.read().state.pendingDeletes, []);
    assert.ok(f.calls.every(call => !fs.existsSync(call.configPath)));
});

test('disconnected SSH never falls back to the public API for endpoint deployment', async t => {
    const f = fixture(t);
    f.entry.state = 'disconnected';
    await assert.rejects(f.deployer.deploy('app-id'), /Monitoring paused/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.store.read().state.pendingDeletes.length, 1);
});

test('connection changes cancel in-flight deployment and preserve pending deletions', async t => {
    const f = fixture(t, { execute: () => {} });
    const pending = f.deployer.deploy('app-id');
    assert.equal(f.calls.length, 1);
    f.deployer.invalidate('remote');
    f.calls[0].callback(null, 'late success', '');
    await assert.rejects(pending, /connection change/);
    assert.equal(f.calls[0].killed, true);
    assert.equal(f.store.read().state.pendingDeletes.length, 1);
    assert.equal(fs.existsSync(f.calls[0].configPath), false);
});

test('direct and local deployments retain their selected routes without global context switching', async t => {
    const direct = fixture(t, { ssh: false });
    await direct.deployer.deploy('app-id');
    assert.equal(direct.calls[0].configPath, direct.appConfigPath);
    assert.equal(direct.calls[0].config.users[0].user.token, 'app-writer');
    const local = fixture(t, { local: true });
    await local.deployer.deploy('app-id');
    assert.ok(local.calls.every(call => call.args[call.args.indexOf('--context') + 1] === 'minikube'));
    assert.ok(local.calls.every(call => !call.args.includes('--kubeconfig')));
});

test('all assigned clusters deploy and a missing secondary app kubeconfig blocks before mutation', async t => {
    const f = fixture(t);
    f.app.clusters = ['remote', 'second'];
    fs.writeFileSync(f.settingsPath, JSON.stringify(f.app));
    await f.deployer.deploy('app-id');
    assert.equal(f.calls.length, 4);
    fs.unlinkSync(f.appConfigPath);
    await assert.rejects(f.deployer.deploy('app-id'), /missing/);
    assert.equal(f.calls.length, 4);
});

test('endpoint deployment rejects invalid app IDs, cross-namespace resources and arbitrary deletions', async t => {
    const f = fixture(t);
    await assert.rejects(f.deployer.deploy('../other'), /Invalid app/);
    const state = f.store.read().state;
    state.pendingDeletes.push({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'office', namespace: 'office' } });
    fs.writeFileSync(f.store.statePath, JSON.stringify(state));
    await assert.rejects(f.deployer.deploy('app-id'), /Only removed Services/);
    state.pendingDeletes.pop();
    fs.writeFileSync(f.store.statePath, JSON.stringify(state));
    const active = f.store.read().resources;
    active[0].metadata.namespace = 'other-team';
    fs.writeFileSync(f.store.manifestPath, yaml.dump(active[0]));
    await assert.rejects(f.deployer.deploy('app-id'), /app monitoring namespace/);
    assert.equal(f.calls.length, 0);
});

test('concurrent saves cannot overlap or acknowledge a newer manifest snapshot', async t => {
    const f = fixture(t, { execute: () => {} });
    const pending = f.deployer.deploy('app-id');
    await assert.rejects(f.deployer.deploy('app-id'), /already running/);
    fs.appendFileSync(f.store.manifestPath, '\n# newer edit\n');
    f.calls[0].callback(null, 'configured', '');
    await new Promise(resolve => setImmediate(resolve));
    f.calls[1].callback(null, 'deleted', '');
    await assert.rejects(pending, /changed during deployment/);
    assert.equal(f.store.read().state.pendingDeletes.length, 1);
});

test('namespace-less manifests and deletions use the app namespace explicitly', async t => {
    const f = fixture(t);
    const active = f.store.read().resources;
    delete active[0].metadata.namespace;
    fs.writeFileSync(f.store.manifestPath, yaml.dump(active[0]));
    const state = f.store.read().state;
    delete state.pendingDeletes[0].metadata.namespace;
    fs.writeFileSync(f.store.statePath, JSON.stringify(state));
    await f.deployer.deploy('app-id');
    assert.ok(f.calls.every(call => call.args[call.args.indexOf('--namespace') + 1] === 'office'));
});

test('cluster-scoped resources cannot masquerade as app-scoped endpoint resources', async t => {
    const f = fixture(t);
    fs.writeFileSync(f.store.manifestPath, yaml.dump({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'other-team', namespace: 'office' } }));
    await assert.rejects(f.deployer.deploy('app-id'), /Cluster-wide resources/);
    assert.equal(f.calls.length, 0);
});
