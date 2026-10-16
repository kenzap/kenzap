const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');
const { AppCreator } = require('../src/main/app-creator');
const { AppPublisher } = require('../src/main/app-publisher');
const { ClusterMonitor } = require('../src/main/cluster-monitor');
const { resolveTemplatesPath } = require('../src/assets/js/templates-path');

function fixture(t, { local = false, ssh = true, namespaceExists = false, fail, hang = false, realCertificates = false, validateCertificate = () => true } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-creator-'));
    const baseDir = path.join(directory, 'Kenzap'), runtimeDir = path.join(directory, 'runtime');
    fs.mkdirSync(path.join(baseDir, '.kenzap'), { recursive: true }); fs.mkdirSync(runtimeDir);
    fs.writeFileSync(path.join(baseDir, '.kenzap', '.config'), JSON.stringify({ clusters: [{ id: 'remote' }] }));
    const config = { apiVersion: 'v1', kind: 'Config', 'current-context': 'admin',
        clusters: [{ name: 'cluster', cluster: { server: 'https://public.test:16443', 'tls-server-name': 'kubernetes.internal', 'certificate-authority-data': Buffer.from('ca').toString('base64') } }],
        users: [{ name: 'admin', user: { token: 'admin-secret-token' } }], contexts: [{ name: 'admin', context: { cluster: 'cluster', user: 'admin' } }] };
    const sourcePath = path.join(baseDir, '.kenzap', 'kubeconfig-remote.yaml'); fs.writeFileSync(sourcePath, yaml.dump(config));
    const trusted = JSON.parse(JSON.stringify(config)); trusted.clusters[0].cluster.server = 'https://127.0.0.1:45678';
    const entry = { state: 'connected', stopped: false, content: yaml.dump(trusted), listener: { address: () => ({ port: 45678 }) }, kubeconfigPath: path.join(runtimeDir, 'kubeconfig-remote.yaml') };
    fs.writeFileSync(entry.kubeconfigPath, entry.content);
    const connections = { baseDir, runtimeDir, connections: new Map([['remote', entry]]), usesSSHForMonitoring: () => ssh };
    const monitor = new ClusterMonitor({ connections, kubectl: () => '/trusted/kubectl' });
    const calls = [], updates = []; let certificate = Buffer.from('app-certificate').toString('base64');
    const creator = new AppCreator({ monitor, templatesDir: resolveTemplatesPath({ development: true,
        moduleDirectory: path.resolve(__dirname, '../dist/main'), resourcesPath: '/unused/electron/resources' }), sleep: async () => {}, validateCertificate: realCertificates ? undefined : validateCertificate,
        onUpdate: update => updates.push(update), execute: (executable, args, options, callback) => {
            const record = { executable, args, options, input: '' }; calls.push(record);
            const stdin = new PassThrough(); stdin.on('data', data => { record.input += data; });
            const child = { stdin, kill: () => { record.killed = true; setImmediate(() => callback(new Error('killed'), '', 'creation interrupted')); } };
            stdin.on('finish', () => {
                if (hang) return;
                setImmediate(() => {
                    if (fail && fail(record)) { callback(new Error('failed'), '', fail(record)); return; }
                    let output = '';
                    if (args[0] === 'get' && args[1] === 'namespace') output = namespaceExists ? '{"metadata":{"name":"new-office"}}' : '';
                    if (args[0] === 'get' && args[1] === 'csr') output = JSON.stringify({ status: { certificate } });
                    if (args[0] === 'req') {
                        output = 'app CSR';
                        if (realCertificates) {
                            output = execFileSync(executable, args, { encoding: 'utf8' });
                            certificate = execFileSync(executable, ['req', '-new', '-x509', '-key', args[args.indexOf('-key') + 1], '-subj', args[args.indexOf('-subj') + 1], '-days', '1']).toString('base64');
                        }
                    }
                    callback(null, output, '');
                });
            });
            return child;
        } });
    t.after(() => { creator.close(); monitor.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    const request = { title: 'New Office', namespace: 'new-office', image: 'nginx', image_id: '1', platform: 'linux/amd64',
        clusters: [local ? 'local' : 'remote'], registry: { domain: local ? '' : 'registry.test/team/new-office', user: local ? '' : 'user', pass: local ? '' : 'registry-password' } };
    return { creator, monitor, calls, updates, entry, connections, sourcePath, baseDir, request, create: overrides => creator.create({ ...request, ...overrides }) };
}

test('new app creation uses SSH for admin setup but saves only a new namespace-scoped app identity', async t => {
    const f = fixture(t), original = fs.readFileSync(f.sourcePath, 'utf8');
    const app = await f.create();
    assert.equal(app.dnsManaged, false); assert.equal(app.status, 'unpublished');
    const configPath = path.join(app.path, 'kubeconfig-remote.yaml'), config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.contexts[0].context.namespace, app.namespace); assert.equal(config.users.length, 1);
    assert.ok(config.users[0].user['client-certificate-data']); assert.ok(config.users[0].user['client-key-data']); assert.equal(config.users[0].user.token, undefined);
    assert.equal(config.clusters[0].cluster.server, 'https://public.test:16443'); assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), original);
    for (const call of f.calls.filter(call => call.executable === '/trusted/kubectl')) {
        assert.equal(call.args[call.args.indexOf('--kubeconfig') + 1], f.entry.kubeconfigPath); assert.equal(call.options.shell, false);
        assert.ok(!call.args.includes('use-context')); assert.ok(!call.args.includes('finalize'));
    }
    const creates = f.calls.filter(call => call.args[0] === 'create').flatMap(call => yaml.loadAll(call.input));
    const role = creates.find(doc => doc.kind === 'Role');
    assert.equal(role.metadata.namespace, app.namespace); assert.ok(role.rules.some(rule => rule.resources.includes('persistentvolumeclaims')));
    assert.ok(role.rules.some(rule => rule.resources.includes('pods/log') && rule.resources.includes('pods/portforward')));
    const deletes = f.calls.filter(call => call.args[0] === 'delete'); assert.equal(deletes.length, 1); assert.equal(deletes[0].args[1], 'csr');
    assert.ok(f.updates.every(update => !JSON.stringify(update).includes('registry-password') && !JSON.stringify(update).includes('admin-secret-token')));
    assert.ok(!fs.readdirSync(f.connections.runtimeDir).some(name => name.startsWith('create-')));
});

test('existing namespaces/folders are never overwritten or deleted', async t => {
    const f = fixture(t, { namespaceExists: true });
    await assert.rejects(f.create(), /namespace already exists/); assert.equal(f.calls.length, 1);
    assert.equal(fs.existsSync(path.join(f.baseDir, 'new-office')), false);
    const file = fixture(t); fs.mkdirSync(path.join(file.baseDir, 'new-office')); fs.writeFileSync(path.join(file.baseDir, 'new-office', 'keep'), 'user data');
    await assert.rejects(file.create(), /already exists/); assert.equal(file.calls.length, 0);
    assert.equal(fs.readFileSync(path.join(file.baseDir, 'new-office', 'keep'), 'utf8'), 'user data');
});

test('disconnected SSH blocks before file changes or provisioning, with no public fallback', async t => {
    const f = fixture(t); f.entry.state = 'disconnected';
    await assert.rejects(f.create(), /Monitoring paused/); assert.equal(f.calls.length, 0);
    assert.equal(fs.existsSync(path.join(f.baseDir, 'new-office')), false);
});

test('invalid app/custom inputs fail before cluster creation', async t => {
    const f = fixture(t);
    for (const namespace of ['../bad', 'kube-system', 'default', 'a'.repeat(64)]) await assert.rejects(f.create({ namespace }));
    await assert.rejects(f.create({ registry: { domain: '', user: '', pass: '' } }), /image repository/);
    await assert.rejects(f.create({ image: 'custom' }), /valid Dockerfile/);
    assert.equal(f.calls.length, 0);
});

test('provisioning errors do not delete a newly allocated namespace or expose registry secrets', async t => {
    const f = fixture(t, { fail: call => call.args[0] === 'certificate' ? 'Denied registry-password admin-secret-token' : '' });
    await assert.rejects(f.create(), error => /Namespace "new-office" was created but was not deleted/.test(error.message) && !error.message.includes('registry-password') && !error.message.includes('admin-secret-token'));
    assert.ok(!f.calls.some(call => call.args[0] === 'delete' && call.args[1] === 'namespace'));
    assert.equal(fs.existsSync(path.join(f.baseDir, 'new-office', '.kenzap')), false);
    assert.ok(!fs.readdirSync(f.connections.runtimeDir).some(name => name.startsWith('create-')));
});

test('invalid signed certificate cannot be saved as a publishable app identity', async t => {
    const f = fixture(t, { validateCertificate: () => false });
    await assert.rejects(f.create(), /valid app certificate/); assert.equal(fs.existsSync(path.join(f.baseDir, 'new-office', '.kenzap')), false);
});

test('production certificate validation accepts a real certificate matching the locally generated private key', async t => {
    const f = fixture(t, { realCertificates: true });
    const app = await f.create();
    const config = yaml.load(fs.readFileSync(path.join(app.path, 'kubeconfig-remote.yaml'), 'utf8'));
    assert.ok(config.users[0].user['client-certificate-data']);
    assert.match(Buffer.from(config.users[0].user['client-key-data'], 'base64').toString(), /BEGIN PRIVATE KEY/);
});

test('explicit direct clusters still provision using the selected admin config, without changing that config', async t => {
    const f = fixture(t, { ssh: false }), original = fs.readFileSync(f.sourcePath, 'utf8');
    await f.create();
    const calls = f.calls.filter(call => call.executable === '/trusted/kubectl');
    assert.ok(calls.every(call => call.args[call.args.indexOf('--kubeconfig') + 1] === f.sourcePath));
    assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), original);
});

test('local certificate preparation failures happen before allocating a namespace', async t => {
    const f = fixture(t, { fail: call => call.args[0] === 'req' ? 'Unable to prepare app certificate' : '' });
    await assert.rejects(f.create(), /Unable to prepare app certificate/);
    assert.ok(!f.calls.some(call => call.args[0] === 'create'));
    assert.equal(fs.existsSync(path.join(f.baseDir, 'new-office')), false);
});

test('Minikube creates a private local workspace without changing the global kube context or requiring hosted registry', async t => {
    const f = fixture(t, { local: true }); const app = await f.create();
    assert.equal(f.calls.length, 2); assert.ok(f.calls.every(call => call.args.includes('minikube') && !call.args.includes('use-context')));
    assert.ok(!fs.existsSync(path.join(app.path, 'kubeconfig-local.yaml')));
    const config = yaml.load(fs.readFileSync(path.join(app.path, 'devspace.yaml'), 'utf8'));
    assert.equal(config.pullSecrets, undefined); assert.equal(config.images.app.image, 'kenzap-local/new-office');
});

test('connection changes interrupt a pending creation and do not continue against another route', async t => {
    const f = fixture(t, { hang: true }); const pending = f.create();
    f.creator.invalidate('remote'); await assert.rejects(pending, /creation stopped/);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].killed, true);
});

test('freshly created apps can Publish through SSH with their own identity, private Services and persisted completion', async t => {
    const f = fixture(t); const app = await f.create(); const calls = [];
    const publisher = new AppPublisher({ monitor: f.monitor, devspace: () => '/trusted/devspace', docker: () => '/trusted/docker', launch: (executable, args, options) => {
        const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
        const call = { executable, args, options, input: '' }; calls.push(call); child.stdin.on('data', data => { call.input += data; });
        const index = args.indexOf('--kubeconfig'); if (index >= 0) call.config = yaml.load(fs.readFileSync(args[index + 1], 'utf8'));
        setImmediate(() => child.emit('close', 0)); return child;
    } });
    publisher.start({ appId: app.id, file: 'all' }); await publisher.jobs.get(app.id).completion;
    assert.equal(publisher.list()[0].status, 'succeeded');
    assert.equal(calls[0].args[0], 'apply'); assert.ok(yaml.loadAll(calls[0].input).every(doc => doc.kind === 'Service'));
    const deploy = calls.find(call => call.args[0] === 'deploy');
    assert.equal(deploy.config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(deploy.config.users[0].user.token, undefined); assert.ok(deploy.config.users[0].user['client-certificate-data']);
    assert.equal(deploy.args[deploy.args.indexOf('--namespace') + 1], app.namespace);
    assert.equal(JSON.parse(fs.readFileSync(path.join(app.path, '.kenzap'), 'utf8')).status, 'published');
    publisher.close();
});
