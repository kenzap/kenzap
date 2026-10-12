const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const yaml = require('js-yaml');
const { ClusterMonitor } = require('../src/main/cluster-monitor');
const { AppSync } = require('../src/main/app-sync');

function config(token, server = 'https://public.test:16443') {
    return { apiVersion: 'v1', kind: 'Config', 'current-context': 'app-context',
        clusters: [{ name: 'cluster', cluster: { server, 'tls-server-name': 'kubernetes.internal',
            'certificate-authority-data': Buffer.from('trusted-ca').toString('base64') } }],
        contexts: [{ name: 'app-context', context: { cluster: 'cluster', user: 'app-user', namespace: 'office' } }],
        users: [{ name: 'app-user', user: { token } }] };
}

function fixture(t, { ssh = true, local = false, delayedClose = false, canStart, launch } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-sync-'));
    const baseDir = path.join(directory, 'Kenzap'), runtimeDir = path.join(directory, 'runtime');
    const appDir = path.join(baseDir, 'app-id'), workspace = path.join(directory, "workspace ' with spaces");
    for (const dir of [path.join(baseDir, '.kenzap'), runtimeDir, appDir, workspace]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(baseDir, '.kenzap', '.config'), JSON.stringify({ clusters: [{ id: 'remote' }] }));
    const app = { id: 'app-id', path: workspace, clusters: [local ? 'local' : 'remote'], namespace: 'office' };
    fs.writeFileSync(path.join(appDir, '.kenzap'), JSON.stringify(app));
    const sourcePath = path.join(workspace, 'kubeconfig-20261007.yaml');
    fs.writeFileSync(sourcePath, yaml.dump(config('app-token-secret')));
    fs.writeFileSync(path.join(baseDir, '.kenzap', 'kubeconfig-remote.yaml'), yaml.dump(config('admin-token-secret')));
    const devspaceConfig = { version: 'v2beta1', dev: { web: { imageSelector: 'registry.test/web', sync: [
        { path: 'src:/app', initialSync: 'preferRemote', excludePaths: ['node_modules'], uploadExcludePaths: ['cache'], disableDownload: true }
    ] } } };
    const file = path.join(workspace, 'devspace.yaml');
    const writeConfig = value => fs.writeFileSync(file, yaml.dump(value));
    writeConfig(devspaceConfig);
    fs.mkdirSync(path.join(workspace, '.devspace'));
    fs.writeFileSync(path.join(workspace, '.devspace', 'state'), 'keep me');
    const entry = { state: 'connected', stopped: false, content: yaml.dump(config('admin-token-secret', 'https://127.0.0.1:45678')),
        listener: { address: () => ({ port: 45678 }) }, kubeconfigPath: path.join(runtimeDir, 'kubeconfig-remote.yaml') };
    const connections = { baseDir, runtimeDir, connections: new Map([['remote', entry]]), usesSSHForMonitoring: () => ssh };
    const monitor = new ClusterMonitor({ connections, kubectl: () => '/trusted/kubectl' });
    const calls = [], updates = [], kills = [];
    const sync = new AppSync({ monitor, devspace: () => '/trusted/devspace', canStart,
        onUpdate: update => updates.push(update),
        kill: (child, signal) => { kills.push({ child, signal }); if (!delayedClose || signal === 'SIGKILL') setImmediate(() => child.emit('close', null, signal)); },
        launch: (executable, args, options) => {
            const child = new EventEmitter();
            child.pid = 12345; child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
            const call = { executable, args, options, child };
            const index = args.indexOf('--kubeconfig');
            if (index >= 0) {
                call.configPath = args[index + 1];
                call.config = yaml.load(fs.readFileSync(call.configPath, 'utf8'));
                call.mode = fs.statSync(call.configPath).mode & 0o777;
            }
            calls.push(call);
            if (launch) launch(call);
            return child;
        } });
    t.after(async () => {
        sync.close();
        await Promise.all([...sync.jobs.values()].map(job => job.completion));
        monitor.close(); fs.rmSync(directory, { recursive: true, force: true });
    });
    const start = () => sync.start({ appId: app.id, file: 'devspace.yaml' });
    const stop = () => sync.stop({ appId: app.id, jobId: sync.jobs.get(app.id).jobId });
    const wait = () => sync.jobs.get(app.id).completion;
    const tick = () => new Promise(resolve => setImmediate(resolve));
    const connection = state => { entry.state = state; sync.connectionChanged({ id: 'remote', state }); };
    return { sync, calls, updates, kills, entry, connections, workspace, sourcePath, app, appDir, file,
        devspaceConfig, writeConfig, start, stop, wait, tick, connection };
}

test('live sync uses private scoped SSH credentials and preserves workspace rules and DevSpace state', async t => {
    const f = fixture(t), source = fs.readFileSync(f.sourcePath, 'utf8'), rules = fs.readFileSync(f.file, 'utf8');
    f.start(); await f.tick();
    const call = f.calls[0];
    assert.equal(call.executable, '/trusted/devspace');
    assert.equal(call.args[0], 'sync');
    for (const [flag, value] of [['--config', 'devspace.yaml'], ['--namespace', 'office'], ['--kube-context', 'app-context'], ['--initial-sync', 'preferRemote']]) {
        assert.equal(call.args[call.args.indexOf(flag) + 1], value);
    }
    assert.ok(call.args.includes('--pick=false'));
    assert.equal(call.options.shell, false);
    assert.equal(call.options.cwd, f.workspace);
    assert.equal(call.options.env.KUBECONFIG, call.configPath);
    assert.equal(call.options.env.DEVSPACE_FLAGS, undefined);
    assert.match(call.options.env.NO_PROXY, /127\.0\.0\.1/);
    assert.equal(call.config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(call.config.clusters[0].cluster['tls-server-name'], 'kubernetes.internal');
    assert.equal(call.config.clusters[0].cluster['insecure-skip-tls-verify'], undefined);
    assert.equal(call.config.users[0].user.token, 'app-token-secret');
    assert.equal(call.mode, 0o600);
    assert.equal(f.sync.timeoutMs, 0);
    assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), source);
    assert.equal(fs.readFileSync(f.file, 'utf8'), rules);
    assert.equal(fs.readFileSync(path.join(f.workspace, '.devspace', 'state'), 'utf8'), 'keep me');
    f.stop(); await f.wait();
    assert.equal(fs.existsSync(call.configPath), false);
});

test('disconnected SSH and publishing block sync before any child starts; no public fallback', t => {
    const f = fixture(t);
    f.entry.state = 'disconnected';
    assert.throws(f.start, /Connect this cluster via SSH/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.sync.list().length, 0);
    const busy = fixture(t, { canStart: () => false });
    assert.throws(busy.start, /publishing to finish/);
    assert.equal(busy.calls.length, 0);
});

test('SSH loss pauses and reconnect resumes exactly once with a fresh trusted tunnel', async t => {
    const f = fixture(t);
    const initial = f.start(); await f.tick();
    f.connection('disconnected'); await f.wait();
    assert.equal(f.sync.list()[0].status, 'paused');
    assert.equal(f.sync.list()[0].desired, true);
    assert.equal(f.sync.isBusy(f.app.id), true);
    assert.equal(fs.existsSync(f.calls[0].configPath), false);
    const next = { ...f.entry, state: 'connected', listener: { address: () => ({ port: 56789 }) }, content: yaml.dump(config('new-admin', 'https://127.0.0.1:56789')) };
    f.connections.connections.set('remote', next);
    f.sync.connectionChanged({ id: 'remote', state: 'connected' });
    f.sync.connectionChanged({ id: 'remote', state: 'connected' });
    await f.tick();
    assert.equal(f.calls.length, 2);
    assert.equal(f.sync.list()[0].jobId, initial.jobId);
    assert.equal(f.sync.list()[0].attempt, 2);
    assert.equal(f.calls[1].config.clusters[0].cluster.server, 'https://127.0.0.1:56789');
    assert.equal(f.calls[1].config.users[0].user.token, 'app-token-secret');
});

test('reconnect before the old process closes waits for cleanup and never overlaps sessions', async t => {
    const f = fixture(t, { delayedClose: true });
    f.start(); await f.tick();
    f.connection('disconnected'); f.connection('connected');
    await f.tick(); assert.equal(f.calls.length, 1);
    assert.equal(f.sync.list()[0].status, 'pausing');
    f.calls[0].child.emit('close', 0); await f.wait(); await f.tick(); await f.tick();
    assert.equal(f.calls.length, 2);
    assert.equal(fs.existsSync(f.calls[0].configPath), false);
});

test('Stop during pause revokes resume and blocks publishing until the child actually closes', async t => {
    const f = fixture(t, { delayedClose: true });
    f.start(); await f.tick();
    f.connection('disconnected'); f.stop(); f.connection('connected');
    assert.equal(f.sync.list()[0].desired, false);
    assert.equal(f.sync.isBusy(f.app.id), true);
    f.calls[0].child.emit('close', 0); await f.wait(); await f.tick();
    assert.equal(f.sync.list()[0].status, 'stopped');
    assert.equal(f.sync.isBusy(f.app.id), false);
    assert.equal(f.calls.length, 1);
});

test('Stop a paused session works without the workspace and prevents a later reconnect', async t => {
    const f = fixture(t); f.start(); await f.tick();
    f.connection('disconnected'); await f.wait();
    fs.unlinkSync(f.file); f.stop(); f.connection('connected'); await f.tick();
    assert.equal(f.sync.list()[0].status, 'stopped');
    assert.equal(f.calls.length, 1);
});

test('changed sync rules or assigned namespace require an explicit new start after pause', async t => {
    for (const change of ['rules', 'namespace']) {
        const f = fixture(t); f.start(); await f.tick(); f.connection('disconnected'); await f.wait();
        if (change === 'rules') { f.devspaceConfig.dev.web.sync[0].path = 'different:/other'; f.writeConfig(f.devspaceConfig); }
        else fs.writeFileSync(path.join(f.appDir, '.kenzap'), JSON.stringify({ ...f.app, namespace: 'different' }));
        f.connection('connected'); await f.tick();
        assert.equal(f.calls.length, 1);
        assert.equal(f.sync.list()[0].status, 'failed');
        assert.equal(f.sync.list()[0].desired, false);
        assert.match(f.sync.list()[0].error, /changed while paused/);
    }
});

test('sync rejects ambiguous targets and invalid requests instead of asking on closed stdin', t => {
    const f = fixture(t);
    for (const file of ['../devspace.yaml', 'all', 'devspace.yaml\0']) assert.throws(() => f.sync.start({ appId: f.app.id, file }), /Invalid sync/);
    f.devspaceConfig.dev.web.sync.push({ path: 'second:/other' }); f.writeConfig(f.devspaceConfig);
    assert.throws(f.start, /one sync path/);
    f.devspaceConfig.dev.web.sync.pop(); delete f.devspaceConfig.dev.web.imageSelector; f.writeConfig(f.devspaceConfig);
    assert.throws(f.start, /unrelated pod/);
    f.devspaceConfig.dev.web.labelSelector = { app: 'office' };
    f.devspaceConfig.dev.web.sync[0].initialSync = '${STRATEGY}'; f.writeConfig(f.devspaceConfig);
    assert.throws(f.start, /initialSync strategy/);
    assert.equal(f.calls.length, 0);
});

test('errors and normal exit settle visibly; stale Stop cannot affect a new session', async t => {
    const f = fixture(t); const first = f.start();
    assert.throws(f.start, /already running/); await f.tick();
    f.calls[0].child.stderr.write('RBAC denied\n'); f.calls[0].child.emit('close', 1); await f.wait();
    assert.equal(f.sync.list()[0].status, 'failed'); assert.match(f.sync.list()[0].error, /RBAC denied/);
    f.start(); await f.tick();
    assert.throws(() => f.sync.stop({ appId: f.app.id, jobId: first.jobId }), /no longer current/);
    f.calls[1].child.emit('close', 0); await f.wait();
    assert.equal(f.sync.list()[0].status, 'stopped'); assert.equal(f.sync.isBusy(f.app.id), false);
});

test('spawn failures clean private config and redact credentials in bounded live output', async t => {
    const failed = fixture(t, { launch: call => setImmediate(() => { call.child.pid = undefined; call.child.emit('error', new Error('missing executable')); }) });
    failed.start(); await failed.wait();
    assert.equal(failed.sync.list()[0].status, 'failed');
    assert.equal(fs.existsSync(failed.calls[0].configPath), false);
    const f = fixture(t); f.start(); await f.tick();
    f.calls[0].child.stdout.write('app-token-'); f.calls[0].child.stdout.write('secret\n');
    f.calls[0].child.stdout.write('x'.repeat(80000) + '\n');
    for (let i = 0; i < 1000; i++) f.calls[0].child.stdout.write('safe '.repeat(20) + '\n');
    f.stop(); await f.wait();
    assert.ok(f.updates.every(update => !update.log.includes('app-token-secret')));
    assert.ok(f.sync.list()[0].log.length <= 65536);
});

test('direct and Minikube sync retain explicit routes without switching global context', async t => {
    const direct = fixture(t, { ssh: false }); direct.start(); await direct.tick();
    assert.equal(direct.calls[0].configPath, direct.sourcePath);
    assert.equal(direct.calls[0].config.clusters[0].cluster.server, 'https://public.test:16443');
    const local = fixture(t, { local: true }); local.start(); await local.tick();
    assert.ok(!local.calls[0].args.includes('--kubeconfig'));
    assert.equal(local.calls[0].args[local.calls[0].args.indexOf('--kube-context') + 1], 'minikube');
    assert.ok(local.calls.every(call => !call.args.includes('use-context')));
});

test('app shutdown kills children and removes private credentials immediately', async t => {
    const f = fixture(t, { delayedClose: true }); f.start(); await f.tick();
    f.sync.close();
    assert.equal(fs.existsSync(f.calls[0].configPath), false);
    assert.deepEqual(f.kills.map(kill => kill.signal), ['SIGTERM', 'SIGKILL']);
    await f.wait(); f.connection('connected'); await f.tick();
    assert.equal(f.calls.length, 1); assert.throws(f.start, /shutting down/);
});

test('stopping a queued job prevents launch and ignores unrelated cluster changes', async t => {
    const f = fixture(t); f.start();
    f.sync.connectionChanged({ id: 'other', state: 'disconnected' });
    assert.equal(f.sync.list()[0].status, 'queued');
    f.stop(); await f.wait();
    assert.equal(f.calls.length, 0); assert.equal(f.sync.list()[0].status, 'stopped');
});

test('a real local sync subprocess receives safe arguments and keeps credentials only until exit', async t => {
    const f = fixture(t);
    const binary = path.join(f.workspace, "devspace ' stub");
    fs.writeFileSync(binary, `#!${process.execPath}\nconst fs = require('fs');\nconsole.log(JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), exists: fs.existsSync(process.env.KUBECONFIG)}));\n`, { mode: 0o700 });
    f.sync.devspace = () => binary;
    f.sync.launch = require('node:child_process').spawn;
    f.start(); await f.wait();
    const result = f.sync.list()[0];
    assert.equal(result.status, 'stopped');
    const record = JSON.parse(result.log.split('\n').find(line => line.startsWith('{')));
    assert.equal(record.args[0], 'sync');
    assert.equal(record.args[record.args.indexOf('--config') + 1], 'devspace.yaml');
    assert.equal(record.cwd, fs.realpathSync(f.workspace));
    assert.equal(record.exists, true);
    assert.equal(fs.existsSync(record.args[record.args.indexOf('--kubeconfig') + 1]), false);
});
