const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function run() {
    await app.whenReady();
    const window = new BrowserWindow({ show: false, width: 1100, height: 1100 });
    const evaluate = code => window.webContents.executeJavaScript(code);
    await window.loadURL(`data:text/html;base64,${Buffer.from(`<!doctype html><html><head><style>
        ${read('src/assets/libs/bootstrap.5.0.2.1.0.min.css')}
        ${read('src/assets/scss/app.css')}
        ${read('src/assets/scss/settings.css')}
        body { padding: 28px 0; } .fixture-heading { margin-bottom: 20px; }
    </style></head><body><main class="container"><div class="fixture-heading"><div class="form-text mb-3">Home / Apps / phpMyAdmin</div><h4>phpMyAdmin</h4></div><app-pods></app-pods></main></body></html>`).toString('base64')}`);
    await evaluate(`
        var global = { state: {} }, watchers = [], copied = [];
        var __html = value => value, toast = () => {};
        var html = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var attr = value => html(value).replace(/"/g, '&quot;');
        var clipboard = { writeText: text => copied.push(text) };
        var monitoringLabel = result => 'Monitoring via ' + (result.transport === 'ssh' ? 'SSH' : 'direct API');
        var pollClusterState = (element, clusterId, operation, onData, onError, options) => {
            var watcher = { element, clusterId, operation, onData, onError, options, stopped: false, refreshes: 0,
                stop() { this.stopped = true; }, refresh() { this.refreshes++; } };
            watchers.push(watcher); return watcher;
        };
        var module = { exports: {} };
        ${read('src/assets/js/pod-details.js')}
        ${read('src/assets/js/app-pods.js').replace(/^import .*$/gm, '').replace(/export /g, '')}
        var appData = { id: 'office', clusters: ['remote'] };
        var panel = new PodsPanel(appData); panel.init();
        var mainWatch = watchers[0];
        var pods = [
            { metadata: { name: 'phpmyadmin-7fbcbdd5c9-z4mjr', uid: 'crash-pod', creationTimestamp: new Date(Date.now() - 7200000).toISOString(), ownerReferences: [{ kind: 'ReplicaSet', name: 'phpmyadmin-7fbcbdd5c9', controller: true }] },
                spec: { nodeName: 'worker-2', containers: [{ name: 'web', image: 'registry.test/phpmyadmin:5.2', resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '256Mi' } } }, { name: 'logs', image: 'registry.test/logs:1' }], initContainers: [{ name: 'migrate', image: 'registry.test/migrate:1' }] },
                status: { phase: 'Running', podIP: '10.1.2.8', qosClass: 'Burstable', conditions: [{ type: 'Ready', status: 'False', message: 'Containers are not ready: web' }],
                    containerStatuses: [{ name: 'web', ready: false, restartCount: 3, state: { waiting: { reason: 'CrashLoopBackOff', message: 'Back-off restarting failed container' } }, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, finishedAt: new Date().toISOString() } } }, { name: 'logs', ready: true, restartCount: 0, state: { running: {} } }], initContainerStatuses: [{ name: 'migrate', restartCount: 0, state: { terminated: { reason: 'Completed', exitCode: 0 } } }] } },
            { metadata: { name: 'mysql-7fd69d47f9-vmqxs', uid: 'healthy-pod', creationTimestamp: new Date(Date.now() - 172800000).toISOString() }, spec: { nodeName: 'worker-1', containers: [{ name: 'mysql', image: 'mysql:8.4' }] },
                status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }], containerStatuses: [{ name: 'mysql', ready: true, restartCount: 0, state: { running: {} } }] } }
        ];
        var receive = () => mainWatch.onData({ transport: 'ssh', namespace: 'phpmyadmin', data: { items: pods }, observedAt: Date.now() });
        var latest = () => watchers[watchers.length - 1];
        receive();
    `);
    assert.equal(await evaluate(`watchers.length`), 1, 'Pods list does not eagerly fetch logs or events');
    assert.equal(await evaluate(`document.querySelectorAll('.pod-row').length`), 2);
    assert.match(await evaluate(`document.querySelector('.pod-row-summary').textContent`), /CrashLoopBackOff/);
    await evaluate(`document.querySelector('.pod-logs-button').click()`);
    assert.equal(await evaluate(`latest().operation`), 'logs');
    assert.equal(await evaluate(`latest().options.container`), 'web');
    assert.equal(await evaluate(`latest().options.timestamps`), true);
    assert.equal(await evaluate(`latest().options.podUid`), 'crash-pod');
    await evaluate(`var oldLogWatch = latest(); oldLogWatch.onData({ data: '<img src=x onerror=unsafe()>\\nrecent output', observedAt: Date.now() });`);
    assert.equal(await evaluate(`!!document.querySelector('.pod-log-output img')`), false);
    assert.match(await evaluate(`document.querySelector('.pod-log-output').textContent`), /<img/);
    await evaluate(`document.querySelector('[data-pod-action="copy"]').click()`);
    assert.match(await evaluate(`copied[0]`), /recent output/);
    await evaluate(`(() => { const select = document.querySelector('.pod-container-select'); select.value = 'logs'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    assert.equal(await evaluate(`oldLogWatch.stopped`), true);
    assert.equal(await evaluate(`latest().options.container`), 'logs');
    assert.equal(await evaluate(`document.querySelector('.pod-previous').disabled`), true);
    await evaluate(`latest().onData({ data: 'sidecar logs', observedAt: Date.now() }); oldLogWatch.onData({ data: 'stale wrong container', observedAt: Date.now() });`);
    assert.equal(await evaluate(`document.querySelector('.pod-log-output').textContent`), 'sidecar logs');
    await evaluate(`(() => { const select = document.querySelector('.pod-container-select'); select.value = 'web'; select.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.pod-previous').click(); })()`);
    assert.equal(await evaluate(`latest().options.previous`), true);
    await evaluate(`latest().onData({ data: 'previous container: memory limit exceeded', observedAt: Date.now() });`);
    assert.equal(await evaluate(`document.querySelector('.pod-copy-logs').disabled`), false);
    for (const [name, width, height] of [['desktop-logs', 1100, 1100], ['mobile-logs', 360, 1100]]) {
        window.setContentSize(width, height); await evaluate(`new Promise(resolve => requestAnimationFrame(resolve))`);
        assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), name + ': no overflow');
        fs.writeFileSync('/tmp/kenzap-pods-' + name + '.png', (await window.webContents.capturePage()).toPNG());
        console.log('PASS ' + name);
    }
    await evaluate(`document.querySelector('.pod-tabs [data-pod-action="overview"]').click()`);
    assert.equal(await evaluate(`latest().operation`), 'events');
    assert.equal(await evaluate(`latest().options.podUid`), 'crash-pod');
    await evaluate(`latest().onData({ data: { items: [
        { type: 'Warning', involvedObject: { uid: 'crash-pod' }, reason: 'BackOff', message: 'Restart back-off <script>unsafe()</script>', count: 3, lastTimestamp: new Date().toISOString() },
        { type: 'Warning', involvedObject: { uid: 'old-incarnation' }, reason: 'Wrong pod', message: 'must not show' }
    ] } });`);
    assert.equal(await evaluate(`document.querySelectorAll('.pod-event').length`), 1);
    assert.equal(await evaluate(`!!document.querySelector('.pod-events script')`), false);
    assert.match(await evaluate(`document.querySelector('.pod-overview-facts').textContent`), /OOMKilled/);
    assert.match(await evaluate(`document.querySelector('.pod-overview-facts').textContent`), /128Mi/);
    await evaluate(`document.querySelector('.pod-tabs [data-pod-action="logs"]').click(); document.querySelector('.pod-tabs [data-pod-action="overview"]').click();`);
    assert.match(await evaluate(`document.querySelector('.pod-overview-facts').textContent`), /worker-2/, 'Overview survives tab changes');
    for (const [name, width, height] of [['desktop-overview', 1100, 1400], ['compact-overview', 320, 1400]]) {
        window.setContentSize(width, height); await evaluate(`new Promise(resolve => requestAnimationFrame(resolve))`);
        assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), name + ': no overflow');
        fs.writeFileSync('/tmp/kenzap-pods-' + name + '.png', (await window.webContents.capturePage()).toPNG());
        console.log('PASS ' + name);
    }
    await evaluate(`document.querySelector('.pod-tabs [data-pod-action="logs"]').click(); latest().onData({ data: 'before disconnect', observedAt: Date.now() }); var disconnectedWatch = latest(); mainWatch.onError(new Error('Monitoring paused. Waiting for SSH.'));`);
    assert.equal(await evaluate(`document.querySelector('.pod-log-output').textContent`), '');
    assert.equal(await evaluate(`document.querySelector('.pod-copy-logs').disabled`), true);
    assert.equal(await evaluate(`document.querySelector('.pod-logs-button').disabled`), true);
    await evaluate(`disconnectedWatch.onData({ data: 'late secret output', observedAt: Date.now() }); receive();`);
    assert.equal(await evaluate(`document.querySelector('.pod-log-output').textContent`), '');
    assert.equal(await evaluate(`latest().stopped`), false, 'Verified reconnect reloads selected logs');
    await evaluate(`latest().onData({ data: 'after reconnect', observedAt: Date.now() }); pods[0] = { ...pods[0], metadata: { ...pods[0].metadata, uid: 'replacement-pod' } }; receive();`);
    assert.equal(await evaluate(`!!document.querySelector('.pod-inspector')`), false);
    assert.match(await evaluate(`document.querySelector('.pod-selection-note').textContent`), /removed or replaced/);
    await evaluate(`pods = []; receive()`);
    assert.match(await evaluate(`document.querySelector('.pod-empty').textContent`), /No pods/);
    await evaluate(`panel.stop(); document.querySelector('app-pods').innerHTML = ''; var unassigned = new PodsPanel({ id: 'another', clusters: [] }); unassigned.init();`);
    assert.match(await evaluate(`document.querySelector('.pod-count').textContent`), /Assign a cluster/);
    assert.equal(await evaluate(`mainWatch.stopped`), true);
    console.log('PASS logs, containers, previous instance, warnings, stale response guards, reconnect, replacement and disposal');
    window.destroy(); app.quit();
}

run().catch(error => { console.error(error); app.exit(1); });
