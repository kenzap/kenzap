const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

function fixture(t, save) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-app-save-'));
    const baseDir = path.join(directory, 'Kenzap');
    const appDir = path.join(baseDir, 'office');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(path.join(baseDir, '.kenzap'));
    const legacyConfig = path.join(appDir, 'kubeconfig-20261007.yaml');
    fs.writeFileSync(legacyConfig, 'app-credentials');
    fs.writeFileSync(path.join(baseDir, '.kenzap', 'kubeconfig-remote.yaml'), 'cluster-admin-credentials');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const app = { id: 'office', title: 'office', slug: 'office' };
    const saveButton = { disabled: false, isConnected: true, addEventListener: (_, callback) => { saveButton.click = callback; } };
    const pathInput = { value: appDir, addEventListener: () => {} };
    const toasts = [], cached = [], initialized = [];
    const global = { state: { app, page: 'app-settings' } };
    const context = vm.createContext({
        fs, path, global, require, console: { log: () => {} }, toggleDepIconState: () => {},
        slugify: value => value, getDefaultAppPath: () => baseDir, getAppDetails: () => ({}),
        cacheSettings: data => cached.push(data), log: () => {}, html: value => value, toast: value => toasts.push(value),
        document: { querySelector: selector => selector === '.app-save' ? saveButton : selector === '#appPath' ? pathInput : { value: 'office' } }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/renderer/app-settings.js'), 'utf8')
        .replace(/^import .*$/gm, '').replace('export class Settings', 'class Settings');
    vm.runInContext(`${source}\nthis.Settings = Settings;`, context);
    const settings = Object.create(context.Settings.prototype);
    Object.assign(settings, { app, endpoints: { get: () => [], save },
        appClusterPicker: { get: () => ['remote'] }, appResources: { get: () => ({}) },
        dockerFile: { get: () => [], save: () => {} }, appRegistry: { save: () => {} },
        destroy: () => {}, init: id => initialized.push(id) });
    settings.listeners();
    return { settings, saveButton, legacyConfig, appDir, toasts, cached, initialized, global };
}

test('app Save awaits endpoint deployment and preserves dated app credentials', async t => {
    let finish;
    const f = fixture(t, () => new Promise(resolve => { finish = resolve; }));
    const pending = f.saveButton.click({ preventDefault: () => {}, currentTarget: f.saveButton });
    assert.equal(f.saveButton.disabled, true);
    assert.deepEqual(f.initialized, []);
    assert.equal(fs.readFileSync(f.legacyConfig, 'utf8'), 'app-credentials');
    assert.equal(fs.existsSync(path.join(f.appDir, 'kubeconfig-remote.yaml')), false);
    finish();
    await pending;
    assert.deepEqual(f.initialized, ['office']);
    assert.equal(f.saveButton.disabled, false);
});

test('a failed endpoint deployment keeps the app settings open and shows the error', async t => {
    const f = fixture(t, async () => { throw new Error('Endpoints saved locally, but deployment failed: SSH paused'); });
    await f.saveButton.click({ preventDefault: () => {}, currentTarget: f.saveButton });
    assert.deepEqual(f.initialized, []);
    assert.equal(f.toasts.length, 1);
    assert.match(f.toasts[0], /deployment failed: SSH paused/);
    assert.equal(f.global.state.msg, undefined);
    assert.equal(f.saveButton.disabled, false);
});

test('saving before Publish waits for endpoints but leaves Secrets/PVC deployment to the SSH-aware job', async t => {
    let finish;
    const f = fixture(t, () => new Promise(resolve => { finish = resolve; }));
    fs.writeFileSync(path.join(f.appDir, 'secret-db.yaml'), 'kind: Secret\n');
    const pending = f.settings.save({ forPublish: true });
    assert.equal(f.saveButton.disabled, true);
    finish();
    assert.equal(await pending, true);
    assert.equal(f.saveButton.disabled, false);
    assert.deepEqual(f.initialized, []);
    assert.equal(f.global.state.msg, undefined);
});
