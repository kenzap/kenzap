const { test } = require('node:test');
const assert = require('node:assert/strict');
const { podSummary, podContainers, podIssues, recentWarnings, ageLabel } = require('../src/assets/js/pod-details');

function pod() {
    return { metadata: { name: 'web-123', uid: 'pod-uid' }, spec: { containers: [{ name: 'web', image: 'web:latest' }] },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }],
            containerStatuses: [{ name: 'web', ready: true, restartCount: 0, state: { running: {} } }] } };
}

test('Running requires readiness, not just the pod phase', () => {
    const p = pod(); assert.equal(podSummary(p).label, 'Running'); assert.equal(podSummary(p).tone, 'healthy');
    p.status.conditions[0].status = 'False'; assert.equal(podSummary(p).label, 'Not ready');
    p.status.conditions[0].status = 'True'; p.status.containerStatuses[0].ready = false;
    assert.equal(podSummary(p).label, 'Not ready');
});

test('crash loops, image pull failures, termination, completion and eviction are distinct', () => {
    for (const reason of ['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerConfigError']) {
        const p = pod(); p.status.containerStatuses[0].state = { waiting: { reason } };
        assert.equal(podSummary(p).label, reason); assert.equal(podSummary(p).tone, 'danger');
    }
    const p = pod(); p.metadata.deletionTimestamp = '2026-10-15T10:00:00Z';
    assert.equal(podSummary(p).label, 'Terminating'); delete p.metadata.deletionTimestamp;
    p.status.phase = 'Succeeded'; assert.equal(podSummary(p).label, 'Completed');
    p.status.phase = 'Failed'; p.status.reason = 'Evicted'; assert.equal(podSummary(p).label, 'Evicted');
});

test('init and restartable sidecar failures are not hidden behind app-container initialization', () => {
    const p = pod(); p.spec.initContainers = [{ name: 'migrate' }];
    p.status.initContainerStatuses = [{ name: 'migrate', restartCount: 2, state: { waiting: { reason: 'CrashLoopBackOff' } } }];
    assert.equal(podSummary(p).label, 'Init: CrashLoopBackOff'); assert.equal(podSummary(p).restarts, 2);
    p.status.initContainerStatuses[0].state = { terminated: { exitCode: 0, reason: 'Completed' } };
    assert.equal(podSummary(p).label, 'Running');
    p.spec.initContainers[0].restartPolicy = 'Always';
    p.status.initContainerStatuses[0].state = { waiting: { reason: 'ImagePullBackOff' } };
    p.status.containerStatuses[0].state = { waiting: { reason: 'PodInitializing' } };
    assert.equal(podSummary(p).label, 'ImagePullBackOff');
    assert.equal(podContainers(p)[1].type, 'Sidecar');
});

test('container names, rather than array order, join status, previous exits, resources and images', () => {
    const p = pod(); p.spec.containers.push({ name: 'sidecar', image: 'sidecar:1', resources: { limits: { memory: '128Mi' } } });
    p.status.containerStatuses.unshift({ name: 'sidecar', ready: true, restartCount: 4, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137 } }, state: { running: {} } });
    const summary = podSummary(p);
    assert.equal(summary.ready, 2); assert.equal(summary.total, 2); assert.equal(summary.restarts, 4);
    assert.equal(summary.containers[1].previous.reason, 'OOMKilled');
    assert.equal(summary.containers[1].resources.limits.memory, '128Mi'); assert.equal(summary.label, 'Running');
    p.spec.ephemeralContainers = [{ name: 'debug' }]; assert.equal(podContainers(p)[2].type, 'Debug');
});

test('scheduling/readiness diagnostics are deduplicated and tolerate absent status', () => {
    const p = pod(); p.status.conditions.push({ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: 'Insufficient memory' });
    p.status.message = 'Insufficient memory'; assert.equal(podSummary(p).label, 'Unschedulable');
    assert.deepEqual(podIssues(p), ['Insufficient memory']);
    assert.equal(podSummary({}).label, 'Unknown'); assert.deepEqual(podContainers({}), []);
});

test('warning history is isolated to the exact pod UID, newest-first and bounded', () => {
    const p = pod();
    const events = Array.from({ length: 15 }, (_, i) => ({ type: 'Warning', involvedObject: { uid: 'pod-uid' }, lastTimestamp: new Date(1000000 + i * 1000).toISOString(), message: String(i) }));
    events.push({ type: 'Warning', involvedObject: { uid: 'old-pod', name: 'web-123' }, message: 'old incarnation' });
    events.push({ type: 'Normal', involvedObject: { uid: 'pod-uid' }, message: 'not a warning' });
    const warnings = recentWarnings(events, p); assert.equal(warnings.length, 10); assert.equal(warnings[0].message, '14');
    assert.ok(warnings.every(event => event.involvedObject.uid === p.metadata.uid));
});

test('ages handle new, old, invalid and future timestamps without negative output', () => {
    const now = Date.parse('2026-10-15T10:00:00Z');
    for (const [age, label] of [[30000, '<1m'], [120000, '2m'], [7200000, '2h'], [259200000, '3d']]) assert.equal(ageLabel(new Date(now - age).toISOString(), now), label);
    assert.equal(ageLabel('bad', now), 'Unknown'); assert.equal(ageLabel(new Date(now + 1000).toISOString(), now), 'Unknown');
});
