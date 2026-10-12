const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const snapshot = (overrides = {}) => ({ appId: 'office', jobId: 'job-1', status: 'running', running: true, desired: true,
    transport: 'ssh', namespace: 'office', file: 'devspace.yaml', revision: 10, log: 'Sync started\n', error: '', ...overrides });

function fixture(invoke, { settings = false, files = ['devspace.yaml'] } = {}) {
    const state = { dev: { office: { running: true, edgeStatus: 'healthy', pods: ['pod'] } }, pub: {},
        page: settings ? 'app-settings' : 'app-list', app: { id: 'office' } };
    const calls = [], messages = [], toggles = [], subscriptions = [], listeners = new Map();
    const output = { textContent: '', scrollHeight: 25 }, menu = { innerHTML: '', classList: { remove() {} } };
    const context = vm.createContext({ global: { state }, fs: { readdirSync: () => files },
        __html: value => value, html: escape, attr: escape, validPath: () => true, getSetting: () => ({ path: '/workspace' }),
        toggleDepIconState: id => toggles.push(id), toast: text => messages.push(text),
        onClick: (selector, callback) => listeners.set(selector, callback),
        document: { querySelector: selector => selector === '.console-output' ? output : menu },
        ipcRenderer: { on: (channel, listener) => subscriptions.push({ channel, listener }),
            invoke: async (...args) => { calls.push(args); if (invoke) return invoke(...args);
                return { ok: true, value: args[0] === 'app-sync-list' ? [] : snapshot() }; } }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/dev-tools-sync.js'), 'utf8')
        .replace(/^import .*$/gm, '').replace(/export /g, '');
    vm.runInContext(`${source}\nthis.DevToolsSync = DevToolsSync; this.updateSyncState = updateSyncState;`, context);
    return { sync: new context.DevToolsSync(), context, state, calls, messages, toggles, subscriptions, listeners, output, menu,
        click: () => listeners.get('.start-dev-app')({ preventDefault() {}, currentTarget: { dataset: { id: 'office' } } }) };
}

test('Sync starts a managed SSH session and subscribes once without overwriting pod health', async () => {
    const f = fixture(); f.sync.init(); f.sync.init(); f.click(); await new Promise(resolve => setImmediate(resolve));
    const start = f.calls.find(call => call[0] === 'app-sync-start');
    assert.equal(start[1].appId, 'office'); assert.equal(start[1].file, 'devspace.yaml');
    assert.equal(f.subscriptions.length, 1);
    assert.equal(f.state.dev.office.syncDesired, true); assert.equal(f.state.dev.office.syncPreparing, false);
    assert.equal(f.state.dev.office.running, true); assert.equal(f.state.dev.office.edgeStatus, 'healthy');
    assert.deepEqual(f.state.dev.office.pods, ['pod']);
});

test('startup errors remain failed; a rejected paused restart retains its Stop identity', async () => {
    const f = fixture(async () => ({ ok: false, error: 'SSH disconnected' }));
    await f.sync.syncStart('office', 'devspace.yaml');
    assert.equal(f.state.dev.office.syncStatus, 'failed'); assert.equal(f.state.dev.office.syncPreparing, false);
    assert.ok(f.messages.includes('SSH disconnected'));
    f.context.updateSyncState(snapshot({ status: 'paused', running: false }));
    await f.sync.syncStart('office', 'devspace.yaml');
    assert.equal(f.state.dev.office.syncDesired, true); assert.equal(f.state.dev.office.syncJobId, 'job-1');
});

test('Stop targets a paused session without needing workspace validation or renderer PID', async () => {
    const f = fixture(async () => ({ ok: true, value: snapshot({ status: 'stopped', running: false, desired: false, revision: 11 }) }));
    f.context.updateSyncState(snapshot({ status: 'paused', running: false }));
    f.context.getSetting = () => { throw new Error('Stop must not read workspace settings'); };
    await f.sync.syncStop('office');
    assert.equal(f.calls[0][0], 'app-sync-stop'); assert.equal(f.calls[0][1].jobId, 'job-1');
    assert.equal(f.state.dev.office.syncDesired, false); assert.equal(f.state.dev.office.status, 'stop');
});

test('sync and Publish exclude each other and repeated starts do not overlap', async () => {
    const f = fixture(); f.state.pub.office = { running: true };
    await f.sync.syncStart('office', 'devspace.yaml'); assert.equal(f.calls.length, 0);
    f.state.pub.office = {}; await f.sync.syncStart('office', 'devspace.yaml');
    await f.sync.syncStart('office', 'devspace.yaml'); assert.equal(f.calls.length, 1);
});

test('newer terminal events win over late startup replies and navigation hydration', async () => {
    let finish; const f = fixture(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.sync.syncStart('office', 'devspace.yaml');
    f.context.updateSyncState(snapshot({ revision: 12, status: 'failed', running: false, desired: false, error: 'RBAC denied' }));
    finish({ ok: true, value: snapshot() }); await pending;
    assert.equal(f.state.dev.office.syncStatus, 'failed'); assert.equal(f.state.dev.office.syncPreparing, false);
    f.context.updateSyncState(snapshot({ revision: 11 }), false);
    assert.equal(f.state.dev.office.syncStatus, 'failed');
});

test('console treats logs as text, ignores other apps and restores across navigation', async () => {
    const current = snapshot({ log: '<img src=x onerror=alert(1)>\n' });
    const f = fixture(async () => ({ ok: true, value: [current] }), { settings: true });
    f.context.updateSyncState(current, false);
    assert.equal(f.output.textContent, current.log); assert.equal(f.state.console, '&lt;img src=x onerror=alert(1)&gt;\n');
    f.context.updateSyncState(snapshot({ appId: 'another', revision: 11, log: 'Other sync' }));
    assert.equal(f.output.textContent, current.log);
    f.output.textContent = ''; f.sync.init(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.output.textContent, current.log); assert.deepEqual(f.messages, []);
    f.state.consoleOwner = { appId: 'office', type: 'publish' };
    f.context.updateSyncState(snapshot({ revision: 12, log: 'Old sync output' }));
    assert.equal(f.output.textContent, current.log);
});

test('configuration menus are app-scoped, sorted and escaped', async () => {
    const f = fixture(null, { files: ['devspace-z.yaml', 'devspace-"<b>.yaml'] });
    f.sync.listeners(); f.click();
    assert.ok(f.menu.innerHTML.includes('&quot;&lt;b&gt;')); assert.ok(!f.menu.innerHTML.includes('<b>'));
    const choose = f.listeners.get('.devToolsSyncCont[data-id="office"] .dev-tools-sync-start');
    choose({ preventDefault() {}, currentTarget: { dataset: { file: 'devspace-z.yaml' } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls[0][1].file, 'devspace-z.yaml'); assert.equal(f.calls[0][1].appId, 'office');
});

test('badges show paused and failed sync independently of older publishing state', () => {
    const nodes = new Map();
    const get = selector => {
        if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', title: '', hidden: false, parentElement: { innerHTML: '' },
            classList: { toggle(name, value) { get(selector).hidden = value; } } });
        return nodes.get(selector);
    };
    const context = vm.createContext({ global: { state: { pub: { office: { publishStatus: 'succeeded' } }, dev: { office: {} } } },
        document: { querySelector: get }, attr: escape, __html: value => value, log() {} });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/dev-tools.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('export function toggleDepIconState'), source.indexOf('export function normalizeStyle')).replace('export ', ''), context);
    for (const [status, label] of [['running', 'Syncing'], ['paused', 'Sync paused'], ['failed', 'Sync failed']]) {
        context.global.state.dev.office = { syncStatus: status, syncDesired: status !== 'failed', syncRunning: status === 'running', syncError: 'Details' };
        context.toggleDepIconState('office');
        assert.ok(get('.app-list-publish[data-id="office"]').innerHTML.includes(label));
        assert.equal(get('.app-list-publish[data-id="office"]').title, 'Details');
        assert.equal(get('.stop-dev-app[data-id="office"]').hidden, status === 'failed');
        assert.equal(get('.start-dev-app[data-id="office"]').hidden, status === 'running');
        assert.equal(get('.app-publish[data-id="office"]').hidden, false);
    }
});
