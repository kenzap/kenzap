const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fileStatus, resourceStatus } = require('../src/main/config-file-status');
const annotation = 'kubectl.kubernetes.io/last-applied-configuration';
const manifest = () => ({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'office', namespace: 'office' },
    spec: { replicas: 1, template: { metadata: { labels: { app: 'office' } }, spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] } } } });
const applied = desired => { const live = structuredClone(desired); live.metadata.annotations = { [annotation]: JSON.stringify(desired) }; return live; };

test('a matching live configuration is Applied independently of pod health and server-generated metadata', () => {
    const desired = manifest(), live = applied(desired);
    Object.assign(live.metadata, { uid: 'uid', generation: 5, resourceVersion: '12', creationTimestamp: 'yesterday', managedFields: [] });
    live.status = { availableReplicas: 0 }; live.spec.strategy = { type: 'RollingUpdate' };
    live.spec.template.spec.containers[0].imagePullPolicy = 'IfNotPresent';
    live.spec.template.spec.containers.push({ name: 'injected-sidecar', image: 'proxy:1' });
    assert.equal(resourceStatus(desired, live, 'office'), 'applied');
});

test('missing, partial, changed, present-unverified and deleting resources are distinct', () => {
    const desired = manifest(), second = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings' }, data: { key: 'value' } };
    assert.equal(fileStatus([desired], [], 'office').status, 'not-applied');
    assert.equal(fileStatus([desired, second], [applied(desired)], 'office').status, 'partial');
    const changed = applied(desired); changed.spec.replicas = 2;
    assert.equal(fileStatus([desired], [changed], 'office').status, 'changed');
    assert.equal(fileStatus([desired], [desired], 'office').status, 'present');
    const removing = applied(desired); removing.metadata.deletionTimestamp = new Date().toISOString();
    assert.equal(fileStatus([desired], [removing], 'office').status, 'removing');
    assert.equal(fileStatus([], [], 'office').status, 'unknown');
});

test('removing a local field or named array item is detected even when the remaining fields match live defaults', () => {
    const original = manifest(), desired = structuredClone(original), live = applied(original);
    delete desired.spec.replicas;
    assert.equal(resourceStatus(desired, live, 'office'), 'different');
    const old = manifest(); old.spec.template.spec.containers.push({ name: 'old-worker', image: 'busybox' });
    assert.equal(resourceStatus(manifest(), applied(old), 'office'), 'different');
});

test('object ordering, missing default namespaces and irrelevant status fields do not cause false changes', () => {
    const desired = { kind: 'ConfigMap', metadata: { name: 'settings', labels: {} }, apiVersion: 'v1', data: { z: '2', a: '1' } };
    const previous = { data: { a: '1', z: '2' }, apiVersion: 'v1', kind: 'ConfigMap', metadata: { namespace: 'office', name: 'settings' } };
    const live = applied(previous); live.status = {};
    assert.equal(resourceStatus(desired, live, 'office'), 'applied');
});

test('Secret stringData is compared to live base64 data without changing source objects', () => {
    const desired = { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'db' }, stringData: { pass: 'private\npassword' } };
    const live = applied(desired); delete live.stringData; live.data = { pass: Buffer.from(desired.stringData.pass).toString('base64') };
    assert.equal(resourceStatus(desired, live, 'office'), 'applied'); assert.ok(desired.stringData);
    live.data.pass = Buffer.from('rotated').toString('base64'); assert.equal(resourceStatus(desired, live, 'office'), 'different');
});

test('unreadable or absent last-applied annotations never produce a verified Applied badge', () => {
    const desired = manifest(), live = applied(desired);
    live.metadata.annotations[annotation] = 'not JSON'; assert.equal(resourceStatus(desired, live, 'office'), 'present');
    delete live.metadata.annotations[annotation]; assert.equal(resourceStatus(desired, live, 'office'), 'present');
});

test('resource identity includes API group and namespace and ignores server list ordering', () => {
    const desired = manifest(), elsewhere = applied(desired); elsewhere.metadata.namespace = 'other';
    assert.equal(fileStatus([desired], [elsewhere], 'office').status, 'not-applied');
    const custom = { apiVersion: 'other.test/v1', kind: 'Deployment', metadata: { name: 'office', namespace: 'office' } };
    assert.equal(fileStatus([desired], [custom], 'office').status, 'not-applied');
});

test('API formatting of CPU, memory and storage quantities does not falsely mark equivalent files as changed', () => {
    for (const [cpu, actualCpu, memory, actualMemory] of [['0.1', '100m', '1024Mi', '1Gi'], [1, '1', '1Ei', '1152921504606846976']]) {
        const desired = manifest(); desired.spec.template.spec.containers[0].resources = { requests: { cpu, memory } };
        const live = applied(desired); live.spec.template.spec.containers[0].resources.requests = { cpu: actualCpu, memory: actualMemory };
        assert.equal(resourceStatus(desired, live, 'office'), 'applied');
        live.spec.template.spec.containers[0].resources.requests.cpu = '2';
        assert.equal(resourceStatus(desired, live, 'office'), 'different');
    }
});
