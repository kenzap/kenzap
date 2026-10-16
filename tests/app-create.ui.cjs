const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const renderer = file => read('src/assets/js/' + file).replace(/^import .*$/gm, '').replace(/export /g, '');

async function run() {
    await app.whenReady();
    const window = new BrowserWindow({ show: false, width: 1100, height: 1000, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    window.webContents.on('console-message', (event, level, message) => { if (level >= 2) console.error(message); });
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => callback({ cancel: true }));
    const evaluate = code => window.webContents.executeJavaScript(code);
    const icons = Object.fromEntries(fs.readdirSync(path.join(root, 'src/assets/img/apps')).filter(name => name.endsWith('.svg')).map(name => [name, 'data:image/svg+xml;base64,' + Buffer.from(read('src/assets/img/apps/' + name)).toString('base64')]));
    await window.loadURL(`data:text/html;base64,${Buffer.from(`<!doctype html><html><head><style>
        ${read('src/assets/libs/bootstrap.5.0.2.1.0.min.css')}
        ${read('src/assets/scss/app.css')}
        ${read('src/assets/scss/app-picker.css')}
        ${read('src/assets/scss/app-cluster-picker.css')}
    </style></head><body class="bg-light"><div class="modal show" style="display:block"><div class="modal-dialog modal-wide"><div class="modal-content"><div class="modal-header border-0"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"></div><div class="modal-footer border-0"></div></div></div></div></body></html>`).toString('base64')}`);
    await evaluate(`
        var fs = require('fs'), path = require('path');
        var global = { state: { project: 'office-project' } }, settings = { id: 'test', registry: { mode: 'repository', domain: 'registry.test/team/previous-app', user: '', pass: '' }, clusters: [{ id: 'remote', name: 'Production', servers: [{ server: 'server.internal' }] }, { id: 'local', name: 'Minikube', servers: [{ server: 'localhost' }] }] };
        var __html = value => value, log = () => {}, toast = () => {}, clipboard = { writeText() {} };
        var html = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var attr = value => html(value).replace(/"/g, '&quot;');
        var getKenzapSettings = () => settings;
        var onClick = (selector, listener) => document.querySelectorAll(selector).forEach(element => element.onclick = listener);
        var onKeyUp = (selector, listener) => document.querySelectorAll(selector).forEach(element => element.onkeyup = listener);
        var simulateClick = element => { if (element.matches('[data-bs-dismiss]')) window.closedModal = true; else element.click(); };
        var openedSettings = [], Settings = class { constructor(id) { openedSettings.push(id); } };
        var slugify = text => text.split(' ').join('-');
        var bundledIcons = ${JSON.stringify(icons)};
        var getBundledIcon = url => bundledIcons[url.split('/').pop()] || '';
        var getTemplatesPath = () => require(${JSON.stringify(path.join(root, 'src/assets/js/templates-path'))}).resolveTemplatesPath({ development: true, moduleDirectory: ${JSON.stringify(path.join(root, 'dist/renderer'))}, resourcesPath: '/unused/electron/resources' });
        var editors = {}, ace = { edit(textarea) { var handlers = []; var editor = { setValue(value) { textarea.value = value; handlers.forEach(handler => handler()); }, getValue() { return textarea.value; }, getSession() { return { on(event, handler) { handlers.push(handler); } }; }, destroy() { editor.destroyed = true; } }; editors[textarea.id] = editor; return editor; } };
        var ipcRequests = [], ipcListeners = new Map(), finishCreate;
        var ipcRenderer = { on(channel, listener) { ipcListeners.set(channel, listener); }, removeListener(channel) { ipcListeners.delete(channel); }, invoke(channel, request) { ipcRequests.push({ channel, request }); return new Promise(resolve => finishCreate = resolve); } };
        ${renderer('app-picker-list.js')}
        ${read('src/assets/js/app-actions.js').replace('module.exports = { Actions };', '')}
        ${renderer('app-create-template.js')}
        ${renderer('app-create-title.js')}
        ${renderer('app-create-image.js')}
        ${renderer('app-cluster-picker.js')}
        ${renderer('app-create-cluster.js')}
        var picker = new AppCreateTemplate({ ui: 'dialog' });
    `);
    assert.equal(await evaluate(`document.querySelectorAll('.app-template-choice').length`), 13);
    assert.equal(await evaluate(`document.querySelector('.modal-dialog').classList.contains('modal-wide')`), false);
    assert.equal(await evaluate(`Array.from(document.images).every(image => image.src.startsWith('data:'))`), true, 'Template icons load locally, including offline');
    for (const [name, width] of [['desktop', 1100], ['narrow', 360]]) {
        window.setContentSize(width, 1000);
        await evaluate(`new Promise(resolve => requestAnimationFrame(resolve))`);
        assert.ok(await evaluate(`document.querySelector('.modal').scrollWidth <= innerWidth`), name + ': no horizontal overflow');
        assert.ok(await evaluate(`Array.from(document.querySelectorAll('.app-template-icon')).every(icon => icon.getBoundingClientRect().width === 72 && icon.getBoundingClientRect().height === 72)`));
        assert.ok(await evaluate(`Array.from(document.querySelectorAll('.app-template-choice')).every(tile => { const icon = tile.querySelector('.app-template-icon').getBoundingClientRect(), box = tile.getBoundingClientRect(); return Math.abs((icon.left + icon.width / 2) - (box.left + box.width / 2)) < 1; })`));
        fs.writeFileSync('/tmp/kenzap-create-' + name + '.png', (await window.webContents.capturePage()).toPNG());
    }
    await evaluate(`document.querySelector('#template-search').value = 'no-such-template'; document.querySelector('#template-search').dispatchEvent(new Event('keyup'));`);
    assert.match(await evaluate(`document.querySelector('app-picker-list').textContent`), /No matching/);
    await evaluate(`document.querySelector('#template-search').value = 'WordPress'; document.querySelector('#template-search').dispatchEvent(new Event('keyup')); document.querySelector('.app-template-choice').click();`);
    assert.equal(await evaluate(`document.querySelector('#app-title').value`), 'WordPress');
    await evaluate(`document.querySelector('#app-title').value = 'kube-system'; document.querySelector('.app-picker-next').click();`);
    assert.equal(await evaluate(`document.querySelector('#app-title').classList.contains('is-invalid')`), true);
    await evaluate(`document.querySelector('#app-title').value = 'New Office'; document.querySelector('.app-picker-next').click();`);
    assert.equal(await evaluate(`document.querySelectorAll('textarea').length`), 2);
    await evaluate(`var editId = document.querySelector('textarea').id; editors[editId].setValue(editors[editId].getValue() + '\\n# Edited <img src=x onerror=unsafe()>'); document.querySelector('.select-app-btn').click();`);
    assert.equal(await evaluate(`document.querySelector('#create-image-repository').value`), 'registry.test/team/new-office', 'Never reuse the previous app image repository');
    await evaluate(`document.querySelector('.app-picker-back').click();`);
    assert.match(await evaluate(`document.querySelector('textarea').value`), /Edited <img/);
    assert.equal(await evaluate(`!!document.querySelector('.docker-editor img')`), false);
    await evaluate(`document.querySelector('.select-app-btn').click(); document.querySelector('#create-image-repository').value = ''; document.querySelector('.btn-app-create').click();`);
    assert.match(await evaluate(`document.querySelector('.app-create-error').textContent`), /image repository/);
    assert.equal(await evaluate(`document.querySelector('.btn-app-create').disabled`), false);
    await evaluate(`document.querySelector('#create-image-repository').value = 'registry.test/team/new-office'; document.querySelector('#create-registry-user').value = 'user'; document.querySelector('.btn-app-create').click();`);
    assert.match(await evaluate(`document.querySelector('.app-create-error').textContent`), /both/);
    await evaluate(`document.querySelector('#create-registry-pass').value = 'password'; document.querySelector('#create-platform').value = 'linux/arm64'; var pendingCreate = document.querySelector('.btn-app-create').onclick();`);
    assert.equal(await evaluate(`ipcRequests.length`), 1);
    assert.equal(await evaluate(`ipcRequests[0].channel`), 'app-create');
    assert.equal(await evaluate(`ipcRequests[0].request.platform`), 'linux/arm64');
    assert.equal(await evaluate(`ipcRequests[0].request.variables.wordpress_db_host`), 'db');
    assert.match(await evaluate(`ipcRequests[0].request.dockerfiles[0].content`), /Edited <img/);
    assert.equal(await evaluate(`document.querySelector('#create-platform').disabled`), true);
    assert.equal(await evaluate(`(() => { const event = new Event('hide.bs.modal', { cancelable: true }); document.querySelector('.modal').dispatchEvent(event); return event.defaultPrevented; })()`), true);
    await evaluate(`ipcListeners.get('app-create-progress')({}, { appId: 'different', message: 'wrong app' });`);
    assert.equal(await evaluate(`document.querySelector('.app-create-progress').textContent`), '');
    await evaluate(`ipcListeners.get('app-create-progress')({}, { appId: 'new-office', message: 'Creating namespace...' });`);
    assert.equal(await evaluate(`document.querySelector('.app-create-progress').textContent`), 'Creating namespace...');
    window.setContentSize(1100, 1000);
    await evaluate(`new Promise(resolve => requestAnimationFrame(resolve))`);
    fs.writeFileSync('/tmp/kenzap-create-deployment.png', (await window.webContents.capturePage()).toPNG());
    await evaluate(`finishCreate({ ok: false, error: 'SSH disconnected <img src=x>' }); pendingCreate;`);
    assert.match(await evaluate(`document.querySelector('.app-create-error').textContent`), /SSH disconnected/);
    assert.equal(await evaluate(`!!document.querySelector('.app-create-error img')`), false);
    assert.equal(await evaluate(`ipcListeners.size`), 0);
    assert.equal(await evaluate(`document.querySelector('.btn-app-create').disabled`), false);
    await evaluate(`pendingCreate = document.querySelector('.btn-app-create').onclick(); finishCreate({ ok: true, value: { id: 'new-office' } }); pendingCreate;`);
    assert.deepEqual(await evaluate(`openedSettings`), ['new-office']);
    assert.equal(await evaluate(`closedModal`), true);
    assert.equal(await evaluate(`global.state.dev['new-office'].edgeStatus`), 'unknown');
    assert.equal(await evaluate(`appList.find(app => app.image === 'wordpress').title`), undefined, 'Catalog entries remain unchanged');
    await evaluate(`settings.clusters = []; new AppCreateCluster({ id: 'other', slug: 'other', namespace: 'other', title: 'Other', image: 'nginx', image_id: '1' }); document.querySelector('.btn-app-create').click();`);
    assert.match(await evaluate(`document.querySelector('.app-create-error').textContent`), /Select one cluster/);
    assert.match(await evaluate(`document.querySelector('app-cluster-picker').textContent`), /No clusters available/);
    console.log('PASS template icons, responsive grid, search, safe naming, Dockerfile edits, registry validation, progress, SSH failure recovery and completion');
    window.destroy(); app.quit();
}

run().catch(error => { console.error(error); app.exit(1); });
