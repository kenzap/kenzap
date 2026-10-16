const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const { buildWorkspace, imageRepository } = require('../src/main/app-workspace');
const templatesDir = path.resolve(__dirname, '../src/assets/templates');

function workspace(t, image = 'nginx', image_id = '1', overrides = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-workspace-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const app = { id: 'new-office', slug: 'new-office', namespace: 'new-office', title: 'New Office', path: directory,
        clusters: ['remote'], image, image_id, platform: 'linux/amd64', registry: { domain: 'registry.test/team/office', user: 'user', pass: 'pass\n: $& special' }, ...overrides };
    buildWorkspace({ directory, app, templatesDir, settings: {}, variables: { wordpress_db_pass: 'fixed-db-password' } });
    return { app, directory, load: file => yaml.load(fs.readFileSync(path.join(directory, file), 'utf8')) };
}

test('all bundled configurations generate parseable, namespace-scoped deployment files without automatic public endpoints', t => {
    let count = 0;
    for (const image of fs.readdirSync(path.join(templatesDir, 'apps')).filter(name => fs.statSync(path.join(templatesDir, 'apps', name)).isDirectory())) {
        for (const version of fs.readdirSync(path.join(templatesDir, 'apps', image)).filter(name => /^\d+$/.test(name))) {
            const f = workspace(t, image, version, image === 'custom' ? { dockerfiles: [{ name: 'Dockerfile', content: 'FROM nginx:alpine\n' }] } : {});
            const configs = fs.readdirSync(f.directory).filter(name => /^devspace.*\.yaml$/.test(name));
            for (const file of configs) {
                const config = f.load(file);
                assert.match(config.pipelines.deploy.run, /create_deployments --all/);
                assert.match(config.pipelines.deploy.run, /ensure_pull_secrets --all/);
                for (const image of Object.values(config.images)) assert.deepEqual(image.buildKit.args.slice(-2), ['--platform', 'linux/amd64']);
                assert.equal(config.pullSecrets.pullsecret.password, 'pass\n: $& special');
                assert.equal(config.pullSecrets.pullsecret.registry, 'https://registry.test');
                assert.equal(fs.statSync(path.join(f.directory, file)).mode & 0o777, 0o600);
            }
            const resources = yaml.loadAll(fs.readFileSync(path.join(f.directory, 'endpoints.yaml'), 'utf8'));
            assert.ok(resources.every(resource => resource.kind === 'Service' && resource.metadata.namespace === f.app.namespace));
            count++;
        }
    }
    assert.ok(count >= 20);
});

test('multi-component repositories are distinct and agree with their workloads, selectors and edited Dockerfiles', t => {
    const f = workspace(t, 'wordpress', '1', { dockerfiles: [{ name: 'Dockerfile-db', content: 'FROM mysql:8.4\nENV EXAMPLE=edited\n' }] });
    const db = f.load('devspace-db.yaml'), web = f.load('devspace-wordpress.yaml');
    assert.notEqual(db.images.app.image, web.images.app.image);
    assert.equal(f.load('app-db.yaml').spec.template.spec.containers[0].image, db.images.app.image);
    assert.equal(f.load('app-wordpress.yaml').spec.template.spec.containers[0].image, web.images.app.image);
    assert.equal(web.dev.app.imageSelector, web.images.app.image);
    assert.match(fs.readFileSync(path.join(f.directory, 'Dockerfile-db'), 'utf8'), /EXAMPLE=edited/);
});

test('local apps require no hosted registry, preserve source files and use the selected architecture', t => {
    const f = workspace(t, 'nginx', '1', { clusters: ['local'], platform: 'linux/arm64', registry: { domain: '', user: '', pass: '' } });
    const config = f.load('devspace.yaml');
    assert.equal(config.images.app.image, 'kenzap-local/new-office'); assert.equal(config.pullSecrets, undefined);
    assert.equal(config.dev.app.arch, 'arm64'); assert.equal(f.load('app.yaml').spec.template.spec.containers[0].imagePullPolicy, 'IfNotPresent');
    assert.equal(fs.readFileSync(path.join(f.directory, 'nginx.conf'), 'utf8'), fs.readFileSync(path.join(templatesDir, 'apps/nginx/1/nginx.conf'), 'utf8'));
});

test('custom placeholders and image/path traversal inputs fail before provisioning', t => {
    assert.throws(() => workspace(t, 'custom'), /valid Dockerfile/);
    assert.throws(() => workspace(t, '../nginx'), /valid app template/);
    assert.throws(() => workspace(t, 'nginx', '1', { dockerfiles: [{ name: '../Dockerfile', content: 'FROM nginx' }] }), /Invalid Dockerfile/);
    for (const image of ['https://user:pass@registry.test/app', '../escape', 'registry.test/team/app:latest', 'registry.test/team/my app']) assert.throws(() => imageRepository(image, 'office', false));
});

test('Save preserves new repository names and updates all component configs, rather than appending /v2 or overwriting both images', t => {
    const f = workspace(t, 'wordpress');
    const cached = [];
    const context = vm.createContext({ fs, path, yaml, imageRepository, registryHost: require('../src/assets/js/image-repository').registryHost,
        getSetting: () => f.app, cacheSettings: data => cached.push(data) });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/app-registry-helpers.js'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '');
    vm.runInContext(source, context);
    const registry = { domain: 'registry.new/team/new-office', mode: 'repository', user: 'updated', pass: 'updated password' };
    context.updateRepositoryRegistry(f.app, registry);
    const db = f.load('devspace-db.yaml'), web = f.load('devspace-wordpress.yaml');
    assert.equal(db.images.app.image, 'registry.new/team/new-office-db'); assert.equal(web.images.app.image, 'registry.new/team/new-office-wordpress');
    assert.equal(db.pullSecrets.pullsecret.username, 'updated'); assert.equal(f.load('app-db.yaml').spec.template.spec.containers[0].image, db.images.app.image);
    assert.equal(cached.length, 1); assert.equal(context.getCurrentRegistry(f.app, {}).mode, 'repository');
});
