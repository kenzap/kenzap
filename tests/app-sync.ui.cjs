const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

async function run() {
    await app.whenReady();
    const window = new BrowserWindow({ show: false, width: 1000, height: 700 });
    await window.loadURL(`data:text/html;base64,${Buffer.from(`<!doctype html><html><head><style>
        ${read('src/assets/libs/bootstrap.5.0.2.1.0.min.css')}
    </style></head><body>
        <div class="devToolsSyncCont" data-id="office"><button class="start-dev-app" data-id="office">Start sync</button><ul></ul></div>
        <button class="stop-dev-app d-none" data-id="office">Stop sync</button>
        <button class="app-publish" data-id="office">Publish</button><button class="app-stop-publish d-none" data-id="office">Cancel publish</button>
        <div><div class="dev-badge d-none" data-id="office"></div></div>
        <div class="app-list-publish" data-id="office"></div><pre class="console-output"></pre>
    </body></html>`).toString('base64')}`);
    const tools = read('src/assets/js/dev-tools.js');
    const toggle = tools.slice(tools.indexOf('export function toggleDepIconState'), tools.indexOf('export function normalizeStyle')).replace('export ', '');
    const sync = read('src/assets/js/dev-tools-sync.js').replace(/^import .*$/gm, '').replace(/export /g, '');
    await window.webContents.executeJavaScript(`
        var global = { state: { page: 'app-settings', app: { id: 'office' }, dev: { office: { edgeStatus: 'online' } }, pub: {} } };
        var __html = text => text;
        var html = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var attr = html, toast = () => {}, log = () => {};
        var getSetting = () => ({ path: '/mock-workspace' }), validPath = () => true;
        var fs = { readdirSync: () => ['devspace.yaml'] }, requests = [], revision = 1;
        var ipcRenderer = { on() {}, invoke: async (channel, request) => {
            requests.push({ channel, request });
            if (channel === 'app-sync-list') return { ok: true, value: [] };
            return { ok: true, value: { appId: 'office', jobId: 'sync-job', status: channel === 'app-sync-stop' ? 'stopped' : 'running',
                desired: channel !== 'app-sync-stop', running: channel !== 'app-sync-stop', revision: ++revision,
                log: 'safe <script>unsafe()</script>', error: '', file: 'devspace.yaml', transport: 'ssh' } };
        } };
        var onClick = (selector, callback) => document.querySelectorAll(selector).forEach(element => element.onclick = callback);
        ${toggle}
        ${sync}
        var controller = new DevToolsSync(); controller.init();
    `);
    const inspect = () => window.webContents.executeJavaScript(`({
        label: document.querySelector('.app-list-publish').textContent,
        startHidden: document.querySelector('.start-dev-app').classList.contains('d-none'),
        stopHidden: document.querySelector('.stop-dev-app').classList.contains('d-none'),
        log: document.querySelector('.console-output').textContent,
        script: !!document.querySelector('.console-output script'), health: global.state.dev.office.edgeStatus,
        requests
    })`);
    await window.webContents.executeJavaScript(`document.querySelector('.start-dev-app').click(); new Promise(resolve => setTimeout(resolve, 0));`);
    let state = await inspect();
    assert.match(state.label, /Syncing/); assert.equal(state.startHidden, true); assert.equal(state.stopHidden, false);
    assert.equal(state.script, false); assert.equal(state.health, 'online'); assert.match(state.log, /<script>/);
    await window.webContents.executeJavaScript(`updateSyncState({ appId: 'office', jobId: 'sync-job', status: 'paused', desired: true,
        running: false, revision: ++revision, log: 'Waiting for SSH', error: 'SSH unavailable' });`);
    state = await inspect();
    assert.match(state.label, /Sync paused/); assert.equal(state.startHidden, false); assert.equal(state.stopHidden, false);
    await window.webContents.executeJavaScript(`document.querySelector('.stop-dev-app').click(); new Promise(resolve => setTimeout(resolve, 0));`);
    state = await inspect();
    assert.equal(state.stopHidden, true);
    assert.equal(state.requests.find(request => request.channel === 'app-sync-stop').request.jobId, 'sync-job');
    console.log('PASS sync start, pause, Stop, escaped logs and preserved health in Electron');
    window.destroy(); app.quit();
}

run().catch(error => { console.error(error); app.exit(1); });
