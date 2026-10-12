const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');
const { ClusterMonitor } = require('../src/main/cluster-monitor');
const { PodConsole } = require('../src/main/pod-console');

function config(token, server = 'https://public.test:16443') {
    return { apiVersion: 'v1', kind: 'Config', 'current-context': 'app-context',
        clusters: [{ name: 'cluster', cluster: { server, 'tls-server-name': 'kubernetes.internal',
            'certificate-authority-data': Buffer.from('trusted-ca').toString('base64') } }],
        contexts: [{ name: 'app-context', context: { cluster: 'cluster', user: 'app-user', namespace: 'real-namespace' } }],
        users: [{ name: 'app-user', user: { token } }] };
}

function fixture(t, { ssh = true, local = false, execute } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-console-'));
    const baseDir = path.join(directory, 'Kenzap');
    const runtimeDir = path.join(directory, 'runtime');
    const appDir = path.join(baseDir, 'app-id');
    const workspace = path.join(directory, "workspace ' with spaces");
    for (const dir of [path.join(baseDir, '.kenzap'), runtimeDir, appDir, workspace]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(baseDir, '.kenzap', '.config'), JSON.stringify({ clusters: [{ id: 'remote' }] }));
    const app = { id: 'app-id', path: workspace, clusters: [local ? 'local' : 'remote'], namespace: 'local-namespace' };
    fs.writeFileSync(path.join(appDir, '.kenzap'), JSON.stringify(app));
    const sourcePath = path.join(workspace, 'kubeconfig-20261007.yaml');
    fs.writeFileSync(sourcePath, yaml.dump(config('app-token')));
    fs.writeFileSync(path.join(baseDir, '.kenzap', 'kubeconfig-remote.yaml'), yaml.dump(config('admin-token')));
    const file = 'devspace-test.yaml';
    fs.writeFileSync(path.join(workspace, file), 'version: v2beta1\n');
    const manifestPath = path.join(workspace, 'app-test.yaml');
    const manifest = { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'not-the-container' },
        spec: { template: { spec: { containers: [{ name: 'real-container', image: 'example' }] } } } };
    fs.writeFileSync(manifestPath, yaml.dump(manifest));
    const entry = { state: 'connected', stopped: false, content: yaml.dump(config('admin-token', 'https://127.0.0.1:45678')),
        listener: { address: () => ({ port: 45678 }) }, kubeconfigPath: path.join(runtimeDir, 'kubeconfig-remote.yaml') };
    const connections = { baseDir, runtimeDir, connections: new Map([['remote', entry]]), usesSSHForMonitoring: () => ssh };
    const monitor = new ClusterMonitor({ connections });
    const binary = path.join(directory, "devspace ' stub");
    fs.writeFileSync(binary, `#!${process.execPath}\nconsole.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), kubeconfig: process.env.KUBECONFIG, proxy: process.env.HTTPS_PROXY, flags: process.env.DEVSPACE_FLAGS }));\n`, { mode: 0o700 });
    const calls = [];
    const console = new PodConsole({ monitor, devspace: () => binary, platform: 'darwin', execute: (executable, args, options, callback) => {
        const scriptPath = args[2];
        const temporary = path.dirname(scriptPath);
        const kubeconfigPath = path.join(temporary, 'kubeconfig.yaml');
        const call = { executable, args, options, callback, scriptPath, temporary,
            script: fs.readFileSync(scriptPath, 'utf8'), kubeconfigPath };
        if (fs.existsSync(kubeconfigPath)) call.config = yaml.load(fs.readFileSync(kubeconfigPath, 'utf8'));
        calls.push(call);
        if (execute) execute(call); else setImmediate(() => callback(null, '', ''));
        return { kill() {} };
    } });
    t.after(() => { console.close(); monitor.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    return { console, calls, entry, workspace, file, sourcePath, appDir, app, manifestPath, manifest, binary,
        open: () => console.open({ appId: app.id, file }) };
}

test('Enter pod uses SSH with app credentials, verified TLS, explicit context and the resolved namespace', async t => {
    const f = fixture(t);
    const original = fs.readFileSync(f.sourcePath, 'utf8');
    assert.deepEqual(await f.open(), { transport: 'ssh', namespace: 'real-namespace' });
    const call = f.calls[0];
    assert.equal(call.executable, '/usr/bin/open');
    assert.deepEqual(call.args.slice(0, 2), ['-a', 'Terminal']);
    assert.equal(call.options.shell, false);
    assert.equal(call.config.clusters[0].cluster.server, 'https://127.0.0.1:45678');
    assert.equal(call.config.clusters[0].cluster['tls-server-name'], 'kubernetes.internal');
    assert.equal(call.config.clusters[0].cluster['insecure-skip-tls-verify'], undefined);
    assert.equal(call.config.users[0].user.token, 'app-token');
    assert.equal(fs.statSync(call.kubeconfigPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(call.scriptPath).mode & 0o777, 0o700);
    assert.equal(fs.statSync(call.temporary).mode & 0o777, 0o700);
    assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), original);
    const output = JSON.parse(execFileSync('/bin/bash', [call.scriptPath], {
        encoding: 'utf8', env: { ...process.env, HTTPS_PROXY: 'http://proxy.test', DEVSPACE_FLAGS: '--switch-context' }
    }));
    assert.deepEqual(output.args, ['enter', '--namespace', 'real-namespace', '--config', f.file,
        '--container', 'real-container', '--kubeconfig', call.kubeconfigPath, '--kube-context', 'app-context']);
    assert.equal(output.cwd, fs.realpathSync(f.workspace));
    assert.equal(output.kubeconfig, call.kubeconfigPath);
    assert.equal(output.proxy, undefined);
    assert.equal(output.flags, undefined);
    assert.equal(fs.existsSync(call.temporary), false);
});

test('disconnected SSH never launches a terminal or falls back to the public API', async t => {
    const f = fixture(t);
    f.entry.state = 'disconnected';
    await assert.rejects(f.open(), /Connect this cluster via SSH/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.console.sessions.size, 0);
});

test('direct and local terminals preserve their routes without changing global kube context', async t => {
    const direct = fixture(t, { ssh: false });
    assert.equal((await direct.open()).transport, 'direct');
    const output = JSON.parse(execFileSync('/bin/bash', [direct.calls[0].scriptPath], { encoding: 'utf8' }));
    assert.equal(output.args[output.args.indexOf('--kubeconfig') + 1], direct.sourcePath);
    assert.equal(output.args[output.args.indexOf('--kube-context') + 1], 'app-context');
    const local = fixture(t, { local: true });
    assert.equal((await local.open()).transport, 'local');
    const localOutput = JSON.parse(execFileSync('/bin/bash', [local.calls[0].scriptPath], { encoding: 'utf8' }));
    assert.equal(localOutput.args[localOutput.args.indexOf('--kube-context') + 1], 'minikube');
    assert.equal(localOutput.args[localOutput.args.indexOf('--namespace') + 1], 'local-namespace');
    assert.ok(!localOutput.args.includes('--kubeconfig'));
    assert.doesNotMatch(local.calls[0].script, /kubectl config use-context/);
});

test('parallel terminal launches have independent private files and connection changes clean them', async t => {
    const f = fixture(t);
    await Promise.all([f.open(), f.open()]);
    assert.notEqual(f.calls[0].temporary, f.calls[1].temporary);
    assert.ok(f.calls.every(call => fs.existsSync(call.kubeconfigPath)));
    f.console.invalidate('other');
    assert.equal(f.console.sessions.size, 2);
    f.console.invalidate('remote');
    assert.equal(f.console.sessions.size, 0);
    assert.ok(f.calls.every(call => !fs.existsSync(call.temporary)));
});

test('connection changes during launch return an error and remove credentials', async t => {
    const f = fixture(t, { execute: () => {} });
    const pending = f.open();
    f.console.invalidate('remote');
    f.calls[0].callback(null, '', '');
    await assert.rejects(pending, /connection changed/);
    assert.equal(fs.existsSync(f.calls[0].temporary), false);
});

test('terminal launch errors and app shutdown remove temporary files', async t => {
    const failed = fixture(t, { execute: call => setImmediate(() => call.callback(new Error('failed'), '', 'Terminal unavailable')) });
    await assert.rejects(failed.open(), /Terminal unavailable/);
    assert.equal(failed.console.sessions.size, 0);
    assert.equal(fs.existsSync(failed.calls[0].temporary), false);
    const f = fixture(t);
    await f.open();
    f.console.close();
    assert.equal(fs.existsSync(f.calls[0].temporary), false);
    await assert.rejects(f.open(), /shutting down/);
});

test('ambiguous or missing container manifests leave the DevSpace picker available', async t => {
    const f = fixture(t);
    f.manifest.spec.template.spec.containers.push({ name: 'sidecar', image: 'example' });
    fs.writeFileSync(f.manifestPath, yaml.dump(f.manifest));
    await f.open();
    assert.doesNotMatch(f.calls[0].script, /'--container'/);
    fs.unlinkSync(f.manifestPath);
    await f.open();
    assert.doesNotMatch(f.calls[1].script, /'--container'/);
});

test('invalid app IDs, configuration paths and unknown clusters are rejected before launching', async t => {
    const f = fixture(t);
    for (const request of [{ appId: '../app-id', file: f.file }, { appId: f.app.id, file: '../devspace-test.yaml' },
        { appId: f.app.id, file: 'app.yaml' }, { appId: f.app.id, file: '--devspace.yaml' }]) {
        await assert.rejects(f.console.open(request), /Invalid/);
    }
    f.app.clusters = ['unknown'];
    fs.writeFileSync(path.join(f.appDir, '.kenzap'), JSON.stringify(f.app));
    await assert.rejects(f.open(), /Unknown cluster/);
    assert.equal(f.calls.length, 0);
});
