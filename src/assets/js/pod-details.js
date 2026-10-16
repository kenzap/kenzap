'use strict';

function podContainers(pod) {
    const spec = pod.spec || {}, status = pod.status || {};
    return [
        ['App', spec.containers, status.containerStatuses],
        ['Init', spec.initContainers, status.initContainerStatuses],
        ['Debug', spec.ephemeralContainers, status.ephemeralContainerStatuses]
    ].flatMap(([type, containers, statuses]) => (containers || []).map(container => {
        const current = (statuses || []).find(item => item.name === container.name) || {};
        return { name: container.name, type: type === 'Init' && container.restartPolicy === 'Always' ? 'Sidecar' : type,
            image: container.image || current.image || '', resources: container.resources || {},
            state: current.state || {}, previous: (current.lastState || {}).terminated || null,
            restarts: current.restartCount || 0, ready: !!current.ready };
    }));
}

function podSummary(pod) {
    const status = pod.status || {}, containers = podContainers(pod);
    const app = containers.filter(container => container.type === 'App');
    const ready = app.filter(container => container.ready).length;
    const restarts = containers.reduce((sum, container) => sum + container.restarts, 0);
    let label = status.phase || 'Unknown', tone = 'neutral';
    const scheduled = (status.conditions || []).find(condition => condition.type === 'PodScheduled');
    const init = containers.find(container => container.type === 'Init'
        && (!container.state.terminated || container.state.terminated.exitCode !== 0));
    const waitingContainers = containers.filter(container => (container.type === 'App' || container.type === 'Sidecar') && container.state.waiting);
    const waiting = waitingContainers.find(container => /BackOff|Err|Invalid|Failed/.test(container.state.waiting.reason)) || waitingContainers[0];
    const failed = containers.find(container => container.state.terminated && container.state.terminated.exitCode !== 0);
    if ((pod.metadata || {}).deletionTimestamp) { label = 'Terminating'; tone = 'warning'; }
    else if (status.phase === 'Succeeded') { label = 'Completed'; tone = 'complete'; }
    else if (status.phase === 'Failed') { label = status.reason || 'Failed'; tone = 'danger'; }
    else if (scheduled && scheduled.status === 'False') { label = scheduled.reason || 'Unschedulable'; tone = 'warning'; }
    else if (init) {
        const state = init.state.waiting || init.state.terminated;
        label = state && state.reason ? 'Init: ' + state.reason : 'Initializing';
        tone = init.state.terminated || /BackOff|Err|Invalid|Failed/.test(label) ? 'danger' : 'warning';
    } else if (waiting) {
        label = waiting.state.waiting.reason || 'Waiting';
        tone = /BackOff|Err|Invalid|Failed/.test(label) ? 'danger' : 'warning';
    } else if (failed) { label = failed.state.terminated.reason || 'Container error'; tone = 'danger'; }
    else if (status.phase === 'Running') {
        const condition = (status.conditions || []).find(item => item.type === 'Ready');
        const isReady = ready === app.length && app.length > 0 && condition && condition.status === 'True';
        label = isReady ? 'Running' : 'Not ready'; tone = isReady ? 'healthy' : 'warning';
    } else if (status.phase === 'Pending') tone = 'warning';
    return { label, tone, ready, total: app.length, restarts, containers };
}

function ageLabel(timestamp, now = Date.now()) {
    const age = now - Date.parse(timestamp);
    if (!Number.isFinite(age) || age < 0) return 'Unknown';
    if (age < 60000) return '<1m';
    if (age < 3600000) return Math.floor(age / 60000) + 'm';
    if (age < 86400000) return Math.floor(age / 3600000) + 'h';
    return Math.floor(age / 86400000) + 'd';
}

function podIssues(pod) {
    const status = pod.status || {}, issues = [];
    if (status.message) issues.push(status.message);
    for (const condition of status.conditions || []) {
        if (condition.status === 'False' && condition.message) issues.push(condition.message);
    }
    for (const container of podContainers(pod)) {
        const state = container.state.waiting || container.state.terminated;
        if (state && state.message) issues.push(`${container.name}: ${state.message}`);
    }
    return [...new Set(issues)].slice(0, 6);
}

function recentWarnings(events, pod) {
    const metadata = pod.metadata || {};
    return (events || []).filter(event => {
        const object = event.involvedObject || event.regarding || {};
        return event.type === 'Warning' && (metadata.uid ? object.uid === metadata.uid : object.name === metadata.name && object.kind === 'Pod');
    }).sort((a, b) => {
        const timestamp = event => Date.parse((event.series || {}).lastObservedTime || event.lastTimestamp || event.eventTime || (event.metadata || {}).creationTimestamp) || 0;
        return timestamp(b) - timestamp(a);
    }).slice(0, 10);
}

module.exports = { podContainers, podSummary, ageLabel, podIssues, recentWarnings };
