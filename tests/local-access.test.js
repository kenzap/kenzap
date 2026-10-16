const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const yaml = require('js-yaml');
const { ClusterMonitor } = require('../src/main/cluster-monitor');
const { LocalAccess, availablePort } = require('../src/main/local-access');

function config(token, server = 'https://public.test:16443') {
    return { apiVersion: 'v1', kind: 'Config', 'current-context': 'app-context',
        clusters: [{ name: 'cluster', cluster: { server, 'tls-server-name': 'kubernetes.internal',
            'certificate-authority-data': Buffer.from('trusted-ca').toString('base64') } }],
        contexts: [{ name: 'app-context', context: { cluster: 'cluster', user: 'app-user', namespace: 'office' } }],
        users: [{ name: 'app-user', user: { token } }] };
}

function fixture(t, { ssh = true, local = false, delayedClose = false, retryDelays = [1, 1], startupMs, launch } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-local-'));
    const baseDir = path.join(directory, 'Kenzap'), runtimeDir = path.join(directory, 'runtime');
    const appDir = path.join(baseDir, 'app-id'), workspace = path.join(directory, "workspace ' with spaces");
    for (const dir of [path.join(baseDir, '.kenzap'), runtimeDir, appDir, workspace]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(baseDir, '.kenzap', '.config'), JSON.stringify({ clusters: [{ id: 'remote' }] }));
    const app = { id: 'app-id', path: workspace, clusters: [local ? 'local' : 'remote'], namespace: 'office' };
    fs.writeFileSync(path.join(appDir, '.kenzap'), JSON.stringify(app));
    const sourcePath = path.join(workspace, 'kubeconfig-20261007.yaml');
    fs.writeFileSync(sourcePath, yaml.dump(config('app-token-secret')));
    fs.writeFileSync(path.join(baseDir, '.kenzap', 'kubeconfig-remote.yaml'), yaml.dump(config('admin-token-secret')));
    const service = { apiVersion: 'v1', kind: 'Service', metadata: { name: 'web', namespace: 'office' },
        spec: { selector: { app: 'office' }, ports: [{ name: 'http', port: 80, targetPort: 8081 }, { name: 'mysql', port: 3306, targetPort: 'mysql' }] } };
    const file = path.join(workspace, 'endpoints.yaml');
    const write = value => fs.writeFileSync(file, yaml.dump(value)); write(service);
    const entry = { state: 'connected', stopped: false, content: yaml.dump(config('admin-token-secret', 'https://127.0.0.1:45678')),
        listener: { address: () => ({ port: 45678 }) }, kubeconfigPath: path.join(runtimeDir, 'kubeconfig-remote.yaml') };
    const connections = { baseDir, runtimeDir, connections: new Map([['remote', entry]]), usesSSHForMonitoring: () => ssh };
    const monitor = new ClusterMonitor({ connections, kubectl: () => '/trusted/kubectl' });
    const calls = [], updates = [], kills = [];
    const access = new LocalAccess({ monitor, retryDelays, startupMs, onUpdate: update => updates.push(update),
        kill: (child, signal) => { kills.push(signal); if (!delayedClose || signal === 'SIGKILL') setImmediate(() => child.emit('close', null, signal)); },
        launch: (executable, args, options) => {
            const child = new EventEmitter(); child.pid = 12345;
            child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
            const call = { executable, args, options, child };
            const index = args.indexOf('--kubeconfig');
            if (index >= 0) { call.configPath = args[index + 1]; call.config = yaml.load(fs.readFileSync(call.configPath, 'utf8')); call.mode = fs.statSync(call.configPath).mode & 0o777; }
            calls.push(call); if (launch) launch(call); return child;
        } });
    t.after(async () => {
        access.close(); await Promise.all([...access.jobs.values()].map(job => job.completion));
        monitor.close(); fs.rmSync(directory, { recursive: true, force: true });
    });
    const targetId = access.describe(app.id).rows[0].targetId;
    const request = { appId: app.id, targetId, localPort: 8080 };
    const start = overrides => access.start({ ...request, ...overrides });
    const job = () => access.jobs.get(targetId);
    const stop = () => access.stop({ ...request, jobId: job().jobId });
    const ready = (index = calls.length - 1) => calls[index].child.stdout.write('Forwarding from 127.0.0.1:8080 -> 8081\n');
    const wait = () => job().completion;
    const tick = () => new Promise(resolve => setImmediate(resolve));
    const connection = state => { entry.state = state; access.connectionChanged({ id: 'remote', state }); };
    return { access, monitor, calls, updates, kills, entry, connections, workspace, sourcePath, app, appDir, service, file, write,
        targetId, request, start, stop, ready, wait, tick, job, connection };
}

test('catalog exposes every Service port without deploying or editing endpoint configuration', t => {
    const f = fixture(t), source = fs.readFileSync(f.file, 'utf8');
    const catalog = f.access.describe(f.app.id);
    assert.equal(catalog.transport, 'ssh'); assert.equal(catalog.rows.length, 2);
    assert.equal(catalog.rows[0].scheme, 'http'); assert.equal(catalog.rows[0].localPort, 8080);
    assert.equal(catalog.rows[1].scheme, ''); assert.equal(catalog.rows[1].localPort, 3306);
    assert.equal(catalog.rows[0].fingerprint, undefined);
    assert.equal(f.calls.length, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), source);
    f.entry.state = 'disconnected'; assert.equal(f.access.describe(f.app.id).rows.length, 2);
});

test('port-forward is loopback-only through verified TLS with app credentials and explicit context/namespace', async t => {
    const f = fixture(t), source = fs.readFileSync(f.sourcePath, 'utf8'), manifest = fs.readFileSync(f.file, 'utf8');
    const result = f.start(); await f.tick();
    const call = f.calls[0];
    assert.equal(result.status, 'starting'); assert.equal(result.url, '');
    assert.deepEqual(call.args.slice(0, 3), ['port-forward', 'service/web', '8080:80']);
    for (const [flag, value] of [['--address', '127.0.0.1'], ['--namespace', 'office'], ['--context', 'app-context']]) assert.equal(call.args[call.args.indexOf(flag) + 1], value);
    assert.equal(call.executable, '/trusted/kubectl'); assert.equal(call.options.cwd, f.workspace); assert.equal(call.options.shell, false);
    assert.equal(call.options.env.KUBECONFIG, call.configPath); assert.match(call.options.env.NO_PROXY, /127.0.0.1/);
    assert.equal(call.config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(call.config.clusters[0].cluster['tls-server-name'], 'kubernetes.internal');
    assert.equal(call.config.clusters[0].cluster['insecure-skip-tls-verify'], undefined);
    assert.equal(call.config.users[0].user.token, 'app-token-secret'); assert.equal(call.mode, 0o600);
    call.child.stdout.write('Forwarding from 127.0.0.1:8080');
    assert.equal(f.access.list()[0].status, 'starting');
    call.child.stdout.write(' -> 8081\n');
    assert.equal(f.access.list()[0].status, 'running');
    assert.equal(f.access.open({ ...f.request, jobId: result.jobId }), 'http://127.0.0.1:8080/');
    assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), source); assert.equal(fs.readFileSync(f.file, 'utf8'), manifest);
    f.stop(); await f.wait(); assert.equal(fs.existsSync(call.configPath), false);
});

test('SSH disconnected blocks new forwards and never falls back to the public API', t => {
    const f = fixture(t); f.entry.state = 'disconnected';
    assert.throws(f.start, /Connect this cluster via SSH/); assert.equal(f.calls.length, 0);
});

test('port choices persist privately, but enabled state is never persisted', async t => {
    const f = fixture(t); f.access.configure({ ...f.request, localPort: 9090 });
    assert.equal(f.access.describe(f.app.id).rows[0].localPort, 9090);
    assert.equal(fs.statSync(f.access.preferencesPath).mode & 0o777, 0o600);
    f.start({ localPort: 9090 }); await f.tick();
    assert.throws(() => f.access.configure({ ...f.request, localPort: 9091 }), /Turn off/);
    const second = new LocalAccess({ monitor: f.monitor });
    assert.equal(second.describe(f.app.id).rows[0].localPort, 9090); assert.deepEqual(second.list(), []); second.close();
    assert.deepEqual(JSON.parse(fs.readFileSync(f.access.preferencesPath, 'utf8')), { [f.targetId]: 9090 });
});

test('damaged optional preferences do not stop app startup or enable any forwards', t => {
    const f = fixture(t); fs.writeFileSync(f.access.preferencesPath, '{incomplete');
    const second = new LocalAccess({ monitor: f.monitor });
    assert.deepEqual(second.list(), []);
    assert.match(second.describe(f.app.id).warning, /could not be loaded/);
    second.configure({ ...f.request, localPort: 9090 });
    assert.equal(second.describe(f.app.id).warning, ''); second.close();
});

test('Stop before the queued subprocess launches prevents opening any listener', async t => {
    const f = fixture(t); f.start(); f.stop(); await f.wait();
    assert.equal(f.calls.length, 0); assert.equal(f.job().status, 'stopped');
});

test('SSH loss pauses and reconnect resumes with new tunnel without overlapping a closing child', async t => {
    const f = fixture(t, { delayedClose: true }); const first = f.start(); await f.tick(); f.ready();
    f.connection('disconnected'); f.connection('connected'); await f.tick();
    assert.equal(f.calls.length, 1); assert.equal(f.job().status, 'pausing');
    f.entry.listener = { address: () => ({ port: 56789 }) };
    f.entry.content = yaml.dump(config('admin-new', 'https://127.0.0.1:56789'));
    f.calls[0].child.emit('close', 0); await f.wait(); await f.tick(); await f.tick();
    assert.equal(f.calls.length, 2); assert.equal(f.job().jobId, first.jobId);
    assert.equal(f.calls[1].config.clusters[0].cluster.server, 'https://127.0.0.1:56789');
    assert.equal(f.calls[1].config.users[0].user.token, 'app-token-secret');
    assert.equal(fs.existsSync(f.calls[0].configPath), false);
});

test('Stop during pausing prevents resume, waits for process close, and works without workspace', async t => {
    const f = fixture(t, { delayedClose: true }); f.start(); await f.tick();
    f.connection('disconnected'); fs.unlinkSync(f.file); f.stop(); f.connection('connected');
    assert.equal(f.job().desired, false); assert.equal(f.job().status, 'stopping');
    f.calls[0].child.emit('close', 0); await f.wait(); await f.tick(); assert.equal(f.calls.length, 1);
    assert.equal(f.job().status, 'stopped');
});

test('pod replacement retries are bounded and Stop cancels pending retries', async t => {
    const f = fixture(t); f.start(); await f.tick(); f.ready();
    f.calls[0].child.emit('close', 1); await f.wait();
    assert.equal(f.job().status, 'retrying');
    await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(f.calls.length, 2);
    f.calls[1].child.emit('close', 1); await f.wait();
    await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(f.calls.length, 3);
    f.calls[2].child.emit('close', 1); await f.wait(); assert.equal(f.job().status, 'failed'); assert.equal(f.job().desired, false);
    const stopped = fixture(t, { retryDelays: [20] }); stopped.start(); await stopped.tick();
    stopped.calls[0].child.emit('close', 1); await stopped.wait(); stopped.stop();
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(stopped.calls.length, 1);
});

test('occupied ports and RBAC failures are visible errors, not endlessly retried or reported ready', async t => {
    for (const message of ['unable to listen on port: address already in use', 'Forbidden: pods/portforward denied']) {
        const f = fixture(t); f.start(); await f.tick();
        f.calls[0].child.stderr.write(message + '\n'); f.calls[0].child.emit('close', 1); await f.wait();
        assert.equal(f.job().status, 'failed'); assert.equal(f.job().desired, false); assert.equal(f.calls.length, 1);
        assert.match(f.job().error, /Port 8080 is unavailable|Forbidden/);
        assert.throws(() => f.access.open({ ...f.request, jobId: f.job().jobId }), /Start a web/);
    }
});

test('readiness timeout and spawn error clean credentials and expose failure', async t => {
    const f = fixture(t, { startupMs: 5 }); f.start(); await new Promise(resolve => setTimeout(resolve, 20)); await f.wait();
    assert.equal(f.job().status, 'failed'); assert.match(f.job().error, /did not start in time/); assert.equal(fs.existsSync(f.calls[0].configPath), false);
    const spawn = fixture(t, { launch: call => setImmediate(() => { call.child.pid = undefined; call.child.emit('error', new Error('ENOENT')); }) });
    spawn.start(); await spawn.wait(); assert.equal(spawn.job().status, 'failed'); assert.equal(spawn.calls.length, 1);
});

test('target changes while paused prevent automatic forwarding to another Service or namespace', async t => {
    const f = fixture(t); f.start(); await f.tick(); f.connection('disconnected'); await f.wait();
    f.service.spec.selector.app = 'another'; f.write(f.service); f.connection('connected'); await f.tick();
    assert.equal(f.job().status, 'failed'); assert.match(f.job().error, /Service changed/); assert.equal(f.calls.length, 1);
});

test('endpoint removal stops affected sessions without changing independent forwards', async t => {
    const f = fixture(t); f.start(); await f.tick();
    const database = f.access.describe(f.app.id).rows[1];
    const other = f.access.start({ ...f.request, targetId: database.targetId, localPort: 3307 }); await f.tick();
    f.service.spec.ports.shift(); f.write(f.service); f.access.reconcile(f.app.id); await f.wait();
    assert.equal(f.job().status, 'failed'); assert.equal(f.job().desired, false);
    assert.equal(f.access.jobs.get(other.targetId).desired, true);
});

test('Service changes while an SSH pause is closing revoke resume and report failure, not a misleading pause', async t => {
    const f = fixture(t, { delayedClose: true }); f.start(); await f.tick();
    f.connection('disconnected'); f.service.spec.selector.app = 'another'; f.write(f.service);
    f.access.reconcile(f.app.id); f.connection('connected');
    f.calls[0].child.emit('close', 0); await f.wait(); await f.tick();
    assert.equal(f.job().status, 'failed'); assert.equal(f.job().desired, false);
    assert.equal(f.calls.length, 1); assert.match(f.job().error, /Service changed/);
});

test('invalid, UDP, selectorless, and cross-namespace targets are rejected before spawning', t => {
    const f = fixture(t);
    for (const port of [0, 65536, 1.2, NaN, true, '8080']) assert.throws(() => f.start({ localPort: port }), /local port/);
    assert.throws(() => f.start({ targetId: '../bad' }), /no longer/);
    assert.throws(() => f.start({ appId: '../bad' }), /Invalid app/);
    f.service.metadata.namespace = 'another'; f.write(f.service);
    assert.throws(() => f.start({ targetId: f.access.describe(f.app.id).rows[0].targetId }), /outside the app namespace/);
    f.service.metadata.namespace = 'office'; f.service.spec.ports[0].protocol = 'UDP'; f.write(f.service);
    assert.throws(() => f.start({ targetId: f.access.describe(f.app.id).rows[0].targetId }), /Only TCP/);
    delete f.service.spec.ports[0].protocol; delete f.service.spec.selector; f.write(f.service);
    assert.throws(f.start, /no pod selector/); assert.equal(f.calls.length, 0);
});

test('multiple independent forwards can coexist and stale or mismatched Stop/open requests are rejected', async t => {
    const f = fixture(t); const web = f.start(); await f.tick(); f.ready();
    const row = f.access.describe(f.app.id).rows[1]; const db = f.access.start({ ...f.request, targetId: row.targetId, localPort: 3307 }); await f.tick();
    f.calls[1].child.stdout.write('Forwarding from 127.0.0.1:3307 -> 3306\n');
    assert.equal(f.access.list().filter(session => session.status === 'running').length, 2);
    assert.throws(f.start, /already enabled/);
    assert.throws(() => f.access.stop({ ...f.request, jobId: 'stale' }), /no longer current/);
    assert.throws(() => f.access.stop({ ...f.request, appId: 'another', jobId: web.jobId }), /no longer current/);
    assert.throws(() => f.access.open({ ...f.request, targetId: db.targetId, jobId: db.jobId }), /Start a web/);
});

test('direct/Minikube keep explicit existing routes; closing kills children and clears private configs synchronously', async t => {
    const direct = fixture(t, { ssh: false }); direct.start(); await direct.tick();
    assert.equal(direct.calls[0].configPath, direct.sourcePath);
    const local = fixture(t, { local: true }); local.start(); await local.tick();
    assert.equal(local.calls[0].args[local.calls[0].args.indexOf('--context') + 1], 'minikube'); assert.ok(!local.calls[0].args.includes('--kubeconfig'));
    const f = fixture(t, { delayedClose: true }); f.start(); await f.tick();
    f.access.close(); assert.equal(fs.existsSync(f.calls[0].configPath), false); assert.deepEqual(f.kills, ['SIGTERM', 'SIGKILL']);
    await f.wait(); assert.throws(f.start, /shutting down/);
});

test('free-port suggestion returns an available loopback port without retaining a listener', async () => {
    const port = await availablePort(); const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    assert.equal(server.address().address, '127.0.0.1'); await new Promise(resolve => server.close(resolve));
});

test('a real local subprocess binds only loopback, survives navigation, and releases its listener/config on Stop', { timeout: 5000 }, async t => {
    const f = fixture(t);
    const port = await availablePort();
    const binary = path.join(f.workspace, "kubectl ' stub");
    fs.writeFileSync(binary, `#!${process.execPath}\nconst net = require('net');\nconst fs = require('fs');\nconst args = process.argv.slice(2);\nconst port = Number(args[2].split(':')[0]);\nconst server = net.createServer(socket => socket.end('private test'));\nprocess.on('SIGTERM', () => server.close(() => process.exit(0)));\nserver.listen(port, args[args.indexOf('--address') + 1], () => {\nconsole.log(JSON.stringify({args, cwd: process.cwd(), privateConfig: fs.existsSync(process.env.KUBECONFIG), host: server.address().address}));\nconsole.log('Forwarding from 127.0.0.1:' + port + ' -> 8081');\n});\n`, { mode: 0o700 });
    f.monitor.kubectl = () => binary;
    f.access.launch = require('node:child_process').spawn;
    f.access.kill = (child, signal) => process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal);
    const ready = new Promise(resolve => { f.access.onUpdate = update => { if (update.status === 'running') resolve(); }; });
    f.start({ localPort: port }); await ready;
    const record = JSON.parse(f.job().log.split('\n').find(line => line.startsWith('{')));
    assert.equal(record.host, '127.0.0.1'); assert.equal(record.privateConfig, true);
    assert.equal(record.cwd, fs.realpathSync(f.workspace)); assert.equal(record.args[0], 'port-forward');
    const data = await new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1'); let text = '';
        socket.on('data', chunk => { text += chunk; }); socket.once('end', () => resolve(text)); socket.once('error', reject);
    });
    assert.equal(data, 'private test');
    assert.equal(f.access.describe(f.app.id).sessions[0].status, 'running');
    f.stop(); await f.wait();
    assert.equal(fs.existsSync(record.args[record.args.indexOf('--kubeconfig') + 1]), false);
    await new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); reject(new Error('The listener must close after Stop')); });
        socket.once('error', error => { assert.equal(error.code, 'ECONNREFUSED'); resolve(); });
    });
});
