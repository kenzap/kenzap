const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const { EndpointState } = require('../src/assets/js/endpoint-state');

function fixture(t, deploy = async () => ({ ok: true })) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-endpoint-ui-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const app = { id: 'office', slug: 'office', clusters: ['remote'], path: directory };
    const service = { apiVersion: 'v1', kind: 'Service', metadata: { name: 'web', namespace: 'office' }, spec: { ports: [{ port: 80 }] } };
    const ingress = { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: { name: 'custom', namespace: 'office', annotations: { custom: 'keep' } },
        spec: { ingressClassName: 'public', rules: [{ host: 'office.test', http: { paths: [{ path: '/custom', pathType: 'Exact',
            backend: { service: { name: 'web', port: { number: 80 } } } }] } }] } };
    fs.writeFileSync(path.join(directory, 'endpoints.yaml'), [ingress, service].map(resource => yaml.dump(resource)).join('---\n'));
    const list = { innerHTML: '' };
    const requests = [];
    const escape = value => String(value).replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const context = vm.createContext({
        fs, path, yaml, require, EndpointState,
        getSetting: () => app, __html: value => value, html: escape, attr: escape,
        http: value => value, https: value => value, parseError: error => { throw error; },
        document: { querySelector: () => list },
        ipcRenderer: { invoke: async (...args) => { requests.push(args); return deploy(...args); } }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/app-endpoints.js'), 'utf8')
        .replace(/^import .*$/gm, '').replace('export class Endpoints', 'class Endpoints');
    vm.runInContext(`${source}\nthis.Endpoints = Endpoints;`, context);
    const endpoints = new context.Endpoints(app);
    endpoints.createEndpoints = () => {};
    endpoints.render();
    return { endpoints, app, list, requests, store: new EndpointState(directory, app), context };
}

test('Save writes disabled route storage before requesting deployment and awaits completion', async t => {
    let finish;
    const f = fixture(t, () => new Promise(resolve => { finish = resolve; }));
    f.endpoints.services[0].active_public = 0;
    let completed = false;
    const pending = f.endpoints.save().then(() => { completed = true; });
    assert.equal(f.store.read().resources.length, 1);
    assert.equal(f.store.read().state.disabledEndpoints[0].host, 'office.test');
    assert.equal(f.requests[0][0], 'app-endpoints-deploy');
    assert.equal(f.requests[0][1].appId, 'office');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false);
    finish({ ok: true });
    await pending;
    const reopened = new f.context.Endpoints(f.app);
    reopened.render();
    assert.equal(reopened.services[0].active_public, 0);
    assert.equal(reopened.services[0].host, 'office.test');
    assert.match(f.list.innerHTML, /endpoint-edit/);
});

test('deployment failures are not treated as a successful Save and retain retry data', async t => {
    const f = fixture(t, async () => ({ ok: false, error: 'SSH disconnected' }));
    f.endpoints.services[0].active_private = 0;
    await assert.rejects(f.endpoints.save(), /saved locally, but deployment failed: SSH disconnected/);
    assert.equal(f.store.read().state.pendingDeletes.length, 2);
    assert.equal(f.endpoints.servicesOriginal[0].active_private, 1);
});

test('a disabled private endpoint retains public intent without showing an active public link', t => {
    const f = fixture(t);
    const markup = f.endpoints.struct(0, { ...f.endpoints.services[0], active_private: 0, active_public: 1 });
    assert.match(markup, /endpoint-status not-active/);
    assert.match(markup, /form-text my-0 d-flex align-items-center d-none/);
    assert.equal(f.endpoints.services[0].active_public, 1);
});

test('new app Save and Apply never create external DNS records, including after settings reload', async t => {
    const f = fixture(t);
    delete f.endpoints.createEndpoints;
    f.app.dnsManaged = false;
    f.context.getKenzapSettings = () => { throw new Error('New apps must not contact managed DNS'); };
    f.context.fetch = () => { throw new Error('No hosted DNS requests allowed'); };
    await f.endpoints.save();
    assert.equal(f.requests.length, 1);
    const reopened = new f.context.Endpoints({ id: f.app.id, clusters: ['remote'] });
    reopened.createEndpoints();
    assert.equal(f.store.read().resources.find(resource => resource.kind === 'Ingress').spec.ingressClassName, 'public');
});
