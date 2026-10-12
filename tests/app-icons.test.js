const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(fetch, containers = [], icons = {}) {
    const requests = [];
    const images = [];
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const bundledIcons = name => icons[name];
    bundledIcons.keys = () => Object.keys(icons);
    const context = vm.createContext({
        require: { context: () => bundledIcons },
        attr: escape, __html: value => value,
        document: { querySelectorAll: () => containers },
        fetch: (...args) => { requests.push(args); return fetch(...args); },
        AbortController, setTimeout, clearTimeout,
        URL: { createObjectURL: () => 'blob:cached-icon' },
        Image: class {
            constructor() { images.push(this); }
            decode() { return Promise.resolve(); }
            cloneNode() { return { src: this.src, alt: this.alt }; }
        }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/app-list-helpers.js'), 'utf8')
        .replace(/^import .*$/gm, '').replace(/export function/g, 'function');
    vm.runInContext(`${source}\nthis.getAppIcon = getAppIcon; this.getFirstEndpoint = getFirstEndpoint;`, context);
    return { getAppIcon: context.getAppIcon, getFirstEndpoint: context.getFirstEndpoint, requests, images };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('offline app icons retain visible initials and cache failed requests across renders', async () => {
    const f = fixture(async () => { throw new Error('DNS unavailable'); });
    const app = { id: 'admin', title: 'Database Admin', dockerfiles: [{ content: 'FROM phpmyadmin:latest' }] };
    const markup = f.getAppIcon(app);
    f.getAppIcon(app);
    await flush();
    f.getAppIcon(app);
    await flush();
    assert.equal(f.requests.length, 1);
    assert.match(f.requests[0][0], /phpmyadmin\.svg/);
    assert.match(markup, /app-icon-fallback rounded/);
    assert.match(markup, />DA<\/span>/);
    assert.ok(!markup.includes('d-none'));
    assert.equal(f.images.length, 0);
});

test('successful icon fetch uses a blob without a second network image request or stale updates', async () => {
    const url = 'https://example.test/icon.svg';
    const updates = [];
    const container = (id, iconUrl) => ({
        dataset: { id },
        querySelector: () => ({ dataset: { iconUrl }, replaceChildren: image => updates.push({ id, image }) })
    });
    const f = fixture(async () => ({ ok: true, blob: async () => ({}) }), [
        container('admin', url), container('admin', 'https://example.test/new.svg'), container('other', url)
    ]);
    f.getAppIcon({ id: 'admin', title: 'Admin', icon: url });
    await flush();
    assert.equal(f.requests.length, 1);
    assert.deepEqual(updates, [{ id: 'admin', image: { src: 'blob:cached-icon', alt: 'Admin' } }]);
});

test('apps without icon metadata do not fetch and escape fallback labels', () => {
    const f = fixture(() => { throw new Error('Should not fetch'); });
    const markup = f.getAppIcon({ id: 'demo', title: '<Demo> "App"', dockerfiles: [{}] });
    assert.equal(f.requests.length, 0);
    assert.match(markup, /&lt;Demo> &quot;App&quot;/);
    assert.ok(!markup.includes('<Demo>'));
});

test('phpMyAdmin uses its bundled icon before attempting any download', async () => {
    const icons = Object.fromEntries(fs.readdirSync(path.join(__dirname, '../src/assets/img/apps'))
        .map(name => ['./' + name, '/bundled/' + name]));
    const f = fixture(() => { throw new Error('Should not fetch'); }, [], icons);
    const app = { id: 'admin', title: 'Database Admin', dockerfiles: [{ content: 'FROM phpmyadmin:latest' }] };
    assert.match(f.getAppIcon(app), /src="\/bundled\/phpmyadmin\.svg"/);
    f.getAppIcon(app);
    await flush();
    assert.equal(f.requests.length, 0);
});

test('legacy hosted icon URLs use bundled assets and support default module exports', () => {
    const f = fixture(() => { throw new Error('Should not fetch'); }, [], {
        './phpmyadmin.svg': { default: '/bundled/phpmyadmin.svg' }
    });
    const markup = f.getAppIcon({ id: 'admin', title: 'Admin "App"', icon: 'https://kenzap.cloud/static/apps/phpmyadmin.svg?lastmod=5' });
    assert.match(markup, /src="\/bundled\/phpmyadmin\.svg"/);
    assert.match(markup, /alt="Admin &quot;App&quot;"/);
    assert.equal(f.requests.length, 0);
});

test('custom icon URLs are not replaced by unrelated bundled files with the same name', async () => {
    const url = 'https://custom.test/phpmyadmin.svg';
    const f = fixture(async () => ({ ok: false }), [], { './phpmyadmin.svg': '/bundled/phpmyadmin.svg' });
    f.getAppIcon({ id: 'admin', icon: url });
    await flush();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0][0], url);
});

test('app list links skip disabled services even when their previous public-switch intent is retained', () => {
    const f = fixture(() => {});
    assert.equal(f.getFirstEndpoint({ endpoints: [
        { host: 'disabled.test', active_private: 0, active_public: 1 },
        { host: 'active.test', active_private: 1, active_public: 1 }
    ] }), 'active.test');
    assert.equal(f.getFirstEndpoint({ endpoints: [{ host: 'disabled.test', active_private: 0, active_public: 1 }] }), '');
});
