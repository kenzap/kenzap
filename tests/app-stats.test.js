const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
    const notice = { textContent: '' };
    const classes = new Set();
    const element = {
        isConnected: true,
        querySelector: () => notice,
        classList: { add: value => classes.add(value), remove: value => classes.delete(value) }
    };
    const polls = [];
    const context = vm.createContext({
        document: { querySelector: () => element },
        getSetting: () => ({ clusters: ['remote'] }),
        monitoringLabel: () => 'Monitoring via SSH',
        pollClusterState: (...args) => {
            const poll = { args, stopped: false, stop() { this.stopped = true; } };
            polls.push(poll);
            return poll;
        }
    });
    const source = fs.readFileSync(path.join(__dirname, '../src/assets/js/app-stats.js'), 'utf8')
        .replace(/^import .*$/gm, '').replace('export class AppStats', 'class AppStats');
    vm.runInContext(`${source}\nthis.AppStats = AppStats;`, context);
    const stats = new context.AppStats({ state: { app: { id: 'admin' } } });
    stats.getResourceRange = () => {};
    stats.drawCharts = () => {};
    stats.refreshCharts();
    return { stats, polls, notice, classes };
}

test('app charts use the shared app-scoped monitoring route and sum pod usage once', () => {
    const f = fixture();
    const args = f.polls[0].args;
    assert.equal(args[1], 'remote');
    assert.equal(args[2], 'topPods');
    assert.equal(args[5].appId, 'admin');
    assert.equal(args[6], 5000);
    args[3]({ transport: 'ssh', data: 'NAME CPU(cores) MEMORY(bytes)\nadmin-1 100m 256Mi\nadmin-2 0.05 0.5Gi\n' });
    assert.equal(f.stats.chart.cpu.at(-1)[1], 150);
    assert.equal(f.stats.chart.memory.at(-1)[1], 768);
    assert.equal(f.stats.chart.cpu.length, 20);
    assert.equal(f.notice.textContent, 'Monitoring via SSH');
});

test('paused chart monitoring marks data stale and recovery clears the warning', () => {
    const f = fixture();
    f.polls[0].args[4](new Error('Monitoring paused. Connect via SSH.'));
    assert.ok(f.classes.has('monitoring-stale'));
    assert.match(f.notice.textContent, /Monitoring paused/);
    f.polls[0].args[3]({ data: 'NAME CPU MEMORY\nadmin-1 1m 1Mi' });
    assert.ok(!f.classes.has('monitoring-stale'));
});

test('empty metrics do not add a fake healthy zero sample and obsolete polls are stopped', () => {
    const f = fixture();
    const index = f.stats.chart.index;
    assert.throws(() => f.polls[0].args[3]({ data: 'No resources found' }), /No pod metrics/);
    assert.equal(f.stats.chart.index, index);
    f.stats.refreshCharts();
    assert.ok(f.polls[0].stopped);
    f.stats.destroy();
    assert.ok(f.polls[1].stopped);
});
