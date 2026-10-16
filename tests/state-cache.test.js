const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StateCache, FRESH_MS } = require('../src/assets/js/state-cache');

test('snapshots are immediately available, fresh for one minute, and bounded by LRU', () => {
    let now = 100;
    const cache = new StateCache({ now: () => now, limit: 2 });
    cache.set('a', 'healthy'); cache.set('b', 'pending');
    now += FRESH_MS - 1;
    assert.equal(cache.peek('a').fresh, true);
    now++;
    assert.equal(cache.peek('a').fresh, false);
    assert.equal(cache.peek('a').value, 'healthy');
    cache.set('c', 'running');
    assert.equal(cache.peek('b'), null);
});

test('fresh reads reuse results, force bypasses freshness, and concurrent reads share work', async () => {
    const cache = new StateCache();
    let calls = 0, finish;
    const load = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    const first = cache.read('app', load);
    const second = cache.read('app', load);
    await Promise.resolve();
    assert.equal(calls, 1);
    finish('healthy');
    assert.deepEqual(await Promise.all([first, second]), ['healthy', 'healthy']);
    assert.equal(await cache.read('app', load), 'healthy');
    const forced = cache.read('app', load, { force: true });
    await Promise.resolve();
    assert.equal(calls, 2);
    finish('changed');
    assert.equal(await forced, 'changed');
});

test('invalidation prevents late requests from repopulating or deleting newer work', async () => {
    const cache = new StateCache();
    let finishOld, finishNew;
    const old = cache.read('app', () => new Promise(resolve => { finishOld = resolve; }), { scope: { clusterId: 'prod' } });
    await Promise.resolve();
    cache.invalidate(scope => scope.clusterId === 'prod');
    const current = cache.read('app', () => new Promise(resolve => { finishNew = resolve; }), { scope: { clusterId: 'prod' } });
    await Promise.resolve();
    finishOld('obsolete'); await assert.rejects(old, { code: 'STATE_INVALIDATED' });
    assert.equal(cache.peek('app'), null);
    assert.equal(cache.pending.size, 1);
    finishNew('verified'); await current;
    assert.equal(cache.peek('app').value, 'verified');
});

test('failed checks do not cache success or prevent retry', async () => {
    const cache = new StateCache();
    await assert.rejects(cache.read('app', async () => { throw new Error('SSH unavailable'); }));
    assert.equal(cache.peek('app'), null);
    assert.equal(await cache.read('app', async () => 'reconnected'), 'reconnected');
});
