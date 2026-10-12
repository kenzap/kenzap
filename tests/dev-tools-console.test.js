const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(invoke) {
    const calls = [];
    const messages = [];
    const listeners = new Map();
    const menu = { innerHTML: '', classList: { remove() {} } };
    const app = { id: 'office' };
    const context = vm.createContext({
        global: { state: { apps: [app] } },
        fs: { readdirSync: () => ['devspace.yaml'] }, getSetting: () => ({ path: '/workspace' }),
        validPath: () => true, log() {}, __html: text => text, attr: text => text,
        onClick: (selector, callback) => listeners.set(selector, callback),
        document: { querySelector: () => menu }, toast: message => messages.push(message),
        ipcRenderer: { invoke: async (...args) => { calls.push(args); return invoke(...args); } }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/dev-tools-console.js'), 'utf8')
        .replace(/^import .*$/gm, '').replace('export class DevToolsConsole', 'class DevToolsConsole');
    vm.runInContext(`${source}\nthis.DevToolsConsole = DevToolsConsole;`, context);
    return { console: new context.DevToolsConsole(), context, app, calls, messages, listeners };
}

test('the terminal button opens the only DevSpace configuration through the main SSH-aware handler', async () => {
    const f = fixture(async () => ({ ok: true, value: { transport: 'ssh' } }));
    f.console.init();
    f.listeners.get('.start-terminal')({ preventDefault() {}, currentTarget: { dataset: { id: 'office' } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][0], 'app-pod-console-open');
    assert.equal(f.calls[0][1].appId, 'office');
    assert.equal(f.calls[0][1].file, 'devspace.yaml');
    assert.deepEqual(f.messages, []);
});

test('SSH and terminal launch errors are visible rather than unhandled promises', async () => {
    const failure = fixture(async () => ({ ok: false, error: 'Connect via SSH first' }));
    await failure.console.openConsole(failure.app, 'devspace.yaml');
    assert.deepEqual(failure.messages, ['Connect via SSH first']);
    const rejected = fixture(async () => { throw new Error('IPC unavailable'); });
    await rejected.console.openConsole(rejected.app, 'devspace.yaml');
    assert.deepEqual(rejected.messages, ['IPC unavailable']);
});

test('multiple configuration choices are scoped to their own app menu', async () => {
    const f = fixture(async () => ({ ok: true }));
    f.context.fs.readdirSync = () => ['devspace-web.yaml', 'devspace-db.yaml'];
    f.console.console('office');
    const listener = f.listeners.get('.devToolsConsoleCont[data-id=office] .dev-tools-console-start');
    assert.equal(typeof listener, 'function');
    listener({ preventDefault() {}, currentTarget: { dataset: { file: 'devspace-db.yaml' } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls[0][1].appId, 'office');
    assert.equal(f.calls[0][1].file, 'devspace-db.yaml');
});
