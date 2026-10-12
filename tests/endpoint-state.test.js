const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { EndpointState, resourceKey } = require('../src/assets/js/endpoint-state');

const clone = value => JSON.parse(JSON.stringify(value));
const route = (name, routePath = '/office', port = { name: 'http' }) => ({ path: routePath, pathType: 'Exact', backend: { service: { name, port } } });
const service = name => ({ apiVersion: 'v1', kind: 'Service', metadata: { name, namespace: 'office', annotations: { custom: 'keep' } },
    spec: { type: 'NodePort', selector: { app: 'custom-selector', tier: 'web' }, sessionAffinity: 'ClientIP',
        ports: [{ name: 'http', port: 80, targetPort: 8080, nodePort: 30100 }, { name: 'metrics', port: 9090, targetPort: 'metrics' }] } });
const ingress = () => ({ apiVersion: 'networking.k8s.io/v1', kind: 'Ingress',
    metadata: { name: 'custom-ingress', namespace: 'office', labels: { owner: 'team' }, annotations: { 'custom/controller': 'preserve' } },
    spec: { ingressClassName: 'public', rules: [
        { host: 'office.test', http: { paths: [route('web'), route('web', '/metrics', { number: 9090 })] } },
        { host: 'alias.test', http: { paths: [route('web', '/alias', { number: 80 })] } }
    ], tls: [{ hosts: ['office.test'], secretName: 'custom-cert' }, { hosts: ['alias.test'], secretName: 'alias-cert' }] } });

function fixture(t, resources = [ingress(), service('web')]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-endpoints-'));
    const app = { id: 'office-app', slug: 'display-slug', clusters: ['remote'] };
    const store = new EndpointState(directory, app);
    fs.writeFileSync(store.manifestPath, '# Custom endpoint config\n' + resources.map(resource => yaml.dump(resource)).join('---\n'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return { store, directory, app, resources: clone(resources) };
}

const sorted = resources => [...resources].sort((a, b) => resourceKey(a).localeCompare(resourceKey(b)));

test('an unchanged save preserves the original YAML and all configuration', t => {
    const f = fixture(t);
    const originalFile = fs.readFileSync(f.store.manifestPath, 'utf8');
    const endpoints = f.store.load();
    assert.equal(endpoints[0].namespace, 'office');
    f.store.save(endpoints, clone(endpoints));
    assert.equal(fs.readFileSync(f.store.manifestPath, 'utf8'), originalFile);
    assert.deepEqual(f.store.read().resources, f.resources);
});

test('disabling a public route survives reopening and restores paths, TLS and ingress settings', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const original = clone(endpoints);
    endpoints[0].active_public = 0;
    f.store.save(endpoints, original);
    const disabled = f.store.read();
    assert.deepEqual(disabled.resources, [service('web')]);
    assert.equal(disabled.state.pendingDeletes[0].kind, 'Ingress');
    assert.equal(disabled.state.disabledResources[0].spec.ingressClassName, 'public');
    const reopened = new EndpointState(f.directory, f.app);
    const restored = reopened.load();
    assert.equal(restored[0].host, 'office.test');
    assert.equal(restored[0].active_private, 1);
    assert.equal(restored[0].active_public, 0);
    const baseline = clone(restored);
    restored[0].active_public = 1;
    reopened.save(restored, baseline);
    assert.deepEqual(sorted(reopened.read().resources), sorted(f.resources));
    assert.deepEqual(reopened.read().state.pendingDeletes, []);
    assert.deepEqual(reopened.read().state.disabledResources, []);
});

test('disabling the service removes both resources but retains its previous public-switch intent', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const original = clone(endpoints);
    endpoints[0].active_private = 0;
    f.store.save(endpoints, original);
    assert.deepEqual(f.store.read().resources, []);
    assert.equal(f.store.read().state.pendingDeletes.length, 2);
    const restored = f.store.load();
    assert.equal(restored[0].active_private, 0);
    assert.equal(restored[0].active_public, 1);
    const baseline = clone(restored);
    restored[0].active_private = 1;
    f.store.save(restored, baseline);
    assert.deepEqual(sorted(f.store.read().resources), sorted(f.resources));
});

test('shared hosts retain other routes and disabling/re-enabling does not duplicate or flatten paths', t => {
    const shared = ingress();
    shared.spec.rules[0].http.paths.push(route('api', '/api', { number: 80 }));
    const f = fixture(t, [shared, service('web'), service('api')]);
    const endpoints = f.store.load();
    const original = clone(endpoints);
    endpoints.find(item => item.name === 'web').active_public = 0;
    f.store.save(endpoints, original);
    const active = f.store.read().resources.find(item => item.kind === 'Ingress');
    assert.deepEqual(active.spec.rules[0].http.paths, [route('api', '/api', { number: 80 })]);
    assert.deepEqual(active.spec.tls, [{ hosts: ['office.test'], secretName: 'custom-cert' }]);
    const restored = f.store.load();
    const baseline = clone(restored);
    restored.find(item => item.name === 'web').active_public = 1;
    f.store.save(restored, baseline);
    const result = f.store.read().resources.find(item => item.kind === 'Ingress');
    assert.equal(result.spec.rules.length, 2);
    assert.equal(result.spec.rules[0].http.paths.length, 3);
    assert.deepEqual(result.metadata, shared.metadata);
    assert.deepEqual(result.spec.tls, shared.spec.tls);
});

test('live YAML annotations and service settings take precedence over archived configuration', t => {
    const shared = ingress();
    shared.spec.rules[0].http.paths.push(route('api', '/api', { number: 80 }));
    const f = fixture(t, [shared, service('web'), service('api')]);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    endpoints.find(item => item.name === 'web').active_public = 0;
    f.store.save(endpoints, baseline);
    const live = f.store.read().resources;
    live.find(item => item.kind === 'Ingress').metadata.annotations['custom/controller'] = 'updated-externally';
    live.find(item => item.kind === 'Service' && item.metadata.name === 'web').spec.ports[0].targetPort = 8181;
    fs.writeFileSync(f.store.manifestPath, live.map(item => yaml.dump(item)).join('---\n'));
    const restored = f.store.load();
    const original = clone(restored);
    restored.find(item => item.name === 'web').active_public = 1;
    f.store.save(restored, original);
    const active = f.store.read().resources;
    assert.equal(active.find(item => item.kind === 'Ingress').metadata.annotations['custom/controller'], 'updated-externally');
    assert.equal(active.find(item => item.kind === 'Service' && item.metadata.name === 'web').spec.ports[0].targetPort, 8181);
});

test('a route restored directly in YAML supersedes the disabled record', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    endpoints[0].active_public = 0;
    f.store.save(endpoints, baseline);
    const edited = ingress();
    edited.spec.ingressClassName = 'updated-controller';
    fs.writeFileSync(f.store.manifestPath, [edited, service('web')].map(item => yaml.dump(item)).join('---\n'));
    const current = f.store.load();
    assert.equal(current[0].active_public, 1);
    f.store.save(current, clone(current));
    assert.equal(f.store.read().resources[0].spec.ingressClassName, 'updated-controller');
    assert.deepEqual(f.store.read().state.disabledEndpoints, []);
});

test('port and host edits preserve selectors, target ports, secondary ports and unrelated backends', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    endpoints[0].host = 'new-office.test';
    endpoints[0].port = 81;
    f.store.save(endpoints, baseline);
    const current = f.store.read().resources;
    const updatedService = current.find(item => item.kind === 'Service');
    assert.equal(updatedService.spec.ports[0].port, 81);
    assert.equal(updatedService.spec.ports[0].targetPort, 8080);
    assert.deepEqual(updatedService.spec.ports[1], service('web').spec.ports[1]);
    assert.deepEqual(updatedService.spec.selector, service('web').spec.selector);
    const updatedIngress = current.find(item => item.kind === 'Ingress');
    assert.equal(updatedIngress.spec.rules[0].host, 'new-office.test');
    assert.equal(updatedIngress.spec.rules[1].host, 'alias.test');
    assert.deepEqual(updatedIngress.spec.tls[1], { hosts: ['alias.test'], secretName: 'alias-cert' });
    assert.deepEqual(updatedIngress.spec.rules[0].http.paths[0].backend.service.port, { number: 81 });
    assert.deepEqual(updatedIngress.spec.rules[0].http.paths[1].backend.service.port, { number: 9090 });
    assert.equal(updatedIngress.spec.ingressClassName, 'public');
});

test('repeated saves retain pending deletions and removal intentionally forgets archived routes', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    endpoints[0].active_public = 0;
    f.store.save(endpoints, baseline);
    const current = f.store.load();
    f.store.save(current, clone(current));
    assert.equal(f.store.read().state.pendingDeletes.length, 1);
    f.store.save([], current);
    assert.deepEqual(f.store.read().state.disabledEndpoints, []);
    assert.deepEqual(f.store.read().state.disabledResources, []);
    assert.equal(f.store.read().state.pendingDeletes.length, 2);
    assert.deepEqual(f.store.load(), []);
});

test('unrelated resources and a second ingress remain unchanged when disabling one endpoint', t => {
    const other = ingress();
    other.metadata.name = 'other-ingress';
    other.spec.rules = [{ host: 'external.test', http: { paths: [route('external')] } }];
    const configMap = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'config', namespace: 'office' }, data: { key: 'keep' } };
    const f = fixture(t, [ingress(), service('web'), other, configMap]);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    endpoints[0].active_public = 0;
    f.store.save(endpoints, baseline);
    const current = f.store.read().resources;
    assert.deepEqual(current.find(item => item.metadata.name === 'other-ingress'), other);
    assert.deepEqual(current.find(item => item.kind === 'ConfigMap'), configMap);
});

test('invalid YAML or disabled-state data fails without overwriting the source or archive', t => {
    const f = fixture(t);
    fs.writeFileSync(f.store.manifestPath, 'invalid: [');
    assert.throws(() => f.store.save([]), /unexpected end/);
    assert.equal(fs.readFileSync(f.store.manifestPath, 'utf8'), 'invalid: [');
    fs.writeFileSync(f.store.manifestPath, yaml.dump(service('web')));
    fs.writeFileSync(f.store.statePath, '{"version":99}');
    assert.throws(() => f.store.save([]), /state is invalid/);
    assert.equal(fs.readFileSync(f.store.statePath, 'utf8'), '{"version":99}');
});

test('host and port edits made while disabled are restored instead of the old archived values', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    endpoints[0].active_private = 0;
    f.store.save(endpoints, baseline);
    const disabled = f.store.load();
    const original = clone(disabled);
    disabled[0].port = 81;
    disabled[0].host = 'changed-while-disabled.test';
    f.store.save(disabled, original);
    const restored = f.store.load();
    const beforeEnable = clone(restored);
    restored[0].active_private = 1;
    f.store.save(restored, beforeEnable);
    const resources = f.store.read().resources;
    assert.equal(resources.find(item => item.kind === 'Service').spec.ports[0].port, 81);
    const publicRoute = resources.find(item => item.kind === 'Ingress');
    assert.equal(publicRoute.spec.rules[0].host, 'changed-while-disabled.test');
    assert.deepEqual(publicRoute.spec.rules[0].http.paths[0].backend.service.port, { number: 81 });
    assert.equal(publicRoute.spec.ingressClassName, 'public');
});

test('an unchanged form does not re-create routes deleted externally while the app is open', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    fs.writeFileSync(f.store.manifestPath, yaml.dump(service('web')));
    f.store.save(endpoints, baseline);
    assert.deepEqual(f.store.read().resources, [service('web')]);
    assert.deepEqual(f.store.read().state.disabledResources, []);
});

test('unedited live host changes preserve separate alias rules instead of flattening them', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    const edited = clone(f.resources);
    edited[0].spec.rules[0].host = 'external-edit.test';
    fs.writeFileSync(f.store.manifestPath, edited.map(resource => yaml.dump(resource)).join('---\n'));
    f.store.save(endpoints, baseline);
    assert.deepEqual(f.store.read().resources, edited);
});

test('conflicting UI and YAML edits stop before overwriting either version', t => {
    const f = fixture(t);
    const endpoints = f.store.load();
    const baseline = clone(endpoints);
    const edited = clone(f.resources);
    edited[0].spec.rules[0].host = 'external-edit.test';
    fs.writeFileSync(f.store.manifestPath, edited.map(resource => yaml.dump(resource)).join('---\n'));
    endpoints[0].host = 'ui-edit.test';
    assert.throws(() => f.store.save(endpoints, baseline), /changed outside/);
    assert.deepEqual(f.store.read().resources, edited);
});
