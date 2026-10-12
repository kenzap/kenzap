const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(read = async () => ({ data: { items: [] } })) {
    const app = { id: 'app-id', slug: 'demo', title: 'Demo', tags: [] };
    const cache = { ...app, clusters: ['remote'], path: '/test/workspace', project: '' };
    const classes = new Set();
    const classList = {
        add: value => classes.add(value),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        toggle: (value, force) => force ? classes.add(value) : classes.delete(value)
    };
    const element = { isConnected: true, classList, title: '' };
    const warnings = { innerHTML: '' };
    const title = { title: '' };
    const monitoring = { textContent: '', title: '' };
    const polls = [], requests = [];
    const deploymentProcess = { description: 'running deployment' };
    const state = { page: 'app-settings', app, dev: { 'app-id': { status: 'stop', proc: deploymentProcess } } };
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const context = vm.createContext({
        global: { state },
        document: { querySelector: selector => selector.startsWith('.edge-status') ? element
            : selector === '.app-warnings' ? warnings : selector.startsWith('.app-title-cont') ? title
                : selector.startsWith('.app-monitoring-state') ? monitoring : null },
        __html: value => value, html: escape, attr: escape, getSetting: () => cache,
        getAppList: () => [app], cacheSettings: () => {},
        clearInterval, Map, Set, Promise,
        monitoringLabel: () => 'Monitoring via SSH',
        readClusterState: async (...args) => { requests.push(args); return read(...args); },
        pollClusterState: (...args) => {
            const poll = { args, stopped: false, stop() { this.stopped = true; } };
            polls.push(poll); return poll;
        }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/app-status.js'), 'utf8')
        .replace(/^import .*;\n/gm, '').replace('export class AppStatus', 'class AppStatus');
    vm.runInContext(`${source}\nthis.AppStatus = AppStatus;`, context);
    const status = new context.AppStatus();
    status.init();
    return { status, state, app, cache, element, classes, warnings, title, monitoring, polls, requests, deploymentProcess };
}

function deployment(overrides = {}) {
    return { kind: 'Deployment', metadata: { name: 'demo', generation: 2 },
        spec: { replicas: 1, selector: { matchLabels: { app: 'demo' } }, template: { spec: { containers: [{ image: 'demo:v1' }] } } },
        status: { readyReplicas: 1, observedGeneration: 2 }, ...overrides };
}

test('successful app monitoring updates health without overwriting deployment processes', () => {
    const f = fixture();
    f.polls[0].args[3]({ transport: 'ssh', data: { items: [deployment()] } });
    assert.equal(f.state.dev['app-id'].edgeStatus, 'online');
    assert.equal(f.state.dev['app-id'].edgeImage, 'v1');
    assert.ok(f.classes.has('online'));
    assert.match(f.element.title, /Monitoring via SSH/);
    assert.equal(f.state.dev['app-id'].proc, f.deploymentProcess);
    assert.equal(f.polls[0].args[1], 'remote');
    assert.equal(f.polls[0].args[2], 'deployments');
    assert.equal(f.polls[0].args[5].appId, 'app-id');
    assert.equal(f.monitoring.textContent, 'Monitoring via SSH');
});

test('a paused connection clears stale green state and explains the monitoring problem', () => {
    const f = fixture();
    f.polls[0].args[3]({ data: { items: [deployment()] } });
    f.polls[0].args[4](new Error('Monitoring paused. Connect via SSH.'));
    assert.equal(f.state.dev['app-id'].edgeStatus, 'unknown');
    assert.ok(f.classes.has('unknown'));
    assert.ok(!f.classes.has('online'));
    assert.match(f.warnings.innerHTML, /Monitoring paused/);
    assert.equal(f.monitoring.textContent, 'Monitoring paused');
    assert.match(f.monitoring.title, /Connect via SSH/);
});

test('deployments with absent conditions do not crash status rendering', () => {
    const f = fixture();
    f.status.getLogs = () => {};
    f.polls[0].args[3]({ data: { items: [deployment({ status: { unavailableReplicas: 1 } })] } });
    assert.equal(f.state.dev['app-id'].edgeStatus, 'offline');
    assert.match(f.warnings.innerHTML, /offline/);
});

test('diagnostics select the unhealthy app pod and safely render logs and related events', async () => {
    const f = fixture(async (_, operation, options) => {
        if (operation === 'pods') return { data: { items: [
            { metadata: { name: 'other-pod', creationTimestamp: '2026-10-10T00:02:00Z', labels: { app: 'other' } }, status: { conditions: [] } },
            { metadata: { name: 'demo-pod', creationTimestamp: '2026-10-10T00:01:00Z', labels: { app: 'demo' } }, status: { conditions: [] } }
        ] } };
        if (operation === 'logs') { assert.equal(options.pod, 'demo-pod'); return { data: '<script>not HTML</script>' }; }
        return { data: { items: [
            { metadata: { creationTimestamp: '2026-10-10T00:01:00Z' }, involvedObject: { name: 'demo-pod' }, message: 'Failed to pull image' },
            { metadata: { creationTimestamp: '2026-10-10T00:02:00Z' }, involvedObject: { name: 'other-pod' }, message: 'Unrelated event' }
        ] } };
    });
    f.state.dev['app-id'].edgeStatus = 'offline';
    await f.status.getLogs(f.app, f.cache, f.element, [deployment()]);
    assert.deepEqual(f.requests.map(request => request[1]), ['pods', 'logs', 'events']);
    assert.ok(f.requests.every(request => request[0] === 'remote' && request[2].appId === 'app-id'));
    assert.match(f.warnings.innerHTML, /&lt;script&gt;/);
    assert.match(f.warnings.innerHTML, /Failed to pull image/);
    assert.ok(!f.warnings.innerHTML.includes('Unrelated event'));
});

test('diagnostics stop updating a screen after navigation', async () => {
    let finish;
    const f = fixture(() => new Promise(resolve => { finish = resolve; }));
    f.state.dev['app-id'].edgeStatus = 'offline';
    const pending = f.status.getLogs(f.app, f.cache, f.element, [deployment()]);
    f.element.isConnected = false;
    finish({ data: { items: [] } });
    await pending;
    assert.equal(f.requests.length, 1);
    assert.equal(f.warnings.innerHTML, '');
});
