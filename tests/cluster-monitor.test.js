'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yaml = require('js-yaml');
const { ClusterMonitor } = require('../src/main/cluster-monitor');

function config(token = 'cluster-admin', namespace = 'app-namespace') {
    return {
        apiVersion: 'v1', kind: 'Config', 'current-context': 'selected',
        clusters: [{ name: 'cluster', cluster: { server: 'https://public.example:16443',
            'tls-server-name': 'kubernetes.internal', 'certificate-authority-data': Buffer.from('trusted-ca').toString('base64') } }],
        contexts: [{ name: 'selected', context: { cluster: 'cluster', user: 'reader', namespace } }],
        users: [{ name: 'reader', user: { token } }]
    };
}

function fixture(t, { ssh = false, state = 'connected', execute, cacheMs = 2000 } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-monitor-test-'));
    const baseDir = path.join(directory, 'Kenzap');
    const runtimeDir = path.join(directory, 'runtime');
    const appDir = path.join(baseDir, 'app-id');
    fs.mkdirSync(path.join(baseDir, '.kenzap'), { recursive: true });
    fs.mkdirSync(runtimeDir, { mode: 0o700 });
    fs.mkdirSync(appDir);
    fs.writeFileSync(path.join(baseDir, '.kenzap', '.config'), JSON.stringify({ clusters: [{ id: 'remote' }] }));
    const clusterPath = path.join(baseDir, '.kenzap', 'kubeconfig-remote.yaml');
    const appPath = path.join(appDir, 'kubeconfig-remote.yaml');
    const runtimePath = path.join(runtimeDir, 'kubeconfig-remote.yaml');
    fs.writeFileSync(clusterPath, yaml.dump(config()));
    fs.writeFileSync(appPath, yaml.dump(config('app-reader')));
    fs.writeFileSync(path.join(appDir, '.kenzap'), JSON.stringify({ id: 'app-id', slug: 'app-slug', clusters: ['remote'], path: appDir }));
    const trusted = config();
    trusted.clusters[0].cluster.server = 'https://127.0.0.1:45678';
    fs.writeFileSync(runtimePath, yaml.dump(trusted));
    const entry = { id: 'remote', state, stopped: false, kubeconfigPath: runtimePath,
        content: yaml.dump(trusted), listener: { address: () => ({ port: 45678 }) } };
    const connections = { baseDir, runtimeDir, connections: new Map([['remote', entry]]), usesSSHForMonitoring: () => ssh };
    const calls = [];
    const monitor = new ClusterMonitor({ connections, cacheMs, kubectl: () => '/trusted/kubectl',
        execute: (executable, args, options, callback) => {
            const record = { executable, args, options, callback, killed: false };
            const index = args.indexOf('--kubeconfig');
            if (index >= 0) {
                record.kubeconfigPath = args[index + 1];
                record.config = yaml.load(fs.readFileSync(record.kubeconfigPath, 'utf8'));
                record.mode = fs.statSync(record.kubeconfigPath).mode & 0o777;
            }
            calls.push(record);
            if (execute) execute(record);
            else setImmediate(() => callback(null, args[0] === 'logs' ? 'pod log line\n' : args[0] === 'top' ? 'NAME CPU(cores) CPU% MEMORY(bytes) MEMORY%\nnode 100m 5% 512Mi 10%\n' : '{"items":[]}'));
            return { kill: () => { record.killed = true; } };
        } });
    t.after(() => { monitor.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    return { monitor, calls, connections, entry, baseDir, appDir, clusterPath, appPath, runtimePath };
}

test('SSH cluster reads use the verified runtime config, not the public source', async t => {
    const f = fixture(t, { ssh: true });
    const result = await f.monitor.read({ clusterId: 'remote', operation: 'nodes' });
    assert.equal(result.transport, 'ssh');
    assert.equal(f.calls[0].kubeconfigPath, f.runtimePath);
    assert.equal(f.calls[0].config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(f.calls[0].options.shell, false);
    assert.equal(f.calls[0].options.timeout, 15000);
    assert.equal(f.calls[0].options.env.HTTPS_PROXY, undefined);
});

test('app tunnel config preserves app identity and namespace, with verified cluster TLS', async t => {
    const f = fixture(t, { ssh: true });
    const original = config('app-reader');
    original.clusters[0].cluster = { server: 'https://old-public.example:16443', 'insecure-skip-tls-verify': true, 'proxy-url': 'https://public-proxy.example' };
    fs.writeFileSync(f.appPath, yaml.dump(original));
    const source = fs.readFileSync(f.appPath, 'utf8');
    const result = await f.monitor.read({ clusterId: 'remote', operation: 'deployments', appId: 'app-id' });
    const call = f.calls[0];
    assert.equal(result.namespace, 'app-namespace');
    assert.equal(call.config.users[0].user.token, 'app-reader');
    assert.equal(call.config.contexts[0].context.namespace, 'app-namespace');
    assert.equal(call.config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(call.config.clusters[0].cluster['tls-server-name'], 'kubernetes.internal');
    assert.equal(call.config.clusters[0].cluster['insecure-skip-tls-verify'], undefined);
    assert.equal(call.config.clusters[0].cluster['proxy-url'], undefined);
    assert.equal(call.mode, 0o600);
    assert.ok(call.args.includes('--namespace'));
    assert.ok(!call.args.includes('--all-namespaces'));
    assert.equal(fs.readFileSync(f.appPath, 'utf8'), source);
    assert.equal(fs.existsSync(call.kubeconfigPath), false);
});

test('relative app client certificates are embedded without replacing the user', async t => {
    const f = fixture(t, { ssh: true });
    const original = config();
    original.users[0].user = { 'client-certificate': './reader.crt', 'client-key': './reader.key' };
    fs.writeFileSync(path.join(f.appDir, 'reader.crt'), 'app-certificate');
    fs.writeFileSync(path.join(f.appDir, 'reader.key'), 'app-key');
    fs.writeFileSync(f.appPath, yaml.dump(original));
    await f.monitor.read({ clusterId: 'remote', operation: 'pods', appId: 'app-id' });
    const user = f.calls[0].config.users[0].user;
    assert.equal(Buffer.from(user['client-certificate-data'], 'base64').toString(), 'app-certificate');
    assert.equal(Buffer.from(user['client-key-data'], 'base64').toString(), 'app-key');
    assert.equal(user.token, undefined);
});

test('disconnect, reconnect, and failed verification never fall back to public monitoring', async t => {
    const f = fixture(t, { ssh: true });
    await f.monitor.read({ clusterId: 'remote', operation: 'nodes' });
    for (const state of ['disconnected', 'reconnecting', 'verifying', 'error']) {
        f.entry.state = state;
        await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'nodes' }), error => error.code === 'SSH_UNAVAILABLE');
    }
    f.connections.connections.delete('remote');
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'nodes' }), /Monitoring paused/);
    assert.equal(f.calls.length, 1);
});

test('direct monitoring remains unchanged for clusters that have not selected SSH', async t => {
    const f = fixture(t);
    const result = await f.monitor.read({ clusterId: 'remote', operation: 'nodes' });
    assert.equal(result.transport, 'direct');
    assert.equal(f.calls[0].kubeconfigPath, f.clusterPath);
});

test('Minikube reads use an explicit context without switching the global context', async t => {
    const f = fixture(t);
    const result = await f.monitor.read({ clusterId: 'local', operation: 'nodes' });
    assert.equal(result.transport, 'local');
    assert.deepEqual(f.calls[0].args.slice(0, 7), ['get', 'nodes', '-o', 'json', '--context', 'minikube', '--request-timeout=12s']);
    assert.ok(!f.calls[0].args.includes('use-context'));
});

test('local monitoring works before master settings are first saved', async t => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.baseDir, '.kenzap', '.config'));
    assert.equal((await f.monitor.read({ clusterId: 'local', operation: 'nodes' })).transport, 'local');
});

test('read-only allowlist rejects mutations, shell arguments, paths and app/cluster mismatches', async t => {
    const f = fixture(t, { ssh: true });
    for (const request of [
        { clusterId: '../remote', operation: 'nodes' },
        { clusterId: 'remote', operation: 'delete' },
        { clusterId: 'remote', operation: 'logs', appId: 'app-id', pod: '--help' },
        { clusterId: 'remote', operation: 'logs', appId: 'app-id', pod: 'pod;touch file' },
        { clusterId: 'remote', operation: 'pods', appId: '../app-id' },
        { clusterId: 'remote', operation: 'pods' },
        { clusterId: 'remote', operation: 'nodes', appId: 'app-id' },
        { clusterId: 'missing', operation: 'nodes' }
    ]) await assert.rejects(f.monitor.read(request));
    fs.writeFileSync(path.join(f.appDir, '.kenzap'), JSON.stringify({ clusters: ['other'], slug: 'app' }));
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'pods', appId: 'app-id' }), /not assigned/);
    assert.equal(f.calls.length, 0);
});

test('missing app identity never substitutes cluster-admin credentials', async t => {
    const f = fixture(t, { ssh: true });
    fs.unlinkSync(f.appPath);
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'deployments', appId: 'app-id' }), /kubeconfig is missing/);
    const original = config();
    original.users[0].user = {};
    fs.writeFileSync(f.appPath, yaml.dump(original));
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'deployments', appId: 'app-id' }), /certificate or token/);
    assert.equal(f.calls.length, 0);
    assert.ok(!fs.readdirSync(f.connections.runtimeDir).some(file => file.startsWith('monitor-')));
});

test('simultaneous reads share one process and a short-lived successful cache', async t => {
    const f = fixture(t, { ssh: true });
    const request = { clusterId: 'remote', operation: 'nodes' };
    const results = await Promise.all([f.monitor.read(request), f.monitor.read(request), f.monitor.read(request)]);
    assert.equal(results[0], results[1]);
    await f.monitor.read(request);
    assert.equal(f.calls.length, 1);
    f.monitor.invalidate('remote');
    await f.monitor.read(request);
    assert.equal(f.calls.length, 2);
});

test('connection changes kill in-flight reads and reject late success', async t => {
    const f = fixture(t, { ssh: true, execute: () => {} });
    const pending = f.monitor.read({ clusterId: 'remote', operation: 'pods', appId: 'app-id' });
    const rejected = assert.rejects(pending, error => error.code === 'CONNECTION_CHANGED');
    f.entry.state = 'reconnecting';
    f.monitor.invalidate('remote');
    f.calls[0].callback(null, '{"items":[{"stale":true}]}');
    await rejected;
    assert.ok(f.calls[0].killed);
    assert.equal(f.monitor.cache.size, 0);
    assert.equal(fs.existsSync(f.calls[0].kubeconfigPath), false);
});

test('failed commands and malformed JSON are not cached as healthy state', async t => {
    const f = fixture(t, { execute: record => setImmediate(() => record.callback(new Error('failed'), '', 'Forbidden: reader lacks access')) });
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'nodes' }), /Forbidden/);
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'nodes' }), /Forbidden/);
    assert.equal(f.calls.length, 2);
    assert.equal(f.monitor.cache.size, 0);
    const malformed = fixture(t, { execute: record => setImmediate(() => record.callback(null, '{partial')) });
    await assert.rejects(malformed.monitor.read({ clusterId: 'remote', operation: 'nodes' }), SyntaxError);
    assert.equal(malformed.monitor.cache.size, 0);
});

test('diagnostic logs are namespace scoped and have bounded output', async t => {
    const f = fixture(t, { ssh: true });
    const result = await f.monitor.read({ clusterId: 'remote', operation: 'logs', appId: 'app-id', pod: 'app-123-abc' });
    assert.equal(result.data, 'pod log line\n');
    assert.deepEqual(f.calls[0].args.slice(0, 7), ['logs', 'app-123-abc', '--tail=200', '--limit-bytes=262144', '--all-containers=true', '--namespace', 'app-namespace']);
});

test('container-specific recent/previous logs use SSH app identity and isolated caches', async t => {
    const f = fixture(t, { ssh: true });
    const request = { clusterId: 'remote', appId: 'app-id', operation: 'logs', pod: 'web-123', container: 'web', timestamps: true };
    await f.monitor.read(request); await f.monitor.read({ ...request, previous: true }); await f.monitor.read({ ...request, container: 'worker' });
    await f.monitor.read({ ...request, timestamps: false }); await f.monitor.read(request);
    assert.equal(f.calls.length, 4);
    for (const call of f.calls) {
        assert.ok(!call.args.includes('--all-containers=true'));
        assert.ok(call.args.includes('--tail=200')); assert.ok(call.args.includes('--limit-bytes=262144'));
        assert.equal(call.config.users[0].user.token, 'app-reader');
        assert.equal(call.config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
        assert.equal(call.args[call.args.indexOf('--namespace') + 1], 'app-namespace');
        assert.equal(fs.existsSync(call.kubeconfigPath), false);
    }
    assert.ok(f.calls[0].args.includes('--timestamps=true')); assert.ok(f.calls[1].args.includes('--previous=true'));
    assert.equal(f.calls[2].args[f.calls[2].args.indexOf('--container') + 1], 'worker');
    assert.ok(!f.calls[3].args.includes('--timestamps=true'));
    f.entry.state = 'disconnected';
    await assert.rejects(f.monitor.read(request), error => error.code === 'SSH_UNAVAILABLE');
    assert.equal(f.calls.length, 4, 'A cached log result must not bypass disconnected SSH');
});

test('pod warning queries are read-only, namespace and UID scoped, with separate incarnation caches', async t => {
    const f = fixture(t, { ssh: true });
    const request = { clusterId: 'remote', appId: 'app-id', operation: 'events', pod: 'web-123', podUid: 'pod-123' };
    await f.monitor.read(request); await f.monitor.read({ ...request, podUid: 'pod-456' }); await f.monitor.read({ ...request, podUid: undefined });
    assert.equal(f.calls.length, 3);
    assert.equal(f.calls[0].args[f.calls[0].args.indexOf('--field-selector') + 1], 'involvedObject.uid=pod-123,involvedObject.kind=Pod,type=Warning');
    assert.match(f.calls[2].args[f.calls[2].args.indexOf('--field-selector') + 1], /involvedObject.name=web-123/);
    assert.ok(!f.calls[0].args.includes('--all-namespaces'));
});

test('same-name replacement pods cannot receive the previous pod incarnation cached logs', async t => {
    const f = fixture(t, { ssh: true });
    const request = { clusterId: 'remote', appId: 'app-id', operation: 'logs', pod: 'stateful-pod-0', container: 'web', timestamps: true, podUid: 'first-pod' };
    await f.monitor.read(request); await f.monitor.read({ ...request, podUid: 'replacement-pod' });
    assert.equal(f.calls.length, 2);
});

test('log/event options cannot inject flags, select other namespaces or request unbounded variants', async t => {
    const f = fixture(t, { ssh: true });
    const logs = { clusterId: 'remote', appId: 'app-id', operation: 'logs', pod: 'web-123' };
    for (const options of [{ container: '--help' }, { container: 'other/name' }, { previous: true }, { previous: 'yes' }, { timestamps: 'true' }]) await assert.rejects(f.monitor.read({ ...logs, ...options }));
    for (const options of [{ podUid: 'uid,type=Normal' }, { podUid: '--help' }, { pod: 'web; ls' }]) await assert.rejects(f.monitor.read({ ...logs, operation: 'events', ...options }));
    assert.equal(f.calls.length, 0);
});

test('app configs are resolved correctly when workspace paths contain spaces', async t => {
    const f = fixture(t, { ssh: true });
    const workspace = path.join(f.baseDir, 'My workspace');
    fs.mkdirSync(workspace);
    fs.renameSync(f.appPath, path.join(workspace, 'kubeconfig-remote.yaml'));
    fs.writeFileSync(path.join(f.appDir, '.kenzap'), JSON.stringify({ clusters: ['remote'], slug: 'app-slug', path: workspace }));
    await f.monitor.read({ clusterId: 'remote', operation: 'deployments', appId: 'app-id' });
    assert.equal(f.calls[0].config.users[0].user.token, 'app-reader');
});

test('dated app kubeconfigs are accepted when their server matches the assigned cluster', async t => {
    const f = fixture(t, { ssh: true });
    const dated = path.join(f.appDir, 'kubeconfig-20261007.yaml');
    fs.renameSync(f.appPath, dated);
    const original = config('app-reader');
    original.clusters[0].cluster['certificate-authority-data'] = Buffer.from('older-ca').toString('base64');
    fs.writeFileSync(dated, yaml.dump(original));
    const source = fs.readFileSync(dated, 'utf8');
    await f.monitor.read({ clusterId: 'remote', operation: 'deployments', appId: 'app-id' });
    assert.equal(f.calls[0].config.users[0].user.token, 'app-reader');
    assert.equal(f.calls[0].config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(fs.readFileSync(dated, 'utf8'), source);
});

test('dated configs can match the cluster CA even if the saved API hostname differs', async t => {
    const f = fixture(t, { ssh: true });
    fs.renameSync(f.appPath, path.join(f.appDir, 'kubeconfig-20261007.yaml'));
    const original = config('app-reader');
    original.clusters[0].cluster.server = 'https://old-cluster-address.example:16443';
    fs.writeFileSync(path.join(f.appDir, 'kubeconfig-20261007.yaml'), yaml.dump(original));
    await f.monitor.read({ clusterId: 'remote', operation: 'pods', appId: 'app-id' });
    assert.equal(f.calls[0].config.users[0].user.token, 'app-reader');
});

test('unrelated or ambiguous dated configs are rejected rather than guessed', async t => {
    const f = fixture(t, { ssh: true });
    fs.unlinkSync(f.appPath);
    const original = config('other-reader');
    original.clusters[0].cluster.server = 'https://unrelated.example:16443';
    original.clusters[0].cluster['certificate-authority-data'] = Buffer.from('unrelated-ca').toString('base64');
    const dated = path.join(f.appDir, 'kubeconfig-20261007.yaml');
    fs.writeFileSync(dated, yaml.dump(original));
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'pods', appId: 'app-id' }), /does not match/);
    fs.writeFileSync(dated, yaml.dump(config('reader-one')));
    fs.writeFileSync(path.join(f.appDir, 'kubeconfig-20261008.yaml'), yaml.dump(config('reader-two')));
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'pods', appId: 'app-id' }), /Multiple app kubeconfigs/);
    assert.equal(f.calls.length, 0);
});

test('manifest namespace is used instead of a shortened display slug when context omits it', async t => {
    const f = fixture(t, { ssh: true });
    const original = config('app-reader');
    delete original.contexts[0].context.namespace;
    fs.writeFileSync(f.appPath, yaml.dump(original));
    fs.writeFileSync(path.join(f.appDir, 'app.yaml'), yaml.dump({ kind: 'Deployment', metadata: { namespace: 'actual-app-namespace' } }));
    const result = await f.monitor.read({ clusterId: 'remote', operation: 'deployments', appId: 'app-id' });
    assert.equal(result.namespace, 'actual-app-namespace');
    assert.ok(f.calls[0].args.includes('actual-app-namespace'));
});

test('explicit context namespace takes precedence and legacy apps fall back to their ID', async t => {
    const f = fixture(t, { ssh: true });
    fs.writeFileSync(path.join(f.appDir, 'app.yaml'), yaml.dump({ kind: 'Deployment', metadata: { namespace: 'manifest-namespace' } }));
    assert.equal(f.monitor.describe({ clusterId: 'remote', operation: 'deployments', appId: 'app-id' }).namespace, 'app-namespace');
    const original = config('app-reader');
    delete original.contexts[0].context.namespace;
    fs.writeFileSync(f.appPath, yaml.dump(original));
    fs.unlinkSync(path.join(f.appDir, 'app.yaml'));
    assert.equal(f.monitor.describe({ clusterId: 'remote', operation: 'deployments', appId: 'app-id' }).namespace, 'app-id');
});

test('pod usage queries use the same namespace, credentials and SSH route as status', async t => {
    const f = fixture(t, { ssh: true });
    const result = await f.monitor.read({ clusterId: 'remote', operation: 'topPods', appId: 'app-id' });
    assert.equal(result.transport, 'ssh');
    assert.equal(result.namespace, 'app-namespace');
    assert.deepEqual(f.calls[0].args.slice(0, 4), ['top', 'pods', '--namespace', 'app-namespace']);
    assert.equal(f.calls[0].config.users[0].user.token, 'app-reader');
    assert.ok(!f.calls[0].args.includes('--sum=true'));
    f.entry.state = 'disconnected';
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'topPods', appId: 'app-id' }), /Monitoring paused/);
    await assert.rejects(f.monitor.read({ clusterId: 'remote', operation: 'topPods' }), /Select an app/);
});
