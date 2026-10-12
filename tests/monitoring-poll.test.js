const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMonitoringPoll } = require('../src/assets/js/monitoring-poll');

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function fixture(t, request) {
    const previous = { document: global.document, MutationObserver: global.MutationObserver };
    let observer, listener, unsubscribed = 0;
    global.document = { body: {} };
    global.MutationObserver = class {
        constructor(callback) { this.callback = callback; observer = this; }
        observe() {}
        disconnect() { this.disconnected = true; }
    };
    const element = { isConnected: true };
    const data = [], errors = [];
    const poll = createMonitoringPoll({ element, request, interval: 10000,
        onData: value => data.push(value), onError: error => errors.push(error.message),
        subscribe: callback => { listener = callback; return () => { unsubscribed += 1; }; } });
    t.after(() => { poll.stop(); global.document = previous.document; global.MutationObserver = previous.MutationObserver; });
    return { poll, element, data, errors, changed: status => listener(status),
        removed: () => observer.callback(), observer: () => observer, unsubscribed: () => unsubscribed };
}

test('refreshes do not overlap a slow monitoring request', async t => {
    const pending = deferred();
    let requests = 0;
    const f = fixture(t, () => { requests += 1; return pending.promise; });
    f.poll.refresh(); f.poll.refresh();
    assert.equal(requests, 1);
    pending.resolve({ data: 'fresh' });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(requests, 2);
    assert.equal(f.data[0].data, 'fresh');
});

test('connection changes discard old data and immediately refresh after reconnect', async t => {
    const pending = deferred();
    let requests = 0;
    const f = fixture(t, () => { requests += 1; return requests === 1 ? pending.promise : Promise.resolve('verified SSH'); });
    f.changed({ state: 'reconnecting' });
    f.changed({ state: 'connected' });
    pending.resolve('stale public result');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(f.data, ['verified SSH']);
    assert.ok(f.errors[0].includes('Monitoring paused'));
    assert.equal(requests, 2);
});

test('navigation removes listeners and drops late responses from the previous screen', async t => {
    const pending = deferred();
    const f = fixture(t, () => pending.promise);
    f.element.isConnected = false;
    f.removed();
    pending.resolve('late result');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.data, []);
    assert.equal(f.unsubscribed(), 1);
    assert.equal(f.observer().disconnected, true);
    f.poll.stop();
    assert.equal(f.unsubscribed(), 1);
});

test('a failed read shows an error and a later refresh can recover', async t => {
    let requests = 0;
    const f = fixture(t, async () => {
        requests += 1;
        if (requests === 1) throw new Error('Forbidden');
        return 'healthy';
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.errors, ['Forbidden']);
    await f.poll.refresh();
    assert.deepEqual(f.data, ['healthy']);
});
