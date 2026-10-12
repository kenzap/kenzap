const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(project, file), 'utf8');

async function run() {
    await app.whenReady();
    const window = new BrowserWindow({ show: false, width: 1100, height: 900 });
    const source = read('src/renderer/cluster-list.js');
    const start = source.indexOf('<div class="dropdown applicationsActionsCont">');
    const end = source.indexOf('</ul>', start) + '</ul>'.length;
    const render = new Function('cluster', 'attr', '__html', `return \`${source.slice(start, end)}</div>\`;`);
    const markup = render({ id: 'test-cluster' }, value => String(value), value => value);
    const fixture = `<!doctype html><html><head><style>
        ${read('src/assets/libs/bootstrap.5.0.2.1.0.min.css')}
        ${read('src/assets/scss/app.css')}
        .test-header { height: 64px; }
        .test-content { margin-top: 100px; }
        .test-table { height: 60px; }
    </style></head><body>
        <navigation-header><nav class="fixed-top bg-white test-header">Header</nav></navigation-header>
        <div class="container cluster-list test-content">
            <div class="table-responsive test-table"><table class="table"><tbody><tr>
                <td class="text-end">${markup}</td>
            </tr></tbody></table></div>
        </div>
        <div class="modal-backdrop" style="display:none"></div>
    </body></html>`;
    await window.loadURL(`data:text/html;base64,${Buffer.from(fixture).toString('base64')}`);
    await window.webContents.executeJavaScript(read('node_modules/bootstrap/dist/js/bootstrap.bundle.js'));
    await window.webContents.executeJavaScript(`(() => {
        const module = { exports: {} };
        ${read('src/assets/js/cluster-action-menu.js')}
        module.exports.initClusterActionMenus(bootstrap.Dropdown);
    })()`);

    for (const scenario of [
        { name: 'first row', width: 1100, height: 900, top: 100, header: 64 },
        { name: 'near bottom', width: 1100, height: 700, top: 600, header: 64 },
        { name: 'narrow and short', width: 360, height: 340, top: 180, header: 96 },
        { name: 'tall header', width: 760, height: 500, top: 180, header: 128 }
    ]) {
        window.setContentSize(scenario.width, scenario.height);
        await window.webContents.executeJavaScript(`
            document.querySelector('.test-content').style.marginTop = '${scenario.top}px';
            document.querySelector('.test-header').style.height = '${scenario.header}px';
            document.querySelector('.cluster-actions-toggle').click();
        `);
        const geometry = await window.webContents.executeJavaScript(`new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const menu = document.querySelector('.cluster-actions-menu');
                const box = menu.getBoundingClientRect();
                const first = menu.querySelector('.cluster-ssh-connect');
                const link = first.getBoundingClientRect();
                const hit = document.elementFromPoint(link.left + 10, link.top + link.height / 2);
                resolve({ top: box.top, bottom: box.bottom, left: box.left, right: box.right,
                    viewport: { width: innerWidth, height: innerHeight },
                    clickable: hit === first || first.contains(hit),
                    scrollable: menu.scrollHeight > menu.clientHeight,
                    layer: Number(getComputedStyle(menu).zIndex),
                    headerLayer: Number(getComputedStyle(document.querySelector('.fixed-top')).zIndex),
                    backdropLayer: Number(getComputedStyle(document.querySelector('.modal-backdrop')).zIndex)
                });
            }));
        })`);
        assert.ok(geometry.top >= scenario.header + 7, `${scenario.name}: clear of header`);
        assert.ok(geometry.bottom <= geometry.viewport.height - 7, `${scenario.name}: bottom visible`);
        assert.ok(geometry.left >= 7 && geometry.right <= geometry.viewport.width - 7, `${scenario.name}: horizontal fit`);
        assert.ok(geometry.clickable, `${scenario.name}: SSH action is not clipped by the table`);
        assert.ok(geometry.layer > geometry.headerLayer && geometry.layer < geometry.backdropLayer);
        if (scenario.name === 'narrow and short') assert.ok(geometry.scrollable, 'Short menus scroll');
        await window.webContents.executeJavaScript(`(() => {
            const menu = document.querySelector('.cluster-actions-menu');
            menu.scrollTop = menu.scrollHeight;
        })()`);
        assert.ok(await window.webContents.executeJavaScript(`(() => {
            const last = document.querySelector('.cluster-actions-menu .app-delete');
            const box = last.getBoundingClientRect();
            return document.elementFromPoint(box.left + 10, box.top + box.height / 2) === last;
        })()`), `${scenario.name}: last action is reachable`);
        await window.webContents.executeJavaScript(`
            document.querySelector('.cluster-actions-toggle').dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );
        `);
        assert.equal(await window.webContents.executeJavaScript(`
            document.querySelector('.cluster-actions-toggle').getAttribute('aria-expanded')
        `), 'false', 'Escape closes menu');
        await window.webContents.executeJavaScript(`document.querySelector('.cluster-actions-menu').scrollTop = 0`);
        console.log(`PASS ${scenario.name}`);
    }
    window.destroy();
    app.quit();
}

run().catch(error => {
    console.error(error);
    app.exit(1);
});
