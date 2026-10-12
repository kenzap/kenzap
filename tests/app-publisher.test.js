const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const yaml = require('js-yaml');
const { ClusterMonitor } = require('../src/main/cluster-monitor');
const { AppPublisher } = require('../src/main/app-publisher');

function config(token, server = 'https://public.test:16443') {
    return { apiVersion: 'v1', kind: 'Config', 'current-context': 'app-context',
        clusters: [{ name: 'cluster', cluster: { server, 'tls-server-name': 'kubernetes.internal',
            'certificate-authority-data': Buffer.from('trusted-ca').toString('base64') } }],
        contexts: [{ name: 'app-context', context: { cluster: 'cluster', user: 'app-user', namespace: 'office' } }],
        users: [{ name: 'app-user', user: { token } }] };
}

function fixture(t, { ssh = true, local = false, launch, timeoutMs } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-publish-'));
    const baseDir = path.join(directory, 'Kenzap');
    const runtimeDir = path.join(directory, 'runtime');
    const appDir = path.join(baseDir, 'app-id');
    const workspace = path.join(directory, "workspace ' with spaces");
    for (const dir of [path.join(baseDir, '.kenzap'), runtimeDir, appDir, workspace]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(baseDir, '.kenzap', '.config'), JSON.stringify({ clusters: [{ id: 'remote' }] }));
    const app = { id: 'app-id', path: workspace, clusters: [local ? 'local' : 'remote'], namespace: 'office' };
    fs.writeFileSync(path.join(appDir, '.kenzap'), JSON.stringify(app));
    const sourcePath = path.join(workspace, 'kubeconfig-20261007.yaml');
    fs.writeFileSync(sourcePath, yaml.dump(config('app-token-secret')));
    fs.writeFileSync(path.join(baseDir, '.kenzap', 'kubeconfig-remote.yaml'), yaml.dump(config('admin-token-secret')));
    const devspaceConfig = { version: 'v2beta1', pullSecrets: { pullsecret: {
        registry: 'https://registry.test:5000/v2', username: "user ' name", password: "password ' $ secret" } } };
    fs.writeFileSync(path.join(workspace, 'devspace.yaml'), yaml.dump(devspaceConfig));
    const entry = { state: 'connected', stopped: false, content: yaml.dump(config('admin-token-secret', 'https://127.0.0.1:45678')),
        listener: { address: () => ({ port: 45678 }) }, kubeconfigPath: path.join(runtimeDir, 'kubeconfig-remote.yaml') };
    const connections = { baseDir, runtimeDir, connections: new Map([['remote', entry]]), usesSSHForMonitoring: () => ssh };
    const monitor = new ClusterMonitor({ connections, kubectl: () => '/trusted/kubectl' });
    const calls = [], updates = [], kills = [];
    const publisher = new AppPublisher({ monitor, devspace: () => '/trusted/devspace', docker: () => '/trusted/docker', timeoutMs,
        onUpdate: update => updates.push(update),
        kill: (child, signal) => { kills.push({ child, signal }); setImmediate(() => child.emit('close', null, signal)); },
        launch: (executable, args, options) => {
            const child = new EventEmitter();
            child.pid = 12345;
            child.stdout = new PassThrough();
            child.stderr = new PassThrough();
            child.stdin = new PassThrough();
            const call = { executable, args, options, child, input: '' };
            child.stdin.on('data', data => { call.input += data; });
            const index = args.indexOf('--kubeconfig');
            if (index >= 0) {
                call.configPath = args[index + 1];
                call.config = yaml.load(fs.readFileSync(call.configPath, 'utf8'));
                call.mode = fs.statSync(call.configPath).mode & 0o777;
            }
            calls.push(call);
            if (launch) launch(call);
            else setImmediate(() => { child.stdout.write('done\n'); child.emit('close', 0); });
            return child;
        } });
    t.after(async () => {
        publisher.close();
        await Promise.all([...publisher.jobs.values()].map(job => job.completion));
        monitor.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });
    const start = file => publisher.start({ appId: app.id, file: file || 'devspace.yaml' });
    const wait = () => publisher.jobs.get(app.id).completion;
    return { publisher, calls, updates, kills, entry, connections, workspace, sourcePath, app, appDir,
        devspaceConfig, start, wait, tick: () => new Promise(resolve => setImmediate(resolve)) };
}

test('Publish uses SSH, app credentials, TLS and the resolved namespace without altering source kubeconfig', async t => {
    const f = fixture(t);
    const original = fs.readFileSync(f.sourcePath, 'utf8');
    f.start();
    await f.wait();
    assert.equal(f.calls.length, 2);
    const login = f.calls[0], deploy = f.calls[1];
    assert.equal(login.executable, '/trusted/docker');
    assert.deepEqual(login.args, ['login', 'registry.test:5000', '--username', "user ' name", '--password-stdin']);
    assert.equal(login.input, "password ' $ secret\n");
    assert.ok(!login.args.includes(f.devspaceConfig.pullSecrets.pullsecret.password));
    assert.equal(deploy.executable, '/trusted/devspace');
    assert.equal(deploy.args[0], 'deploy');
    assert.equal(deploy.args[deploy.args.indexOf('--namespace') + 1], 'office');
    assert.equal(deploy.args[deploy.args.indexOf('--kube-context') + 1], 'app-context');
    assert.ok(deploy.args.includes('--force-build'));
    assert.ok(deploy.args.includes('--skip-push-local-kube=false'));
    assert.equal(deploy.options.shell, false);
    assert.equal(deploy.options.cwd, f.workspace);
    assert.equal(deploy.options.env.KUBECONFIG, deploy.configPath);
    assert.match(deploy.options.env.NO_PROXY, /127\.0\.0\.1/);
    assert.equal(deploy.config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(deploy.config.users[0].user.token, 'app-token-secret');
    assert.equal(deploy.config.clusters[0].cluster['tls-server-name'], 'kubernetes.internal');
    assert.equal(deploy.config.clusters[0].cluster['insecure-skip-tls-verify'], undefined);
    assert.equal(deploy.mode, 0o600);
    assert.equal(fs.existsSync(deploy.configPath), false);
    assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), original);
    assert.equal(f.publisher.list()[0].status, 'succeeded');
});

test('disconnected SSH blocks before Docker login or deployment and does not fall back', t => {
    const f = fixture(t);
    f.entry.state = 'disconnected';
    assert.throws(() => f.start(), /Connect this cluster via SSH/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.publisher.list().length, 0);
});

test('Publish all waits for each process exit, not a success phrase in stdout', async t => {
    const f = fixture(t, { launch: () => {} });
    fs.writeFileSync(path.join(f.workspace, 'devspace-a.yaml'), 'version: v2beta1\n');
    f.start('all');
    await f.tick();
    assert.equal(f.calls.length, 1);
    f.calls[0].child.stdout.write('Successfully deployed\n');
    await f.tick();
    assert.equal(f.calls.length, 1);
    f.calls[0].child.emit('close', 0);
    await f.tick();
    assert.equal(f.calls.length, 2);
    f.calls[1].child.emit('close', 0);
    await f.tick();
    assert.equal(f.calls.length, 3);
    f.calls[2].child.emit('close', 0);
    await f.wait();
    assert.equal(f.publisher.list()[0].completed, 2);
    assert.equal(f.publisher.list()[0].status, 'succeeded');
});

test('nonzero deployment exits stop the queue and remain failed even after a success-looking log', async t => {
    const f = fixture(t, { launch: call => setImmediate(() => {
        call.child.stdout.write('Successfully deployed\n');
        call.child.stderr.write('RBAC denied\n');
        call.child.emit('close', 1);
    }) });
    fs.writeFileSync(path.join(f.workspace, 'devspace-a.yaml'), 'version: v2beta1\n');
    f.start('all');
    await f.wait();
    assert.equal(f.calls.length, 1);
    assert.equal(f.publisher.list()[0].status, 'failed');
    assert.match(f.publisher.list()[0].error, /RBAC denied/);
    assert.equal(f.publisher.list()[0].completed, 0);
});

test('SSH changes kill active publishing, retain an explicit failure, and clean its private config', async t => {
    const f = fixture(t, { launch: call => { if (call.executable.endsWith('docker')) setImmediate(() => call.child.emit('close', 0)); } });
    f.start();
    await f.tick();
    await f.tick();
    const deploy = f.calls[1];
    f.publisher.invalidate('remote');
    await f.wait();
    assert.equal(f.kills.length, 1);
    assert.equal(f.kills[0].signal, 'SIGTERM');
    assert.equal(f.publisher.list()[0].status, 'failed');
    assert.match(f.publisher.list()[0].error, /SSH connection change/);
    assert.equal(fs.existsSync(deploy.configPath), false);
    assert.equal(f.calls.length, 2);
});

test('cancellation uses job identity, blocks overlapping starts, and allows an explicit retry after cleanup', async t => {
    const f = fixture(t, { launch: () => {} });
    const started = f.start();
    assert.throws(() => f.start(), /already publishing/);
    assert.throws(() => f.publisher.cancel({ appId: f.app.id, jobId: 'stale' }), /no longer current/);
    await f.tick();
    f.publisher.cancel({ appId: f.app.id, jobId: started.jobId });
    await f.wait();
    assert.equal(f.publisher.list()[0].status, 'canceled');
    assert.match(f.publisher.list()[0].error, /not rolled back/);
    const retry = f.start();
    assert.notEqual(retry.jobId, started.jobId);
    f.publisher.cancel({ appId: f.app.id, jobId: retry.jobId });
    await f.wait();
});

test('per-command timeout stops a stalled deployment and marks it failed', async t => {
    const f = fixture(t, { timeoutMs: 10, launch: call => {
        if (call.executable.endsWith('docker')) setImmediate(() => call.child.emit('close', 0));
    } });
    f.start();
    await new Promise(resolve => setTimeout(resolve, 40));
    await f.wait();
    assert.equal(f.publisher.list()[0].status, 'failed');
    assert.match(f.publisher.list()[0].error, /timed out/);
    assert.equal(f.kills.length, 1);
});

test('direct and Minikube publishing keep their routes without global context switching', async t => {
    const direct = fixture(t, { ssh: false });
    direct.start();
    await direct.wait();
    assert.equal(direct.calls[1].configPath, direct.sourcePath);
    assert.equal(direct.calls[1].config.clusters[0].cluster.server, 'https://public.test:16443');
    const local = fixture(t, { local: true });
    local.start();
    await local.wait();
    assert.equal(local.calls.length, 1);
    assert.equal(local.calls[0].args[local.calls[0].args.indexOf('--kube-context') + 1], 'minikube');
    assert.ok(!local.calls[0].args.includes('--kubeconfig'));
    assert.ok(local.calls.every(call => !call.args.includes('use-context')));
});

test('Secrets and PVCs deploy over the same scoped SSH route before images build', async t => {
    const f = fixture(t);
    const secret = { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'db', namespace: 'office' }, stringData: { password: 'db-password-secret' } };
    fs.writeFileSync(path.join(f.workspace, 'secret-db.yaml'), yaml.dump(secret));
    f.start();
    await f.wait();
    assert.equal(f.calls[0].executable, '/trusted/kubectl');
    assert.deepEqual(f.calls[0].args.slice(0, 3), ['apply', '-f', '-']);
    assert.equal(yaml.load(f.calls[0].input).stringData.password, 'db-password-secret');
    assert.equal(f.calls[0].config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(f.calls[0].config.users[0].user.token, 'app-token-secret');
    secret.metadata.namespace = 'other';
    fs.writeFileSync(path.join(f.workspace, 'secret-db.yaml'), yaml.dump(secret));
    assert.throws(() => f.start(), /app namespace/);
});

test('output is bounded and redacts split registry passwords, kube tokens, and secret data', async t => {
    const f = fixture(t, { launch: call => setImmediate(() => {
        call.child.stdout.write("password ' $");
        call.child.stdout.write(' secret app-token-');
        call.child.stdout.write('secret\n');
        call.child.stdout.write('x'.repeat(100000) + '\n');
        call.child.emit('close', 0);
    }) });
    f.start();
    await f.wait();
    const snapshots = JSON.stringify(f.updates);
    assert.ok(!snapshots.includes("password ' $ secret"));
    assert.ok(!snapshots.includes('app-token-secret'));
    assert.match(snapshots, /redacted/);
    assert.match(snapshots, /Large output line omitted/);
    assert.ok(f.publisher.list()[0].log.length <= 65536);
});

test('spawn errors and shutdown cannot leave publishing falsely successful or its config behind', async t => {
    const f = fixture(t, { launch: call => setImmediate(() => {
        call.child.pid = undefined;
        call.child.emit('error', new Error('binary missing'));
        call.child.emit('close', -2);
    }) });
    f.start();
    await f.wait();
    assert.equal(f.publisher.list()[0].status, 'failed');
    assert.match(f.publisher.list()[0].error, /binary missing/);
    const stopped = fixture(t, { launch: () => {} });
    stopped.start();
    await stopped.tick();
    const temporary = stopped.publisher.jobs.get(stopped.app.id).temporary;
    stopped.publisher.close();
    assert.equal(fs.existsSync(temporary), false);
    await stopped.wait();
    assert.equal(stopped.publisher.list()[0].status, 'canceled');
    assert.throws(() => stopped.start(), /shutting down/);
});

test('invalid publishing requests and missing configurations are rejected before mutation', t => {
    const f = fixture(t);
    for (const request of [{ appId: '../app-id', file: 'devspace.yaml' }, { appId: f.app.id, file: '../devspace.yaml' },
        { appId: f.app.id, file: 'app.yaml' }]) assert.throws(() => f.publisher.start(request), /Invalid/);
    assert.throws(() => f.start('devspace-missing.yaml'), /ENOENT/);
    assert.equal(f.calls.length, 0);
});

test('a real local subprocess receives separately quoted-safe arguments and its SSH config lives until exit', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.workspace, 'devspace.yaml'), 'version: v2beta1\n');
    const binary = path.join(f.workspace, "devspace ' stub");
    fs.writeFileSync(binary, `#!${process.execPath}\nconst fs = require('fs');\nconsole.log(JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), exists: fs.existsSync(process.env.KUBECONFIG)}));\n`, { mode: 0o700 });
    f.publisher.devspace = () => binary;
    f.publisher.launch = require('node:child_process').spawn;
    f.start();
    await f.wait();
    const result = f.publisher.list()[0];
    assert.equal(result.status, 'succeeded');
    const record = JSON.parse(result.log.split('\n').find(line => line.startsWith('{')));
    assert.equal(record.args[0], 'deploy');
    assert.equal(record.args[record.args.indexOf('--config') + 1], 'devspace.yaml');
    assert.equal(record.cwd, fs.realpathSync(f.workspace));
    assert.equal(record.exists, true);
    assert.equal(fs.existsSync(record.args[record.args.indexOf('--kubeconfig') + 1]), false);
});
