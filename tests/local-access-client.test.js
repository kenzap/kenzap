const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
    const state = {}, calls = [], listeners = [], indicators = new Map();
    for (const id of ['office', 'another']) indicators.set(id, { dataset: { appId: id }, textContent: '',
        classList: { toggle(name, value) { indicators.get(id).hidden = value; } } });
    const context = vm.createContext({ global: { state }, __html: value => value,
        document: { querySelectorAll: () => [...indicators.values()] },
        ipcRenderer: { on: (channel, listener) => listeners.push({ channel, listener }),
            invoke: async channel => { calls.push(channel); return { ok: true, value: [] }; } } });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/local-access-client.js'), 'utf8')
        .replace(/^import .*$/gm, '').replace(/export /g, '');
    vm.runInContext(`${source}\nthis.update = updateLocalAccess; this.init = initLocalAccess;`, context);
    return { context, state, calls, listeners, indicators };
}

test('local access hydration subscribes once and never requests automatic startup', async () => {
    const f = fixture(); await f.context.init(); await f.context.init();
    assert.equal(f.listeners.length, 2);
    assert.deepEqual(f.calls, ['local-access-list', 'local-access-list']);
});

test('status revisions isolate apps, preserve unrelated state, and do not confuse active with paused', () => {
    const f = fixture(); f.state.pub = { office: { running: true } };
    let renders = 0; f.state.localAccessView = { app: { id: 'office' }, render: () => renders++ };
    const snapshot = { appId: 'office', targetId: 'port-1', revision: 5, desired: true, running: true, status: 'running' };
    f.context.update(snapshot);
    assert.equal(f.indicators.get('office').textContent, 'Local access active'); assert.equal(renders, 1);
    f.context.update({ ...snapshot, revision: 4, status: 'failed' }); assert.equal(renders, 1);
    f.context.update({ ...snapshot, revision: 6, status: 'paused', running: false });
    assert.equal(f.indicators.get('office').textContent, 'Local access paused'); assert.equal(f.indicators.get('office').hidden, false);
    f.context.update({ ...snapshot, appId: 'another', targetId: 'port-2', revision: 7 }); assert.equal(renders, 2);
    f.context.update({ ...snapshot, revision: 8, desired: false, running: false, status: 'stopped' });
    assert.equal(f.indicators.get('office').hidden, true); assert.equal(f.state.pub.office.running, true);
});
