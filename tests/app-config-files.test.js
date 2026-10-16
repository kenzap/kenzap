const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const yaml = require('js-yaml');
const { AppConfigFiles, parseManifest } = require('../src/main/app-config-files');
const { ClusterMonitor } = require('../src/main/cluster-monitor');

function fixture(t, { ssh = true, local = false, execute, confirm = async () => true, canMutate, live = [] } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-config-files-'));
    const baseDir = path.join(directory, 'Kenzap'), appDir = path.join(baseDir, 'office'), runtimeDir = path.join(directory, 'runtime');
    const workspace = path.join(directory, "workspace ' with spaces");
    for (const dir of [path.join(baseDir, '.kenzap'), appDir, runtimeDir, workspace]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(baseDir, '.kenzap', '.config'), JSON.stringify({ clusters: [{ id: 'remote', name: 'Production' }, { id: 'second', name: 'Staging' }] }));
    const app = { id: 'office', namespace: 'app-prod', path: workspace, clusters: [local ? 'local' : 'remote'] };
    fs.writeFileSync(path.join(appDir, '.kenzap'), JSON.stringify(app));
    const config = { apiVersion: 'v1', kind: 'Config', 'current-context': 'app-context',
        clusters: [{ name: 'cluster', cluster: { server: 'https://public.test:16443', 'tls-server-name': 'kubernetes.internal', 'certificate-authority-data': Buffer.from('ca').toString('base64') } }],
        contexts: [{ name: 'app-context', context: { cluster: 'cluster', user: 'app', namespace: 'app-prod' } }], users: [{ name: 'app', user: { token: 'app-token-secret' } }] };
    const sourcePath = path.join(workspace, 'kubeconfig-remote.yaml'); fs.writeFileSync(sourcePath, yaml.dump(config));
    const admin = JSON.parse(JSON.stringify(config)); admin.users[0].user.token = 'admin-secret'; admin.clusters[0].cluster.server = 'https://127.0.0.1:45678';
    const entry = { state: 'connected', stopped: false, content: yaml.dump(admin), listener: { address: () => ({ port: 45678 }) }, kubeconfigPath: path.join(runtimeDir, 'kubeconfig-remote.yaml') };
    fs.writeFileSync(entry.kubeconfigPath, entry.content);
    for (const id of ['remote', 'second']) fs.writeFileSync(path.join(baseDir, '.kenzap', `kubeconfig-${id}.yaml`), yaml.dump({ ...config, users: admin.users }));
    const connections = { baseDir, runtimeDir, connections: new Map([['remote', entry], ['second', entry]]), usesSSHForMonitoring: () => ssh };
    const monitor = new ClusterMonitor({ connections, kubectl: () => '/trusted/kubectl' });
    const calls = [], prompts = [], opened = [], trashed = [], changed = [];
    const manager = new AppConfigFiles({ monitor, canMutate, confirm: details => { prompts.push(details); return confirm(details); },
        openFile: async file => { opened.push(file); return ''; }, trashFile: async file => { trashed.push(file); fs.unlinkSync(file); },
        onChanged: details => changed.push(details), execute: (executable, args, options, callback) => {
            const call = { executable, args, options, input: '', callback }; calls.push(call);
            const index = args.indexOf('--kubeconfig');
            if (index >= 0) { call.configPath = args[index + 1]; call.config = yaml.load(fs.readFileSync(call.configPath, 'utf8')); call.mode = fs.statSync(call.configPath).mode & 0o777; }
            const stdin = new EventEmitter(); stdin.end = input => { call.input = input; };
            if (execute) execute(call);
            else setImmediate(() => callback(null, args.includes('--raw') ? JSON.stringify({ resources: [
                { name: 'cronjobs', kind: 'CronJob', namespaced: true }, { name: 'configmaps', kind: 'ConfigMap', namespaced: true },
                { name: 'secrets', kind: 'Secret', namespaced: true }, { name: 'namespaces', kind: 'Namespace', namespaced: false },
                { name: 'widgets', kind: 'Widget', namespaced: true }
            ] }) : args[0] === 'get' && args.includes('json') ? JSON.stringify({ apiVersion: 'v1', kind: 'List', items: live }) : 'cronjob.batch/daily-job\n', ''));
            return { stdin, kill: () => { call.killed = true; } };
        } });
    const cron = { apiVersion: 'batch/v1', kind: 'CronJob', metadata: { name: 'daily-job', namespace: 'app-prod' }, spec: { schedule: '0 2 * * *', jobTemplate: { spec: { template: { spec: { restartPolicy: 'Never', containers: [{ name: 'job', image: 'busybox', command: ['echo', 'hello'] }] } } } } } };
    const write = (file, value) => { const target = path.join(workspace, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === 'string' ? value : yaml.dump(value)); return target; };
    write('etc/cron-icc-prod.yaml', cron);
    const list = () => manager.list({ appId: 'office' });
    const request = (file = 'etc/cron-icc-prod.yaml', extra = {}) => ({ appId: 'office', clusterId: local ? 'local' : 'remote', file, digest: list().rows.find(row => row.file === file).digest, ...extra });
    t.after(() => { manager.close(); monitor.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    const statuses = () => manager.statuses({ appId: 'office', clusterId: local ? 'local' : 'remote', files: list().rows.map(row => ({ file: row.file, digest: row.digest })) });
    return { manager, monitor, calls, prompts, opened, trashed, changed, entry, connections, workspace, appDir, app, cron, write, list, request, sourcePath, live, statuses };
}

test('catalog finds nested Kubernetes YAML/JSON and excludes credentials, DevSpace, dependencies, dotfiles and unrelated config', t => {
    const f = fixture(t);
    f.write('devspace.yaml', 'images: {}'); f.write('etc/kubeconfig-extra.yaml', { kind: 'Secret', apiVersion: 'v1', metadata: { name: 'hidden' } });
    f.write('etc/credentials.yaml', fs.readFileSync(f.sourcePath, 'utf8'));
    f.write('package.json', '{"name":"project"}'); f.write('compose.yaml', 'services: {}');
    f.write('.devspace/cached.yaml', f.cron); f.write('node_modules/test/resource.yaml', f.cron);
    f.write('etc/settings.json', JSON.stringify({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings' }, data: { value: 'private-value' } }));
    f.write('etc/invalid.yaml', 'kind: CronJob\nspec: [');
    const catalog = f.list();
    assert.deepEqual(catalog.rows.map(row => row.file), ['etc/cron-icc-prod.yaml', 'etc/invalid.yaml', 'etc/settings.json']);
    assert.match(catalog.rows[1].error, /Invalid YAML/);
    assert.ok(!JSON.stringify(catalog).includes('private-value') && !JSON.stringify(catalog).includes('app-token-secret'));
    assert.equal(catalog.clusters[0].namespace, 'app-prod'); assert.equal(catalog.clusters[0].transport, 'ssh');
    assert.equal(f.calls.length, 0);
});

test('Apply uses the SSH tunnel, app identity, selected context and namespace without rewriting local files', async t => {
    const f = fixture(t), source = fs.readFileSync(f.sourcePath, 'utf8'), manifest = fs.readFileSync(path.join(f.workspace, 'etc/cron-icc-prod.yaml'), 'utf8');
    const result = await f.manager.mutate(f.request(), 'apply');
    assert.equal(result.transport, 'ssh'); assert.equal(f.calls.length, 2);
    const apply = f.calls[1];
    assert.deepEqual(apply.args.slice(0, 5), ['apply', '-f', '-', '-o', 'name']);
    assert.equal(apply.config.users[0].user.token, 'app-token-secret'); assert.equal(apply.config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(apply.config.clusters[0].cluster['tls-server-name'], 'kubernetes.internal'); assert.equal(apply.mode, 0o600);
    assert.ok(f.calls.every(call => call.args[call.args.indexOf('--namespace') + 1] === 'app-prod' && call.args[call.args.indexOf('--context') + 1] === 'app-context'));
    assert.equal(apply.options.shell, false); assert.equal(apply.options.env.HTTPS_PROXY, undefined);
    assert.equal(fs.existsSync(apply.configPath), false); assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), source);
    assert.equal(fs.readFileSync(path.join(f.workspace, 'etc/cron-icc-prod.yaml'), 'utf8'), manifest);
    assert.equal(f.list().rows[0].history.remote.action, 'apply'); assert.equal(f.changed.length, 1);
    assert.equal(f.prompts[0].namespace, 'app-prod'); assert.equal(f.prompts[0].resources[0].kind, 'CronJob');
});

test('Remove deletes only manifest identities, keeps local files and never uses --all or namespace deletion', async t => {
    const f = fixture(t);
    f.write('secret.yaml', { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'db' }, stringData: { password: 'database-secret' } });
    await f.manager.mutate(f.request('secret.yaml'), 'remove');
    const call = f.calls[1], document = yaml.load(call.input);
    assert.equal(call.args[0], 'delete'); assert.ok(call.args.includes('--ignore-not-found=true')); assert.ok(call.args.includes('--wait=false'));
    assert.ok(!call.args.includes('--all')); assert.equal(document.metadata.name, 'db'); assert.equal(document.metadata.namespace, 'app-prod');
    assert.equal(document.stringData, undefined); assert.ok(!call.input.includes('database-secret'));
    assert.ok(fs.existsSync(path.join(f.workspace, 'secret.yaml'))); assert.equal(f.list().rows.find(row => row.file === 'secret.yaml').history.remote.action, 'remove');
});

test('Edit uses the default editor and Trash only removes the local file after confirmation', async t => {
    const f = fixture(t); f.entry.state = 'disconnected';
    await f.manager.edit(f.request()); assert.deepEqual(f.opened, [fs.realpathSync(path.join(f.workspace, 'etc/cron-icc-prod.yaml'))]);
    const result = await f.manager.mutate(f.request(), 'trash');
    assert.equal(result.trashed, true); assert.equal(f.calls.length, 0); assert.equal(f.trashed.length, 1); assert.equal(f.list().rows.length, 0);
});

test('canceling confirmation leaves local files and cluster unchanged', async t => {
    const f = fixture(t, { confirm: async () => false });
    for (const action of ['apply', 'remove', 'trash']) assert.equal((await f.manager.mutate(f.request(), action)).canceled, true);
    assert.equal(f.calls.length, 0); assert.equal(f.trashed.length, 0); assert.ok(fs.existsSync(path.join(f.workspace, 'etc/cron-icc-prod.yaml')));
});

test('cross-namespace resources, invalid YAML and cluster-wide resources cannot mutate the cluster', async t => {
    const f = fixture(t);
    f.write('other.yaml', { ...f.cron, metadata: { name: 'daily-job', namespace: 'other-team' } });
    await assert.rejects(f.manager.mutate(f.request('other.yaml'), 'apply'), /outside the app namespace/);
    f.write('bad.yaml', 'kind: ['); await assert.rejects(f.manager.mutate(f.request('bad.yaml'), 'apply'), /Invalid YAML/);
    assert.equal(f.calls.length, 0);
    f.write('namespace.yaml', { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'other-team', namespace: 'app-prod' } });
    await assert.rejects(f.manager.mutate(f.request('namespace.yaml'), 'remove'), /Cluster-wide/);
    assert.ok(f.calls.every(call => call.args[0] === 'get'));
});

test('disconnected SSH blocks before confirmation and commands, but local browsing and editing remain available', async t => {
    const f = fixture(t); const request = f.request(); f.entry.state = 'disconnected';
    await assert.rejects(f.manager.mutate(request, 'apply'), /Monitoring paused/);
    assert.match(f.list().clusters[0].error, /Monitoring paused/);
    await f.manager.edit(request); assert.equal(f.calls.length, 0); assert.equal(f.prompts.length, 0); assert.equal(f.opened.length, 1);
});

test('changed files are rejected before confirmation, and edits during confirmation require review again', async t => {
    const f = fixture(t); const request = f.request(); f.write(request.file, { ...f.cron, spec: { schedule: 'new' } });
    await assert.rejects(f.manager.mutate(request, 'apply'), /file changed/);
    assert.equal(f.prompts.length, 0);
    f.manager.confirm = async () => { fs.appendFileSync(path.join(f.workspace, request.file), '\n# edited in VS Code\n'); return true; };
    await assert.rejects(f.manager.mutate(f.request(), 'apply'), /file changed/); assert.equal(f.calls.length, 0);
});

test('path traversal, symlinks, credentials and arbitrary files cannot be opened, trashed or applied', async t => {
    const f = fixture(t);
    fs.symlinkSync(f.sourcePath, path.join(f.workspace, 'link.yaml')); fs.symlinkSync(path.dirname(f.sourcePath), path.join(f.workspace, 'linked-folder'));
    for (const file of ['../outside.yaml', '/tmp/file.yaml', 'etc/../../escape.yaml', 'link.yaml', 'linked-folder/kubeconfig-vDm1A3.yaml', 'kubeconfig-vDm1A3.yaml', '.kenzap', 'devspace.yaml', 'Dockerfile']) {
        await assert.rejects(f.manager.edit({ appId: 'office', file }));
    }
    assert.equal(f.opened.length, 0); assert.equal(f.calls.length, 0);
    assert.throws(() => f.manager.list({ appId: '../other' }), /Invalid app/);
});

test('connection changes cancel an in-flight action, discard late success and remove private kubeconfigs', async t => {
    const f = fixture(t, { execute: () => {} });
    const pending = f.manager.mutate(f.request(), 'apply');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.length, 1);
    f.manager.invalidate('remote'); f.calls[0].callback(null, JSON.stringify({ resources: [] }), '');
    await assert.rejects(pending, /interrupted/); assert.equal(f.calls[0].killed, true); assert.equal(fs.existsSync(f.calls[0].configPath), false);
    assert.equal(f.manager.pending.size, 0); assert.equal(f.changed.length, 0);
});

test('direct and Minikube actions preserve their selected routes without global kubeconfig changes', async t => {
    const direct = fixture(t, { ssh: false }); await direct.manager.mutate(direct.request(), 'apply');
    assert.ok(direct.calls.every(call => call.configPath === direct.sourcePath));
    const local = fixture(t, { local: true }); await local.manager.mutate(local.request(), 'apply');
    assert.ok(local.calls.every(call => call.args[call.args.indexOf('--context') + 1] === 'minikube' && !call.args.includes('--kubeconfig')));
});

test('resource Lists and namespaced custom resources are discovered safely and receive the app namespace', async t => {
    const f = fixture(t);
    f.write('list.yaml', { apiVersion: 'v1', kind: 'List', items: [{ apiVersion: 'example.test/v1', kind: 'Widget', metadata: { name: 'custom' } }, { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings' } }] });
    await f.manager.mutate(f.request('list.yaml'), 'apply');
    const apply = f.calls.find(call => call.args[0] === 'apply');
    assert.equal(yaml.loadAll(apply.input).length, 2); assert.ok(yaml.loadAll(apply.input).every(item => item.metadata.namespace === 'app-prod'));
    assert.equal(f.calls.filter(call => call.args.includes('--raw')).length, 2);
    assert.match(parseManifest('apiVersion: v1\nkind: List\nitems: [&x {kind: List, items: [*x]}]').error, /Invalid/);
});

test('per-app locking prevents overlaps and active Publish or sync blocks mutations', async t => {
    let finish;
    const f = fixture(t, { confirm: () => new Promise(resolve => { finish = resolve; }) });
    const pending = f.manager.mutate(f.request(), 'apply');
    await assert.rejects(f.manager.mutate(f.request(), 'trash'), /already running/);
    finish(false); await pending;
    f.manager.canMutate = () => false;
    await assert.rejects(f.manager.mutate(f.request(), 'apply'), /Stop live sync/);
    assert.equal(f.calls.length, 0);
});

test('command errors redact app credentials and Secret values; failure never records an applied status', async t => {
    const f = fixture(t, { execute: call => setImmediate(() => call.args.includes('--raw')
        ? call.callback(null, JSON.stringify({ resources: [{ name: 'secrets', kind: 'Secret', namespaced: true }] }), '')
        : call.callback(new Error('failed'), '', 'Denied app-token-secret private-db-value')) });
    f.write('secret.yaml', { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'db' }, stringData: { password: 'private-db-value' } });
    await assert.rejects(f.manager.mutate(f.request('secret.yaml'), 'apply'), error => /Denied/.test(error.message) && !/app-token-secret|private-db-value/.test(error.message));
    assert.deepEqual(f.list().rows.find(row => row.file === 'secret.yaml').history, {});
});

test('edits made while applying are reported without rewriting files or claiming the new version was applied', async t => {
    const f = fixture(t, { execute: call => setImmediate(() => {
        if (call.args.includes('--raw')) call.callback(null, JSON.stringify({ resources: [{ name: 'cronjobs', kind: 'CronJob', namespaced: true }] }), '');
        else { fs.appendFileSync(path.join(f.workspace, 'etc/cron-icc-prod.yaml'), '\n# newer version'); call.callback(null, 'cronjob configured', ''); }
    }) });
    const request = f.request(), result = await f.manager.mutate(request, 'apply');
    assert.match(result.warning, /file changed during/);
    const row = f.list().rows[0]; assert.notEqual(row.digest, row.history.remote.digest); assert.equal(row.history.remote.digest, request.digest);
});

test('the explicitly selected secondary cluster is used, not all assigned clusters', async t => {
    const f = fixture(t); f.app.clusters.push('second'); fs.writeFileSync(path.join(f.appDir, '.kenzap'), JSON.stringify(f.app));
    await assert.rejects(f.manager.mutate(f.request(undefined, { clusterId: 'second' }), 'apply'), /kubeconfig is missing/);
    assert.equal(f.calls.length, 0);
    f.write('kubeconfig-second.yaml', fs.readFileSync(f.sourcePath, 'utf8'));
    const result = await f.manager.mutate(f.request(undefined, { clusterId: 'second' }), 'apply');
    assert.equal(f.prompts[0].clusterId, 'second'); assert.equal(f.changed[0].clusterId, 'second'); assert.equal(result.action, 'apply');
    assert.equal(f.calls.filter(call => call.args[0] === 'apply').length, 1);
});

test('changing app settings or credentials during confirmation blocks an action against a stale target', async t => {
    const f = fixture(t);
    f.manager.confirm = async () => { fs.writeFileSync(path.join(f.appDir, '.kenzap'), JSON.stringify({ ...f.app, title: 'Updated' })); return true; };
    await assert.rejects(f.manager.mutate(f.request(), 'apply'), /app settings changed/);
    assert.equal(f.calls.length, 0);
    f.manager.confirm = async () => { fs.appendFileSync(f.sourcePath, '\n# refreshed credentials'); return true; };
    await assert.rejects(f.manager.mutate(f.request(), 'apply'), /credentials changed/);
    assert.equal(f.calls.length, 0);
});

test('read-only status recognizes an external Apply over SSH without requiring local action history', async t => {
    const f = fixture(t), live = structuredClone(f.cron);
    live.metadata.annotations = { 'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify(f.cron) }; f.live.push(live);
    const result = await f.statuses();
    assert.equal(result.rows[0].status, 'applied'); assert.equal(result.transport, 'ssh'); assert.equal(f.prompts.length, 0);
    assert.ok(f.calls.every(call => call.args[0] === 'get'));
    const get = f.calls.find(call => call.args.includes('-f'));
    assert.ok(get.args.includes('--ignore-not-found=true')); assert.equal(get.config.users[0].user.token, 'app-token-secret');
    assert.equal(get.config.clusters[0].cluster.server, 'https://127.0.0.1:45678'); assert.equal(get.mode, 0o600);
    assert.ok(!get.input.includes('schedule')); assert.equal(fs.existsSync(get.configPath), false);
    assert.deepEqual(f.list().rows[0].history, {}); assert.ok(!JSON.stringify(result).includes('containers'));
});

test('live absence overrides successful local Apply history instead of displaying stale green status', async t => {
    const f = fixture(t); await f.manager.mutate(f.request(), 'apply');
    assert.equal(f.list().rows[0].history.remote.action, 'apply');
    const result = await f.statuses(); assert.equal(result.rows[0].status, 'not-applied');
});

test('read failures and disconnections cannot be interpreted as Not applied or leak live Secrets', async t => {
    const f = fixture(t, { execute: call => setImmediate(() => call.callback(new Error('denied'), '', 'Forbidden live-private-secret app-token-secret')) });
    await assert.rejects(f.statuses(), error => /Unable to verify/.test(error.message) && !/live-private-secret|app-token-secret/.test(error.message));
    assert.equal(f.manager.statusJobs.size, 0); assert.equal(fs.existsSync(f.calls[0].configPath), false);
    f.entry.state = 'disconnected'; await assert.rejects(f.statuses(), /Monitoring paused/);
    assert.equal(f.calls.length, 1);
});

test('status respects namespaces and API scope and excludes raw Secret values from responses', async t => {
    const f = fixture(t);
    f.write('foreign.yaml', { ...f.cron, metadata: { name: 'other', namespace: 'other' } });
    f.write('namespace.yaml', { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'app-prod' } });
    const secret = { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'db', namespace: 'app-prod' }, stringData: { password: 'private-secret-value' } };
    f.write('secret.yaml', secret); f.live.push({ ...secret, metadata: { ...secret.metadata, annotations: { 'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify(secret) } } });
    const result = await f.statuses();
    assert.equal(result.rows.find(row => row.file === 'foreign.yaml').status, 'wrong-namespace');
    assert.equal(result.rows.find(row => row.file === 'namespace.yaml').status, 'unsupported');
    assert.equal(result.rows.find(row => row.file === 'secret.yaml').status, 'applied');
    assert.ok(!JSON.stringify(result).includes('private-secret-value'));
    const payloads = f.calls.filter(call => call.args.includes('-f')).map(call => call.input).join('');
    assert.ok(!payloads.includes('kind: Namespace') && !payloads.includes('namespace: other') && !payloads.includes('private-secret-value'));
});

test('mutations interrupt pending status reads and discard late responses without changing the cluster', async t => {
    const f = fixture(t, { execute: () => {}, confirm: async () => false });
    const read = f.statuses(); const rejected = assert.rejects(read, /Unable to verify/);
    await new Promise(resolve => setImmediate(resolve));
    await f.manager.mutate(f.request(), 'apply'); await rejected;
    assert.equal(f.calls[0].killed, true); assert.equal(f.calls.length, 1); assert.equal(f.manager.statusJobs.size, 0);
});

test('files edited while reading status are reported as Unknown, not Applied or Not applied', async t => {
    const f = fixture(t, { execute: call => setImmediate(() => {
        if (call.args.includes('--raw')) call.callback(null, JSON.stringify({ resources: [{ name: 'cronjobs', kind: 'CronJob', namespaced: true }] }), '');
        else { fs.appendFileSync(path.join(f.workspace, 'etc/cron-icc-prod.yaml'), '\n# new'); call.callback(null, JSON.stringify({ apiVersion: 'v1', kind: 'List', items: [] }), ''); }
    }) });
    const result = await f.statuses(); assert.equal(result.rows[0].status, 'unknown'); assert.match(result.rows[0].message, /file changed/);
});
