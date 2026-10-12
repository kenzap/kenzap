const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const snapshot = (overrides = {}) => ({ appId: 'office', jobId: 'job-1', status: 'running', running: true,
    transport: 'ssh', namespace: 'office', file: 'devspace.yaml', revision: 10, log: 'Build started\n', error: '', ...overrides });

function fixture(invoke, { settings = false, files = ['devspace.yaml'] } = {}) {
    const state = { pub: { office: {} }, page: settings ? 'app-settings' : 'app-list', app: { id: 'office' } };
    const calls = [], messages = [], toggles = [], subscriptions = [], listeners = new Map();
    const output = { textContent: '', scrollHeight: 25 }, menu = { innerHTML: '', classList: { remove() {} } };
    const context = vm.createContext({
        global: { state }, fs: { readdirSync: () => files },
        __html: value => value, html: escape, attr: escape, validPath: () => true, getSetting: () => ({ path: '/workspace' }),
        toggleDepIconState: id => toggles.push(id), toast: text => messages.push(text), confirm: () => true,
        onClick: (selector, callback) => listeners.set(selector, callback),
        document: { querySelector: selector => selector === '.settings' ? settings ? {} : null
            : selector === '.console-output' ? output : selector.startsWith('.edge-status') ? null : menu },
        ipcRenderer: { on: (channel, listener) => subscriptions.push({ channel, listener }),
            invoke: async (...args) => {
                calls.push(args);
                if (invoke) return invoke(...args);
                return { ok: true, value: args[0] === 'app-publish-list' ? [] : snapshot() };
            } }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/dev-tools-publish.js'), 'utf8')
        .replace(/^import .*$/gm, '').replace(/export /g, '');
    vm.runInContext(`${source}\nthis.DevToolsPublish = DevToolsPublish; this.updatePublishState = updatePublishState;`, context);
    return { publisher: new context.DevToolsPublish(), context, state, calls, messages, toggles, subscriptions, listeners, output, menu,
        click: () => listeners.get('.app-deploy')({ preventDefault() {}, currentTarget: { dataset: { id: 'office' } } }) };
}

test('Publish starts the SSH-aware managed job and repeated initialization subscribes only once', async () => {
    const f = fixture();
    f.publisher.init();
    f.publisher.init();
    await f.click();
    await new Promise(resolve => setImmediate(resolve));
    const start = f.calls.find(call => call[0] === 'app-publish-start');
    assert.equal(start[1].appId, 'office');
    assert.equal(start[1].file, 'devspace.yaml');
    assert.equal(f.subscriptions.length, 1);
    assert.equal(f.state.pub.office.running, true);
    assert.equal(f.state.pub.office.proc.managed, true);
    assert.equal(f.state.pub.office.proc.pid, undefined);
});

test('settings Publish waits for Save and does not deploy when Save fails', async () => {
    const f = fixture(null, { settings: true });
    f.publisher.init();
    let finish;
    f.publisher.beforePublish = () => new Promise(resolve => { finish = resolve; });
    const pending = f.click();
    assert.ok(!f.calls.some(call => call[0] === 'app-publish-start'));
    await f.click();
    finish(false);
    await pending;
    assert.ok(!f.calls.some(call => call[0] === 'app-publish-start'));
    assert.equal(f.state.pub.office.preparing, false);
    f.publisher.beforePublish = async () => true;
    await f.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.filter(call => call[0] === 'app-publish-start').length, 1);
});

test('SSH startup errors leave a failed badge state rather than a stuck spinner or Published status', async () => {
    const f = fixture(async () => ({ ok: false, error: 'SSH disconnected' }));
    await f.publisher.start('office', 'devspace.yaml');
    assert.equal(f.state.pub.office.publishStatus, 'failed');
    assert.equal(f.state.pub.office.preparing, false);
    assert.equal(f.state.pub.office.running, false);
    assert.equal(f.state.pub.office.proc, null);
    assert.ok(f.messages.includes('SSH disconnected'));
});

test('terminal events win over late start acknowledgements and restored snapshots', async () => {
    let finish;
    const f = fixture(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.publisher.start('office', 'devspace.yaml');
    f.context.updatePublishState(snapshot({ revision: 12, status: 'failed', running: false, error: 'Build failed' }));
    finish({ ok: true, value: snapshot({ revision: 10, status: 'queued' }) });
    await pending;
    assert.equal(f.state.pub.office.publishStatus, 'failed');
    assert.equal(f.state.pub.office.proc, null);
    assert.equal(f.state.pub.office.preparing, false);
    f.context.updatePublishState(snapshot({ revision: 11 }), false);
    assert.equal(f.state.pub.office.publishStatus, 'failed');
});

test('console renders logs as text, preserves safe cached markup, and ignores other apps', () => {
    const f = fixture(null, { settings: true });
    f.context.updatePublishState(snapshot({ log: '<img src=x onerror=alert(1)>\n' }));
    assert.equal(f.output.textContent, '<img src=x onerror=alert(1)>\n');
    assert.equal(f.state.console, '&lt;img src=x onerror=alert(1)&gt;\n');
    f.context.updatePublishState(snapshot({ appId: 'another', revision: 11, log: 'Other build' }));
    assert.equal(f.output.textContent, '<img src=x onerror=alert(1)>\n');
    assert.equal(f.state.pub.another.running, true);
});

test('cancellation targets the current job through IPC, without killing a renderer PID', async () => {
    const f = fixture(async () => ({ ok: true, value: snapshot({ revision: 11, status: 'canceling' }) }));
    f.context.updatePublishState(snapshot());
    await f.publisher.stop_publish_process('office');
    assert.equal(f.calls[0][0], 'app-publish-cancel');
    assert.equal(f.calls[0][1].jobId, 'job-1');
    assert.equal(f.state.pub.office.publishStatus, 'canceling');
});

test('Publish all is scoped to its app menu and sends one managed queue request', async () => {
    const f = fixture(null, { files: ['devspace-web.yaml', 'devspace-db.yaml'] });
    f.publisher.listeners();
    await f.click();
    const choose = f.listeners.get('.devToolsPublishCont[data-id="office"] .dev-tools-publish');
    assert.equal(typeof choose, 'function');
    choose({ preventDefault() {}, currentTarget: { dataset: { file: 'all' } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls[0][1].file, 'all');
    assert.equal(f.calls[0][1].appId, 'office');
});

test('navigation restores a current job log even when its revision is already known', async () => {
    const current = snapshot({ log: 'Existing output' });
    const f = fixture(async () => ({ ok: true, value: [current] }), { settings: true });
    f.context.updatePublishState(current, false);
    f.output.textContent = '';
    f.publisher.init();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.output.textContent, 'Existing output');
    assert.deepEqual(f.messages, []);
});

test('publishing badges distinguish running, failure, cancellation and completion without PID probing', () => {
    const nodes = new Map();
    const get = selector => {
        if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', title: '', parentElement: { innerHTML: '' }, classList: { toggle() {} } });
        return nodes.get(selector);
    };
    const context = vm.createContext({ global: { state: { pub: { office: { running: true, proc: { managed: true, jobId: 'job' } } } } },
        document: { querySelector: get }, attr: escape, __html: text => text, log() {},
        process: { kill() { throw new Error('Managed jobs must not be probed by renderer PID'); } } });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/dev-tools.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('export function toggleDepIconState'), source.indexOf('export function normalizeStyle')).replace('export ', ''), context);
    context.toggleDepIconState('office');
    const badge = get('.app-list-publish[data-id="office"]');
    assert.match(badge.innerHTML, /Publishing/);
    for (const [status, label] of [['failed', 'Publish failed'], ['canceled', 'Publish canceled'], ['succeeded', 'Published']]) {
        context.global.state.pub.office = { publishStatus: status, error: 'Details' };
        context.toggleDepIconState('office');
        assert.ok(badge.innerHTML.includes(label));
        assert.equal(badge.title, 'Details');
    }
});

test('Publish rejects active or paused sync before Save can modify endpoints', async () => {
    for (const sync of [{ syncDesired: true }, { syncRunning: true }, { syncPreparing: true }]) {
        const f = fixture(null, { settings: true }); f.publisher.init();
        f.state.dev = { office: sync };
        f.publisher.beforePublish = () => { throw new Error('Save must not run during sync'); };
        await f.click();
        assert.ok(!f.calls.some(call => call[0] === 'app-publish-start'));
        assert.ok(f.messages.includes('Stop live sync before publishing this app.'));
    }
});

test('old publishing logs cannot overwrite the current sync console', () => {
    const f = fixture(null, { settings: true });
    f.state.consoleOwner = { type: 'sync', appId: 'office' }; f.output.textContent = 'Live sync';
    f.context.updatePublishState(snapshot({ log: 'Old build' }), false);
    assert.equal(f.output.textContent, 'Live sync');
});
