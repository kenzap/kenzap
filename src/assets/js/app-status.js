import global from './global.js';
import { __html, attr, html, getSetting, cacheSettings } from './helpers.js';
import { getAppList } from './app-list-helpers.js';
import { pollClusterState, readClusterState, monitoringLabel } from './cluster-monitor-client.js';

export class AppStatus {
    constructor() {
        this.monitors = [];
        this.diagnostics = new Map();
        this.generations = new Map();
    }

    init() {
        if (global.state.statusMonitor) global.state.statusMonitor.stop();
        if (global.edgeTimeout) { clearInterval(global.edgeTimeout); global.edgeTimeout = null; }
        global.state.statusMonitor = this;
        this.getEdgeStatus();
    }

    stop() {
        this.monitors.forEach(monitor => monitor.stop());
        this.monitors = [];
        for (const id of this.generations.keys()) this.generations.set(id, this.generations.get(id) + 1);
    }

    getEdgeStatus() {
        if (global.state.page !== 'app-list' && global.state.page !== 'app-settings') return;
        this.stop();
        getAppList().forEach(app => {
            const cache = getSetting(app.id);
            if (!cache.clusters || !cache.clusters.length || !cache.path) return;
            if (global.state.page === 'app-list' && global.state.project && cache.project !== global.state.project) return;
            if (global.state.page === 'app-settings' && global.state.app.id !== app.id) return;
            const element = document.querySelector(`.edge-status[data-id="${app.id}"]`);
            if (!element) return;
            this.generations.set(app.id, (this.generations.get(app.id) || 0) + 1);
            if (!global.state.dev[app.id]) global.state.dev[app.id] = {};
            this.monitors.push(pollClusterState(element, cache.clusters[0], 'deployments', result => {
                const deployments = result.data.items || [];
                const state = global.state.dev[app.id];
                const conditions = deployments.reduce((all, item) => all.concat((item.status || {}).conditions || []), []);
                state.edgeConditions = conditions;
                state.monitoringTransport = result.transport;
                const images = deployments.reduce((all, item) => all.concat(item.spec.template.spec.containers.map(container => container.image)), []);
                const tags = images.map(image => image.includes(':') ? image.slice(image.lastIndexOf(':') + 1) : 'latest');
                state.edgeImage = tags[0] || '';
                if (!app.tags) app.tags = [];
                if (tags.some(tag => !app.tags.includes(tag))) {
                    app.tags = [...new Set(app.tags.concat(tags))];
                    cacheSettings(app);
                }
                const unavailable = deployments.some(item => (item.status || {}).unavailableReplicas > 0);
                const ready = deployments.length && deployments.every(item => {
                    const status = item.status || {};
                    return (status.readyReplicas || 0) >= (item.spec.replicas == null ? 1 : item.spec.replicas)
                        && (status.observedGeneration || 0) >= (item.metadata.generation || 0);
                });
                const status = unavailable ? 'offline' : ready ? 'online' : deployments.length || state.edgePending ? 'pending' : 'unknown';
                const condition = conditions.slice(-1)[0];
                const message = `${monitoringLabel(result)}. ${condition && condition.message ? condition.message : deployments.length ? '' : __html('No deployments found in this namespace.')}`;
                this.setStatus(app, element, status, message, monitoringLabel(result));
                if (ready) {
                    state.edgePending = false;
                    state.edgeLogs = '';
                    state.edgeEvent = '';
                    const warnings = document.querySelector('.app-warnings');
                    if (global.state.page === 'app-settings' && warnings) warnings.innerHTML = '';
                } else if (global.state.page === 'app-settings' && status !== 'unknown') {
                    this.showAlert(app);
                    this.getLogs(app, cache, element, deployments);
                }
            }, error => {
                this.generations.set(app.id, (this.generations.get(app.id) || 0) + 1);
                this.setStatus(app, element, 'unknown', error.message, error.message.startsWith('Monitoring paused') ? __html('Monitoring paused') : __html('Monitoring unavailable'));
                if (global.state.page === 'app-settings') {
                    const warnings = document.querySelector('.app-warnings');
                    if (warnings) warnings.innerHTML = `<div class="alert alert-light" role="status">${html(error.message)}</div>`;
                }
            }, { appId: app.id }));
        });
    }

    setStatus(app, element, status, message, monitoringText) {
        global.state.dev[app.id].edgeStatus = status;
        element.classList.remove('online', 'offline', 'pending', 'unknown', 'd-none');
        element.classList.add(status);
        element.title = message;
        const title = document.querySelector(`.app-title-cont[data-id="${app.id}"]`);
        if (title) title.title = message;
        const monitoring = document.querySelector(`.app-monitoring-state[data-id="${app.id}"]`);
        if (monitoring) { monitoring.textContent = monitoringText || ''; monitoring.title = message; }
        const warning = document.querySelector(`.bi-exclamation-triangle[data-id="${app.id}"]`);
        if (warning) warning.classList.toggle('d-none', status !== 'offline');
    }

    showAlert(app) {
        const state = global.state.dev[app.id];
        const warnings = document.querySelector('.app-warnings');
        if (!warnings || global.state.page !== 'app-settings' || global.state.app.id !== app.id) return;
        if (state.edgeStatus !== 'offline' && state.edgeStatus !== 'pending') return;
        const condition = (state.edgeConditions || []).slice(-1)[0];
        warnings.innerHTML = `
            <div class="alert ${state.edgeStatus === 'offline' ? 'alert-danger' : 'alert-warning'}" role="status" data-id="${attr(app.id)}">
                <div class="alert-msg">
                    <h4 class="alert-heading">${html(state.edgeStatus)}</h4>
                    ${condition && condition.message ? `<pre>${html(condition.message)}</pre><hr>` : ''}
                    ${state.edgeLogs ? `<pre class="mb-0">${html(state.edgeLogs)}</pre>` : ''}
                    ${state.edgeEvent ? `<pre class="mb-0">${html(state.edgeEvent)}</pre>` : ''}
                </div>
            </div>`;
    }

    async getLogs(app, cache, element, deployments) {
        if (this.diagnostics.has(app.id)) return;
        this.diagnostics.set(app.id, true);
        const generation = this.generations.get(app.id) || 0;
        const active = () => element.isConnected && generation === (this.generations.get(app.id) || 0)
            && global.state.dev[app.id].edgeStatus !== 'online' && global.state.dev[app.id].edgeStatus !== 'unknown';
        const read = (operation, options = {}) => readClusterState(cache.clusters[0], operation, { ...options, appId: app.id });
        try {
            const result = await read('pods');
            if (!active()) return;
            const selectors = deployments.map(item => item.spec.selector && item.spec.selector.matchLabels).filter(Boolean);
            const pods = (result.data.items || []).filter(pod => !selectors.length || selectors.some(selector =>
                Object.keys(selector).every(key => (pod.metadata.labels || {})[key] === selector[key])));
            pods.sort((a, b) => String(b.metadata.creationTimestamp).localeCompare(String(a.metadata.creationTimestamp)));
            const pod = pods.find(item => !(item.status.conditions || []).some(condition => condition.type === 'Ready' && condition.status === 'True')) || pods[0];
            if (!pod) return;
            const [logs, events] = await Promise.allSettled([read('logs', { pod: pod.metadata.name }), read('events')]);
            if (!active()) return;
            const state = global.state.dev[app.id];
            state.edgeLogs = logs.status === 'fulfilled' ? logs.value.data : logs.reason.message;
            if (events.status === 'fulfilled') {
                const relevant = (events.value.data.items || []).filter(event => {
                    const object = event.involvedObject || event.regarding || {};
                    return object.name === pod.metadata.name || deployments.some(item => item.metadata.name === object.name);
                });
                relevant.sort((a, b) => String(a.lastTimestamp || a.eventTime || a.metadata.creationTimestamp)
                    .localeCompare(String(b.lastTimestamp || b.eventTime || b.metadata.creationTimestamp)));
                const last = relevant.slice(-1)[0];
                state.edgeEvent = last ? last.message || last.note || '' : '';
            } else state.edgeEvent = events.reason.message;
            this.showAlert(app);
        } catch (error) {
            if (active()) { global.state.dev[app.id].edgeLogs = error.message; this.showAlert(app); }
        } finally { this.diagnostics.delete(app.id); }
    }
}
