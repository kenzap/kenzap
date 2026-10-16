const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getTemplatesPath, resolveTemplatesPath } = require('../src/assets/js/templates-path');

function fixture(t) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'kenzap-template-path-'));
    t.after(() => fs.rmSync(project, { recursive: true, force: true }));
    const resourcesPath = path.join(project, 'Electron.app', 'Contents', 'Resources');
    const resolve = (moduleDirectory, development = true) => resolveTemplatesPath({ development, moduleDirectory: path.join(project, moduleDirectory), resourcesPath });
    const templates = relative => {
        const directory = path.join(project, relative);
        fs.mkdirSync(path.join(directory, 'apps', 'nginx', '1'), { recursive: true });
        fs.mkdirSync(path.join(directory, 'app'), { recursive: true });
        for (const file of ['devspace.yaml', 'app.yaml', 'endpoints.yaml']) fs.writeFileSync(path.join(directory, 'app', file), 'fixture');
        return directory;
    };
    return { project, resourcesPath, resolve, templates };
}

test('compiled development main and renderer prefer the same source templates over stale dist copies', t => {
    const f = fixture(t);
    const source = f.templates('src/assets/templates');
    f.templates('dist/templates');
    assert.equal(f.resolve('dist/main'), source);
    assert.equal(f.resolve('dist/renderer'), source);
    assert.equal(f.resolve('src/assets/js'), source);
    assert.notEqual(f.resolve('dist/main'), path.join(f.project, 'dist/main/src/assets/templates'));
});

test('legacy development layouts with only dist/templates remain supported', t => {
    const f = fixture(t), legacy = f.templates('dist/templates');
    assert.equal(f.resolve('dist/main'), legacy);
    assert.equal(f.resolve('dist/renderer'), legacy);
});

test('packaged apps always use bundled resources, not nearby development templates', t => {
    const f = fixture(t);
    f.templates('src/assets/templates');
    f.templates('dist/templates');
    const bundled = f.templates('Electron.app/Contents/Resources/templates');
    assert.equal(f.resolve('dist/main', false), bundled);
    assert.equal(f.resolve('dist/renderer', false), bundled);
});

test('incomplete template copies are not selected when a complete fallback exists', t => {
    const f = fixture(t);
    fs.mkdirSync(path.join(f.project, 'src/assets/templates/apps'), { recursive: true });
    const complete = f.templates('dist/templates');
    assert.equal(f.resolve('dist/main'), complete);
});

test('missing template installation resolves deterministically without preventing application startup', t => {
    const f = fixture(t);
    assert.equal(f.resolve('dist/main'), path.join(f.project, 'src/assets/templates'));
    assert.equal(f.resolve('dist/main', false), path.join(f.resourcesPath, 'templates'));
});

test('source execution uses the real repository templates without an Electron dependency', () => {
    assert.equal(getTemplatesPath(), path.resolve(__dirname, '../src/assets/templates'));
});

test('webpack development builds also resolve their injected relative module directory', () => {
    const moduleDirectory = path.relative(process.cwd(), path.resolve(__dirname, '../src/assets/js'));
    assert.equal(resolveTemplatesPath({ development: true, moduleDirectory, resourcesPath: '/unused/resources' }), path.resolve(__dirname, '../src/assets/templates'));
});
