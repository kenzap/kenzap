const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { StateCache } = require('../src/assets/js/state-cache');
const source = file => fs.readFileSync(path.join(__dirname, '../src/assets/js', file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
    let now = 1000, identity = 'workspace-v1', response = { ok: true, value: { data: { items: [] }, transport: 'ssh', observedAt: now } };
    const calls = [], listeners = new Map(), timers = new Map();
    const cache = new StateCache({ now: () => now });
    let nextTimer = 0;
    const context = vm.createContext({
        stateCache: cache, FRESH_MS: 60000, getDefaultAppPath: () => '/workspace', monitoringIdentity: () => identity,
        Date: class extends Date { static now() { return now; } },
        document: { body: {} }, MutationObserver: class { observe() {} disconnect() {} },
        setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
        clearTimeout: id => timers.delete(id),
        ipcRenderer: { on: (channel, callback) => listeners.set(channel, callback), invoke: async (channel, request) => { calls.push(request); return typeof response === 'function' ? response() : response; } }
    });
    vm.runInContext(source('monitoring-poll.js').replace('module.exports = { createMonitoringPoll };', ''), context);
    vm.runInContext(source('cluster-monitor-client.js').replace(/^import .*$/gm, '').replace(/export /g, ''), context);
    const open = (operation = 'pods') => {
        const data = [], errors = [], element = { isConnected: true };
        const poll = context.pollClusterState(element, 'prod', operation, value => data.push(value), error => errors.push(error.message), { appId: 'office' });
        return { poll, data, errors, element };
    };
    return { cache, calls, timers, open, listeners, advance: ms => { now += ms; }, identity: value => { identity = value; }, response: value => { response = value; } };
}

test('returning to a page restores recent data synchronously without another cluster query', async () => {
    const f = fixture(), first = f.open();
    await settle(); first.poll.stop();
    f.advance(15000);
    const next = f.open();
    assert.equal(next.data.length, 1);
    assert.equal(next.data[0].cached, true);
    assert.equal(next.data[0].stale, false);
    await settle();
    assert.equal(f.calls.length, 1);
    assert.equal([...f.timers.values()][0].delay, 45000);
    await next.poll.refresh();
    assert.equal(f.calls.length, 2, 'Manual refresh bypasses the minute-long cache');
    assert.equal(f.calls[1].force, true);
    assert.equal(next.data[1].cached, undefined);
    assert.equal([...f.timers.values()][0].delay, 10000, 'Live monitoring keeps its normal cadence after refreshing');
    next.poll.stop();
});

test('expired data stays on screen while a new request is pending', async () => {
    const f = fixture(), first = f.open(); await settle(); first.poll.stop();
    f.advance(60000);
    let finish;
    f.response(() => new Promise(resolve => { finish = resolve; }));
    const next = f.open();
    assert.equal(next.data[0].stale, true);
    await settle(); assert.equal(f.calls.length, 2);
    finish({ ok: true, value: { data: { items: ['fresh'] }, observedAt: 61000 } });
    await settle();
    assert.equal(next.data[1].data.items[0], 'fresh');
    next.poll.stop();
});

test('SSH changes discard healthy snapshots, reject late results, and reconnect with a fresh read', async () => {
    const f = fixture(), first = f.open(); await settle(); first.poll.stop();
    f.response({ ok: false, code: 'SSH_UNAVAILABLE', error: 'Monitoring paused' });
    f.listeners.get('cluster-connection-status')({}, { id: 'prod', state: 'disconnected' });
    const offline = f.open();
    assert.equal(offline.data.length, 0);
    await settle(); assert.match(offline.errors[0], /paused/);
    f.response({ ok: true, value: { data: { items: ['verified'] } } });
    f.listeners.get('cluster-connection-status')({}, { id: 'prod', state: 'connected' });
    await settle(); assert.equal(offline.data[0].data.items[0], 'verified');
    offline.poll.stop();
});

test('target changes and deployment notifications do not reuse previous app state', async () => {
    const f = fixture(), first = f.open(); await settle(); first.poll.stop();
    f.identity('new-namespace-or-credentials');
    const next = f.open(); assert.equal(next.data.length, 0); await settle();
    assert.equal(f.calls.length, 2);
    f.listeners.get('app-state-invalidated')({}, { appId: 'office', clusterId: 'prod' });
    await settle(); assert.equal(f.calls.length, 3);
    next.poll.stop();
});

test('rapid navigation shares pending work and log bodies are not cached', async () => {
    const f = fixture(); let finish;
    f.response(() => new Promise(resolve => { finish = resolve; }));
    const first = f.open(); await settle(); first.poll.stop();
    const next = f.open(); await settle(); assert.equal(f.calls.length, 1);
    finish({ ok: true, value: { data: { items: ['ready'] } } });
    await settle(); assert.equal(first.data.length, 0); assert.equal(next.data.length, 1);
    next.poll.stop();
    f.response({ ok: true, value: { data: 'private log' } });
    const logs = f.open('logs'); await settle(); logs.poll.stop();
    const reopened = f.open('logs'); assert.equal(reopened.data.length, 0); await settle();
    assert.equal(f.calls.filter(call => call.operation === 'logs').length, 2);
    reopened.poll.stop();
});
