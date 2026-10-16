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
        ${read('src/assets/scss/app-config-files.css')}
        body { padding: 28px 0; }
    </style></head><body><main class="container"><div class="form-text mb-3">Home / Apps / Skarda Design Office</div><h4 class="mb-4">Skarda Design Office</h4><app-config-files></app-config-files></main></body></html>`).toString('base64')}`);
    await evaluate(`
        var global = { state: {} }, __html = text => text;
        var { stateCache, FRESH_MS } = (() => { const module = { exports: {} }; ${read('src/assets/js/state-cache.js')} return module.exports; })();
        var workspaceIdentity = 'office-workspace-v1', monitoringIdentity = () => workspaceIdentity, getDefaultAppPath = () => '/fixture';
        var html = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var attr = value => html(value).replace(/"/g, '&quot;');
        var requests = [], nextAction, finishAction, nextStatus, finishStatus, subscriptions = new Map();
        var statusOverrides = { 'app.yaml': 'applied', 'etc/cron-icc-prod.yaml': 'not-applied' };
        var catalog = { clusters: [{ id: 'production', name: 'Production', namespace: 'icc-prod', transport: 'ssh' }, { id: 'staging', name: 'Staging', namespace: 'icc-stage', transport: 'ssh' }], rows: [
            { file: 'app.yaml', digest: 'deployment-v1', resources: [{ kind: 'Deployment', metadata: { name: 'skarda-design-office' } }], history: { production: { action: 'apply', digest: 'deployment-v1', at: Date.now() - 3600000 } } },
            { file: 'etc/cron-icc-prod.yaml', digest: 'cron-v2', resources: [{ kind: 'CronJob', metadata: { name: 'daily-office-report', namespace: 'icc-prod' } }], history: { production: { action: 'apply', digest: 'cron-v1', at: Date.now() - 7200000 } } },
            { file: 'etc/invalid.yaml', digest: 'invalid', resources: [], history: {}, error: 'Invalid YAML at line 12. Review the indentation.' }
        ] };
        var ipcRenderer = { on: (channel, callback) => subscriptions.set(channel, callback), removeListener: channel => subscriptions.delete(channel), invoke: async (channel, request) => {
            requests.push({ channel, request });
            if (channel === 'app-config-files-list') return { ok: true, value: structuredClone(catalog) };
            if (channel === 'app-config-files-status') {
                if (nextStatus) { nextStatus = false; return new Promise(resolve => finishStatus = resolve); }
                return { ok: true, value: { clusterId: request.clusterId, namespace: catalog.clusters.find(cluster => cluster.id === request.clusterId).namespace, checkedAt: Date.now(), rows: request.files.map(file => ({ ...file, status: statusOverrides[file.file] || 'present', counts: { total: 1, missing: statusOverrides[file.file] === 'not-applied' ? 1 : 0 } })) } };
            }
            if (nextAction) { nextAction = false; return new Promise(resolve => finishAction = resolve); }
            return { ok: true, value: { opened: true } };
        } };
        ${read('src/assets/js/app-config-files.js').replace(/^import .*$/gm, '').replace(/export /g, '')}
        var panel = new ConfigFilesPanel({ id: 'office' }); panel.init();
        var row = file => Array.from(document.querySelectorAll('.config-file-row')).find(element => element.dataset.configFile === file);
        var button = (file, action) => row(file).querySelector('[data-config-action="' + action + '"]');
        var settle = () => new Promise(resolve => requestAnimationFrame(resolve));
    `);
    await evaluate(`settle()`);
    assert.equal(await evaluate(`document.querySelectorAll('.config-file-row').length`), 3);
    assert.match(await evaluate(`row('etc/cron-icc-prod.yaml').textContent`), /Changed since last action/);
    assert.equal(await evaluate(`button('etc/invalid.yaml', 'apply').disabled`), true);
    assert.equal(await evaluate(`button('etc/invalid.yaml', 'edit').disabled`), false);
    assert.equal(await evaluate(`row('app.yaml').querySelector('.config-file-status').dataset.status`), 'applied');
    assert.equal(await evaluate(`row('etc/cron-icc-prod.yaml').querySelector('.config-file-status').dataset.status`), 'not-applied', 'Missing live resources override local Apply history');
    assert.equal(await evaluate(`row('etc/invalid.yaml').querySelector('.config-file-status').dataset.status`), 'invalid');
    await evaluate(`var checksBefore = requests.filter(request => request.channel === 'app-config-files-status').length; panel = new ConfigFilesPanel({ id: 'office' }); panel.init();`);
    assert.equal(await evaluate(`row('app.yaml').querySelector('.config-file-status').dataset.status`), 'applied', 'Navigation restores cached rows synchronously');
    await evaluate(`settle()`);
    assert.equal(await evaluate(`requests.filter(request => request.channel === 'app-config-files-status').length`), await evaluate(`checksBefore`), 'Navigation skips recent configuration checks');
    await evaluate(`for (const entry of stateCache.entries.values()) entry.at -= 61000; nextStatus = true; panel = new ConfigFilesPanel({ id: 'office' }); panel.init(); settle();`);
    assert.equal(await evaluate(`row('app.yaml').querySelector('.config-file-status').dataset.status`), 'applied');
    assert.equal(await evaluate(`row('app.yaml').querySelector('.config-file-status').dataset.stale`), 'true', 'Expired status remains visible while checking');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), 'Expired status badges do not overflow');
    await evaluate(`finishStatus({ ok: true, value: { clusterId: 'production', namespace: 'icc-prod', checkedAt: Date.now(), rows: [{ file: 'app.yaml', digest: 'deployment-v1', status: 'applied' }, { file: 'etc/cron-icc-prod.yaml', digest: 'cron-v2', status: 'not-applied' }] } }); settle();`);
    assert.equal(await evaluate(`row('app.yaml').querySelector('.config-file-status').dataset.stale`), 'false');
    await evaluate(`var priorChecks = requests.filter(request => request.channel === 'app-config-files-status').length; catalog.rows[0].digest = 'deployment-v2'; panel.refresh(false); settle();`);
    assert.equal(await evaluate(`requests.filter(request => request.channel === 'app-config-files-status').length`), await evaluate(`priorChecks + 1`));
    assert.deepEqual(await evaluate(`requests.filter(request => request.channel === 'app-config-files-status').at(-1).request.files.map(file => file.file)`), ['app.yaml'], 'Editing one manifest only checks that manifest');
    await evaluate(`catalog.rows[0].digest = 'deployment-v1'; panel.refresh(false); settle();`);
    for (const [name, width] of [['desktop', 1100], ['narrow', 360], ['compact', 320]]) {
        window.setContentSize(width, 1100); await evaluate(`settle()`);
        assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), name + ': no overflow');
        fs.writeFileSync('/tmp/kenzap-config-files-' + name + '.png', (await window.webContents.capturePage()).toPNG());
        console.log('PASS ' + name);
    }
    await evaluate(`button('etc/cron-icc-prod.yaml', 'edit').click(); settle()`);
    assert.equal(await evaluate(`requests.find(request => request.channel === 'app-config-files-edit').request.file`), 'etc/cron-icc-prod.yaml');
    await evaluate(`nextAction = true; var applying = panel.action('etc/cron-icc-prod.yaml', 'apply');`);
    assert.equal(await evaluate(`document.querySelector('select').disabled`), true);
    assert.equal(await evaluate(`button('app.yaml', 'apply').disabled`), true);
    assert.equal(await evaluate(`requests.find(request => request.channel === 'app-config-files-apply').request.digest`), 'cron-v2');
    assert.equal(await evaluate(`requests.find(request => request.channel === 'app-config-files-apply').request.clusterId`), 'production');
    await evaluate(`statusOverrides['etc/cron-icc-prod.yaml'] = 'applied'; finishAction({ ok: true, value: { action: 'apply', output: 'cronjob.batch/daily-office-report configured\\n<img src=x onerror=unsafe()>' } }); applying;`);
    assert.match(await evaluate(`row('etc/cron-icc-prod.yaml').textContent`), /Configuration applied/);
    assert.equal(await evaluate(`!!row('etc/cron-icc-prod.yaml').querySelector('img')`), false);
    assert.equal(await evaluate(`row('etc/cron-icc-prod.yaml').querySelector('.config-file-status').dataset.status`), 'applied');
    await evaluate(`nextAction = true; var removing = panel.action('etc/cron-icc-prod.yaml', 'remove'); finishAction({ ok: true, value: { canceled: true } }); removing;`);
    assert.equal(await evaluate(`document.querySelectorAll('.config-file-row').length`), 3);
    await evaluate(`nextAction = true; removing = panel.action('etc/cron-icc-prod.yaml', 'remove'); statusOverrides['etc/cron-icc-prod.yaml'] = 'not-applied'; finishAction({ ok: true, value: { action: 'remove' } }); removing;`);
    assert.match(await evaluate(`row('etc/cron-icc-prod.yaml').textContent`), /local file was kept/);
    await evaluate(`catalog.rows[1].digest = 'cron-v3'; window.dispatchEvent(new Event('focus')); settle();`);
    assert.match(await evaluate(`row('etc/cron-icc-prod.yaml').textContent`), /file changed since this action/);
    await evaluate(`var select = document.querySelector('select'); select.value = 'staging'; select.dispatchEvent(new Event('change'));`);
    assert.equal(await evaluate(`button('etc/cron-icc-prod.yaml', 'apply').disabled`), true);
    assert.match(await evaluate(`row('etc/cron-icc-prod.yaml').textContent`), /another namespace/);
    assert.equal(await evaluate(`panel.results.size`), 0);
    await evaluate(`catalog.clusters[0].error = 'SSH disconnected <img src=x>'; delete catalog.clusters[0].transport; panel.clusterId = 'production'; panel.refresh(); settle();`);
    assert.equal(await evaluate(`button('app.yaml', 'apply').disabled`), true);
    assert.equal(await evaluate(`button('app.yaml', 'edit').disabled`), false);
    assert.equal(await evaluate(`!!document.querySelector('.config-files-scope img')`), false);
    assert.equal(await evaluate(`row('app.yaml').querySelector('.config-file-status').dataset.status`), 'unknown');
    await evaluate(`(async () => { delete catalog.clusters[0].error; catalog.clusters[0].transport = 'ssh'; statusOverrides['app.yaml'] = 'applied'; await panel.refresh(); catalog.clusters[0].error = 'SSH disconnected'; subscriptions.get('cluster-connection-status')({}, { id: 'production', state: 'disconnected' }); await settle(); })()`);
    assert.equal(await evaluate(`row('app.yaml').querySelector('.config-file-status').dataset.status`), 'unknown', 'SSH disconnect immediately invalidates previously verified status');
    await evaluate(`(async () => { delete catalog.clusters[0].error; catalog.clusters[0].transport = 'ssh'; await panel.refresh(); statusOverrides['app.yaml'] = 'changed'; await panel.checkStatuses(); })()`);
    assert.match(await evaluate(`row('app.yaml').querySelector('.config-file-status').textContent`), /Changes detected/);
    await evaluate(`(async () => { statusOverrides['app.yaml'] = 'partial'; await panel.checkStatuses(); })()`);
    assert.match(await evaluate(`row('app.yaml').querySelector('.config-file-status').textContent`), /Partially applied/);
    await evaluate(`(async () => { nextStatus = true; var oldCheck = panel.checkStatuses(); panel.clusterId = 'staging'; statusOverrides['app.yaml'] = 'present'; await panel.checkStatuses(); finishStatus({ ok: true, value: { clusterId: 'production', namespace: 'icc-prod', checkedAt: Date.now(), rows: [{ file: 'app.yaml', digest: 'deployment-v1', status: 'applied' }] } }); await oldCheck; })()`);
    assert.equal(await evaluate(`row('app.yaml').querySelector('.config-file-status').dataset.status`), 'present', 'Late status from another cluster must not replace the current target');
    await evaluate(`(async () => { panel.clusterId = 'production'; await panel.checkStatuses(); })()`);
    await evaluate(`nextAction = true; var trashing = panel.action('etc/invalid.yaml', 'trash'); catalog.rows.pop(); finishAction({ ok: true, value: { trashed: true } }); trashing;`);
    assert.equal(await evaluate(`document.querySelectorAll('.config-file-row').length`), 2);
    await evaluate(`nextAction = true; var opening = panel.action('app.yaml', 'edit'); finishAction({ ok: false, error: 'Editor unavailable <script>unsafe()</script>' }); opening;`);
    assert.match(await evaluate(`row('app.yaml').textContent`), /Editor unavailable/);
    assert.equal(await evaluate(`!!row('app.yaml').querySelector('script')`), false);
    await evaluate(`catalog.rows = []; panel.refresh(); settle();`);
    assert.match(await evaluate(`document.querySelector('.config-files-empty').textContent`), /No Kubernetes manifests/);
    await evaluate(`var before = requests.length; document.querySelector('app-config-files').remove(); settle(); window.dispatchEvent(new Event('focus')); settle();`);
    assert.equal(await evaluate(`requests.length === before`), true, 'Navigation removes focus listeners');
    assert.equal(await evaluate(`subscriptions.size`), 0, 'Navigation removes connection listeners');
    console.log('PASS live status badges, external changes, partial state, safe Unknown on disconnect, stale status guards, editor, Apply, deletion actions and disposal');
    window.destroy(); app.quit();
}

run().catch(error => { console.error(error); app.exit(1); });
