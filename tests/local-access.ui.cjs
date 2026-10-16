const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const moduleSource = file => read(file).replace(/^import .*$/gm, '').replace(/export /g, '');

async function run() {
    await app.whenReady();
    const window = new BrowserWindow({ show: false, width: 1100, height: 960 });
    const evaluate = code => window.webContents.executeJavaScript(code);
    await window.loadURL(`data:text/html;base64,${Buffer.from(`<!doctype html><html><head><style>
        ${read('src/assets/libs/bootstrap.5.0.2.1.0.min.css')}
        ${read('src/assets/scss/app.css')}
        ${read('src/assets/scss/settings.css')}
        body { padding: 40px 0; } .fixture-heading { margin-bottom: 30px; }
    </style></head><body><main class="container"><div class="fixture-heading"><div class="form-text mb-3">Home / Apps / phpMyAdmin</div><h4>phpMyAdmin</h4><div class="local-access-indicator form-text d-none" data-app-id="office"></div></div><app-local-access></app-local-access></main></body></html>`).toString('base64')}`);
    await evaluate(`
        var global = { state: {} }, requests = [], copied = [], revision = 0, snapshots = {}, subscriptions = {}, failing = false;
        var __html = text => text, toast = () => {};
        var html = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var attr = text => html(text).replace(/"/g, '&quot;');
        var clipboard = { writeText: text => copied.push(text) };
        var rows = [
            { targetId: 'a'.repeat(64), service: 'phpmyadmin', namespace: 'phpmyadmin', servicePort: 80, localPort: 8080, scheme: 'http', protocol: 'TCP', reason: '' },
            { targetId: 'b'.repeat(64), service: 'mysql', namespace: 'phpmyadmin', servicePort: 3306, localPort: 3307, scheme: '', protocol: 'TCP', reason: '' }
        ];
        var ipcRenderer = { on: (channel, callback) => subscriptions[channel] = callback,
            invoke: async (channel, request) => {
                requests.push({ channel, request });
                if (channel === 'local-access-describe') return { ok: true, value: { transport: 'ssh', rows: rows.map(row => ({ ...row })), sessions: Object.values(snapshots) } };
                if (channel === 'local-access-list') return { ok: true, value: Object.values(snapshots) };
                if (channel === 'local-access-configure') {
                    await new Promise(resolve => setTimeout(resolve, 15));
                    rows.find(row => row.targetId === request.targetId).localPort = request.localPort;
                    return { ok: true, value: { localPort: request.localPort } };
                }
                if (channel === 'local-access-suggest-port') return { ok: true, value: 42001 };
                if (channel === 'local-access-open') return { ok: true };
                if (channel === 'local-access-start' && failing) return { ok: false, error: 'Port unavailable <script>unsafe()</script>' };
                var row = rows.find(row => row.targetId === request.targetId), stopping = channel === 'local-access-stop';
                var previous = snapshots[request.targetId] || {};
                var snapshot = { ...previous, appId: 'office', targetId: request.targetId, jobId: 'job-' + request.targetId, service: row.service, namespace: row.namespace,
                    servicePort: row.servicePort, status: stopping ? 'stopped' : 'starting', running: !stopping, desired: !stopping,
                    localPort: stopping ? previous.localPort : request.localPort, revision: ++revision, url: '', error: '' };
                snapshot.address = '127.0.0.1:' + snapshot.localPort;
                snapshots[snapshot.targetId] = snapshot;
                return { ok: true, value: snapshot };
            }
        };
        ${moduleSource('src/assets/js/local-access-client.js')}
        ${moduleSource('src/assets/js/app-local-access.js')}
        var panel = new LocalAccessPanel({ id: 'office' }); panel.init();
        var tick = () => new Promise(resolve => setTimeout(resolve, 30));
        var emit = (id, state) => {
            var snapshot = { ...snapshots[id], ...state, revision: ++revision };
            snapshots[id] = snapshot; subscriptions['local-access-update']({}, snapshot);
        };
        tick();
    `);
    assert.equal(await evaluate(`document.querySelectorAll('[data-local-row]').length`), 2);
    await evaluate(`(() => {
        const input = document.querySelector('.local-access-port'); input.value = '9090';
        input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('.local-access-switch').click(); return tick();
    })()`);
    const start = await evaluate(`requests.find(request => request.channel === 'local-access-start')`);
    assert.equal(start.request.localPort, 9090, 'Editing then immediately switching on must not drop the start action');
    await evaluate(`emit('a'.repeat(64), { status: 'running', url: 'http://127.0.0.1:9090/' });`);
    assert.equal(await evaluate(`document.querySelector('.local-access-state').textContent`), 'Active');
    assert.equal(await evaluate(`document.querySelector('.local-access-port').disabled`), true);
    await evaluate(`document.querySelector('[data-local-action="open"]').click(); document.querySelector('[data-local-action="copy"]').click(); tick();`);
    assert.equal(await evaluate(`copied[0]`), 'http://127.0.0.1:9090/');
    assert.ok(await evaluate(`requests.some(request => request.channel === 'local-access-open' && request.request.jobId === 'job-' + 'a'.repeat(64))`));
    await evaluate(`document.querySelector('app-local-access').innerHTML = ''; panel = new LocalAccessPanel({ id: 'office' }); panel.init(); tick();`);
    assert.equal(await evaluate(`document.querySelector('.local-access-state').textContent`), 'Active', 'Navigation restores an active session');
    await evaluate(`document.querySelectorAll('.local-access-switch')[1].click(); tick();`);
    await evaluate(`emit('b'.repeat(64), { status: 'paused', running: false, error: 'Waiting for a verified SSH connection.' });`);
    assert.equal(await evaluate(`document.querySelectorAll('.local-access-switch')[1].checked`), true);
    assert.equal(await evaluate(`document.querySelectorAll('.local-access-state')[1].textContent`), 'Paused');
    for (const [name, width, height] of [['desktop', 1100, 960], ['mobile', 360, 950], ['compact', 320, 950]]) {
        window.setContentSize(width, height);
        await evaluate(`new Promise(resolve => setTimeout(resolve, 250))`);
        const layout = await evaluate(`({ width: innerWidth, scroll: document.documentElement.scrollWidth,
            switches: [...document.querySelectorAll('.local-access-switch')].map(element => { const box = element.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                return hit === element && box.right <= innerWidth; }) })`);
        assert.ok(layout.scroll <= layout.width, name + ': no horizontal overflow');
        assert.ok(layout.switches.every(Boolean), name + ': switches are visible and clickable');
        fs.writeFileSync('/tmp/kenzap-local-access-' + name + '.png', (await window.webContents.capturePage()).toPNG());
        console.log('PASS ' + name + ': layout, switches and status');
    }
    await evaluate(`document.querySelectorAll('.local-access-switch')[1].click(); tick();`);
    assert.equal(await evaluate(`snapshots['b'.repeat(64)].desired`), false, 'Paused Stop cancels resume');
    await evaluate(`document.querySelector('.local-access-switch').click(); tick();`);
    await evaluate(`failing = true; document.querySelector('.local-access-switch').click(); tick();`);
    assert.equal(await evaluate(`!!document.querySelector('.local-access-row-error script')`), false);
    assert.match(await evaluate(`document.querySelector('.local-access-row-error').textContent`), /<script>/);
    await evaluate(`document.querySelector('[data-local-action="free-port"]').click(); tick();`);
    assert.equal(await evaluate(`document.querySelector('.local-access-port').value`), '42001');
    assert.ok(await evaluate(`requests.every(request => request.channel.startsWith('local-access-'))`), 'No endpoint writes, publishing, or syncing');
    console.log('PASS saved ports, navigation, open/copy, paused Stop, escaped errors and free-port recovery');
    window.destroy(); app.quit();
}

run().catch(error => { console.error(error); app.exit(1); });
