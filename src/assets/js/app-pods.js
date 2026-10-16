import { clipboard } from 'electron'
import global from './global.js'
import { __html, attr, html, toast } from './helpers.js'
import { pollClusterState, monitoringLabel } from './cluster-monitor-client.js'
import { podSummary, ageLabel, podIssues, recentWarnings } from './pod-details.js'

const keyOf = pod => encodeURIComponent((pod.metadata || {}).uid || `${(pod.metadata || {}).name}:${(pod.metadata || {}).creationTimestamp || ''}`);
const timeLabel = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : __html('Unknown');

export class PodsPanel {
    constructor(app) {
        this.app = app;
        this.pods = new Map();
        this.markup = new Map();
        this.detailGeneration = 0;
    }

    init() {
        if (global.state.podsView) global.state.podsView.stop();
        this.element = document.querySelector('app-pods');
        if (!this.element) return;
        global.state.podsView = this;
        this.element.innerHTML = `<section class="col-sm-7 pt-3 pb-3 pods-section" aria-labelledby="pods-heading">
            <div class="pods-heading"><h5 class="card-title mb-0" id="pods-heading">${__html('Pods')}</h5><div class="d-flex align-items-center gap-3"><span class="pod-transport form-text m-0"></span><button type="button" class="btn btn-link p-0 pod-refresh" data-pod-action="refresh">${__html('Refresh')}</button></div></div>
            <p class="form-text mt-2 mb-1 pod-scope">${__html('Status, readiness and recent logs. Updates every 10 seconds.')}</p>
            <p class="form-text mt-0 mb-3 pod-count" role="status">${__html('Loading pods...')}</p>
            <p class="pod-error form-text text-danger mb-2" role="alert"></p>
            <p class="pod-selection-note form-text mb-2" role="status"></p>
            <div class="pod-list"></div><p class="pod-empty form-text mb-0" role="status"></p>
        </section>`;
        this.element.onclick = event => {
            const button = event.target.closest('button[data-pod-action]');
            if (!button) return;
            event.preventDefault();
            const action = button.dataset.podAction;
            if (action === 'refresh' && this.monitor) this.monitor.refresh();
            if (action === 'overview' || action === 'logs') this.select(button.dataset.key || this.selectedKey, action);
            if (action === 'close') this.select(null);
            if (action === 'detail-refresh' && this.detailPoll) this.detailPoll.refresh();
            if (action === 'copy' && this.logText) { clipboard.writeText(this.logText); toast(__html('Copied')); }
        };
        this.element.onchange = event => {
            if (event.target.matches('.pod-container-select')) { this.container = event.target.value; this.previous = false; this.restartDetail(); }
            if (event.target.matches('.pod-previous')) { this.previous = event.target.checked; this.restartDetail(); }
        };
        const clusterId = (this.app.clusters || [])[0];
        if (!clusterId) {
            this.element.querySelector('.pod-count').textContent = __html('Assign a cluster to view its pods.');
            this.element.querySelector('.pod-refresh').disabled = true;
            return;
        }
        this.monitor = pollClusterState(this.element, clusterId, 'pods', result => this.receive(result), error => this.unavailable(error), { appId: this.app.id });
    }

    stop() {
        if (this.monitor) this.monitor.stop();
        this.stopDetail();
    }

    stopDetail() {
        // Late replies from another pod, container or log instance must never replace this view.
        this.detailGeneration++;
        if (this.detailPoll) this.detailPoll.stop();
        this.detailPoll = null;
    }

    receive(result) {
        if (!this.element.isConnected) return;
        this.error = '';
        this.result = result;
        this.pods = new Map((result.data.items || []).map(pod => [keyOf(pod), pod]));
        if (this.selectedKey && !this.pods.has(this.selectedKey)) {
            this.select(null);
            this.element.querySelector('.pod-selection-note').textContent = __html('The selected pod was removed or replaced. Choose another pod to inspect.');
        }
        this.render();
        this.ensureDetail();
    }

    unavailable(error) {
        if (!this.element.isConnected) return;
        this.error = error.message;
        this.stopDetail();
        this.logText = '';
        if (this.inspector) {
            const output = this.inspector.querySelector('.pod-log-output');
            if (output) output.textContent = '';
            const status = this.inspector.querySelector('.pod-detail-status');
            if (status) status.textContent = __html('Monitoring unavailable. Reconnect and refresh to load current information.');
            const warnings = this.inspector.querySelector('.pod-events');
            if (warnings) warnings.textContent = __html('Warnings unavailable while monitoring is paused.');
        }
        this.render();
    }

    render() {
        if (!this.element || !this.element.isConnected) return;
        this.element.querySelector('.pods-section').dataset.stale = this.error || (this.result && this.result.stale) ? 'true' : 'false';
        this.element.querySelector('.pod-error').textContent = this.error || '';
        const pods = [...this.pods.values()].sort((a, b) => {
            const rank = pod => ({ danger: 0, warning: 1, neutral: 2, healthy: 3, complete: 4 })[podSummary(pod).tone];
            return rank(a) - rank(b) || String((b.metadata || {}).creationTimestamp).localeCompare(String((a.metadata || {}).creationTimestamp));
        });
        if (this.result) {
            this.element.querySelector('.pod-transport').textContent = monitoringLabel(this.result);
            this.element.querySelector('.pod-scope').textContent = __html('All pods in namespace') + ' ' + this.result.namespace + '. ' + __html('Updates automatically. Recent checks are reused for one minute.');
        }
        const attention = pods.filter(pod => ['danger', 'warning'].includes(podSummary(pod).tone)).length;
        this.element.querySelector('.pod-count').textContent = this.error ? __html('Last known status. Updates are paused or unavailable.')
            : `${pods.length} ${__html(pods.length === 1 ? 'pod' : 'pods')}${attention ? ' / ' + attention + ' ' + __html(attention === 1 ? 'needs attention' : 'need attention') : ''}`;
        this.element.querySelector('.pod-empty').textContent = !pods.length && !this.error ? __html('No pods found in this namespace.') : '';
        const list = this.element.querySelector('.pod-list');
        list.querySelectorAll('[data-pod-row]').forEach(node => {
            if (!this.pods.has(node.dataset.podRow)) { this.markup.delete(node.dataset.podRow); node.remove(); }
        });
        pods.forEach((pod, index) => {
            const key = keyOf(pod);
            let node = list.querySelector('[data-pod-row="' + key + '"]');
            if (!node) {
                list.insertAdjacentHTML('beforeend', `<article class="pod-row" data-pod-row="${attr(key)}"><div class="pod-row-summary"></div><div class="pod-row-detail" hidden></div></article>`);
                node = list.querySelector('[data-pod-row="' + key + '"]');
            }
            if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null);
            const summary = podSummary(pod), metadata = pod.metadata || {};
            const selected = key === this.selectedKey;
            const markup = `<div class="pod-row-heading"><button type="button" class="btn btn-link pod-name p-0" data-pod-action="overview" data-key="${attr(key)}" aria-expanded="${selected}" ${this.error ? 'disabled' : ''}>${html(metadata.name || 'Unknown')}</button><span class="pod-state" data-tone="${attr(summary.tone)}"><span class="pod-status-dot"></span>${html(__html(summary.label))}</span></div>
                <div class="pod-row-metrics"><span title="${attr(__html('Ready app containers / total app containers'))}">${__html('Ready')} <strong>${summary.ready}/${summary.total}</strong></span><span class="${summary.restarts ? 'pod-restarts' : ''}">${__html('Restarts')} <strong>${summary.restarts}</strong></span><span title="${attr(timeLabel(metadata.creationTimestamp))}">${__html('Age')} <strong>${html(ageLabel(metadata.creationTimestamp))}</strong></span><button type="button" class="btn btn-link p-0 pod-logs-button" data-pod-action="logs" data-key="${attr(key)}" aria-expanded="${selected && this.mode === 'logs'}" ${this.error ? 'disabled' : ''}>${__html('View logs')}</button></div>`;
            if (this.markup.get(key) !== markup) { node.querySelector('.pod-row-summary').innerHTML = markup; this.markup.set(key, markup); }
            node.querySelector('.pod-row-detail').hidden = !selected;
        });
        this.updateInspector();
    }

    select(key, mode = 'overview') {
        if (key && (this.error || !this.pods.has(key))) return;
        if (key === this.selectedKey && mode === this.mode) return;
        this.stopDetail();
        if (this.inspector) this.inspector.remove();
        this.inspector = null; this.logText = '';
        if (key !== this.selectedKey) { this.container = ''; this.previous = false; }
        this.selectedKey = key; this.mode = mode;
        this.element.querySelector('.pod-selection-note').textContent = '';
        this.render();
        this.ensureDetail();
    }

    updateInspector() {
        const pod = this.pods.get(this.selectedKey);
        if (!pod) return;
        const row = this.element.querySelector('[data-pod-row="' + this.selectedKey + '"] .pod-row-detail');
        if (!this.inspector) {
            this.factsMarkup = '';
            row.innerHTML = `<div class="pod-inspector"><div class="pod-tabs" role="group" aria-label="${attr(__html('Pod information'))}"><button type="button" class="btn btn-link p-0" data-pod-action="overview">${__html('Overview')}</button><button type="button" class="btn btn-link p-0" data-pod-action="logs">${__html('Recent logs')}</button><button type="button" class="btn btn-link p-0 ms-auto" data-pod-action="close">${__html('Close')}</button></div><div class="pod-detail-body"></div></div>`;
            this.inspector = row.querySelector('.pod-inspector');
            this.inspector.querySelector('[data-pod-action="' + this.mode + '"]').setAttribute('aria-pressed', 'true');
            const body = this.inspector.querySelector('.pod-detail-body');
            body.innerHTML = this.mode === 'logs' ? `<div class="pod-log-controls"><label>${__html('Container')}<select class="form-select form-select-sm pod-container-select" aria-label="${attr(__html('Log container'))}"></select></label><label class="pod-previous-label"><input type="checkbox" class="form-check-input pod-previous"> ${__html('Previous instance')}</label></div><div class="pod-log-actions"><span class="form-text m-0">${__html('Latest 200 lines / up to 256 KiB. Refreshes every 10 seconds.')}</span><button type="button" class="btn btn-link p-0" data-pod-action="detail-refresh">${__html('Refresh')}</button><button type="button" class="btn btn-link p-0 pod-copy-logs" data-pod-action="copy" disabled>${__html('Copy')}</button></div><p class="pod-detail-status form-text mb-2" role="status"></p><pre class="pod-log-output" tabindex="0" aria-label="${attr(__html('Recent container logs'))}"></pre>`
                : `<div class="pod-overview-facts"></div><h6 class="pod-warnings-title">${__html('Recent warnings')}</h6><p class="pod-detail-status form-text mb-2" role="status">${__html('Loading warnings...')}</p><div class="pod-events"></div>`;
        }
        const containers = podSummary(pod).containers;
        if (this.mode === 'logs') {
            if (!containers.some(container => container.name === this.container)) {
                this.container = (containers.find(container => container.type === 'App') || containers[0] || {}).name || '';
                this.previous = false; this.stopDetail();
            }
            const select = this.inspector.querySelector('.pod-container-select');
            const options = containers.map(container => `<option value="${attr(container.name)}">${html(container.name)}${container.type !== 'App' ? ' (' + __html(container.type) + ')' : ''}</option>`).join('');
            if (select.innerHTML !== options) select.innerHTML = options;
            select.value = this.container; select.disabled = !!this.error || !containers.length;
            const current = containers.find(container => container.name === this.container);
            const previous = this.inspector.querySelector('.pod-previous');
            const hasPrevious = current && (current.restarts > 0 || current.previous);
            if (this.previous && !hasPrevious) { this.previous = false; this.stopDetail(); }
            previous.checked = !!this.previous; previous.disabled = !!this.error || !hasPrevious;
            this.inspector.querySelector('.pod-copy-logs').disabled = !!this.error || !this.logText;
        } else {
            const owner = ((pod.metadata || {}).ownerReferences || []).find(item => item.controller) || ((pod.metadata || {}).ownerReferences || [])[0];
            const status = pod.status || {}, spec = pod.spec || {};
            const facts = [['Node', spec.nodeName || __html('Not scheduled')], ['Pod IP', status.podIP || __html('Not assigned')], ['QoS', status.qosClass || 'Unknown'],
                ['Created', timeLabel((pod.metadata || {}).creationTimestamp)], ['Controlled by', owner ? owner.kind + ' / ' + owner.name : __html('Standalone pod')]];
            const issues = podIssues(pod);
            const markup = `<dl class="pod-facts">${facts.map(([label, value]) => `<div><dt>${__html(label)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl>
                ${issues.length ? `<div class="pod-issues">${issues.map(issue => `<p>${html(issue)}</p>`).join('')}</div>` : ''}
                <h6 class="pod-warnings-title">${__html('Containers')}</h6>${containers.map(container => {
                    const state = container.state.waiting || container.state.terminated;
                    const label = state ? state.reason || 'Waiting' : container.state.running ? 'Running' : 'Not started';
                    const resources = container.resources, requests = resources.requests || {}, limits = resources.limits || {};
                    const previous = container.previous;
                    return `<div class="pod-container-detail"><div><strong>${html(container.name)}</strong> <span class="text-muted">${__html(container.type)} / ${html(label)}</span></div><div class="pod-image">${html(container.image)}</div><div class="pod-resource-line">${__html('CPU request / limit')}: ${html(requests.cpu || __html('Not set'))} / ${html(limits.cpu || __html('Not set'))}</div><div class="pod-resource-line">${__html('Memory request / limit')}: ${html(requests.memory || __html('Not set'))} / ${html(limits.memory || __html('Not set'))}</div>${previous ? `<p class="pod-last-exit">${__html('Last exit')}: ${html(previous.reason || 'Unknown')} (${__html('code')} ${html(previous.exitCode)}) / ${html(timeLabel(previous.finishedAt))}</p>` : ''}</div>`;
                }).join('')}`;
            const target = this.inspector.querySelector('.pod-overview-facts');
            if (this.factsMarkup !== markup) { target.innerHTML = markup; this.factsMarkup = markup; }
        }
    }

    restartDetail() {
        this.stopDetail(); this.logText = '';
        if (this.inspector) {
            const output = this.inspector.querySelector('.pod-log-output');
            if (output) output.textContent = '';
        }
        this.updateInspector(); this.ensureDetail();
    }

    ensureDetail() {
        const pod = this.pods.get(this.selectedKey);
        if (!pod || this.error || this.detailPoll || !this.inspector || !this.inspector.isConnected) return;
        const generation = ++this.detailGeneration, metadata = pod.metadata || {};
        const clusterId = this.app.clusters[0];
        const status = this.inspector.querySelector('.pod-detail-status');
        const current = () => generation === this.detailGeneration && this.inspector && this.inspector.isConnected && !this.error;
        if (this.mode === 'logs' && !this.container) { status.textContent = __html('No containers available for logs.'); return; }
        status.textContent = __html(this.mode === 'logs' ? 'Loading recent logs...' : 'Loading warnings...');
        const options = this.mode === 'logs' ? { appId: this.app.id, pod: metadata.name, container: this.container, previous: !!this.previous, timestamps: true, ...(metadata.uid ? { podUid: metadata.uid } : {}) }
            : { appId: this.app.id, pod: metadata.name, ...(metadata.uid ? { podUid: metadata.uid } : {}) };
        this.detailPoll = pollClusterState(this.inspector, clusterId, this.mode === 'logs' ? 'logs' : 'events', result => {
            if (!current()) return;
            if (this.mode === 'logs') {
                const output = this.inspector.querySelector('.pod-log-output');
                const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
                this.logText = String(result.data || ''); output.textContent = this.logText;
                if (atBottom) output.scrollTop = output.scrollHeight;
                this.inspector.querySelector('.pod-copy-logs').disabled = !this.logText;
                status.textContent = this.logText ? __html('Updated') + ' ' + new Date(result.observedAt).toLocaleTimeString() : __html('No recent log lines for this container instance.');
            } else {
                const warnings = recentWarnings(result.data.items, pod);
                status.textContent = warnings.length ? __html('Latest warnings for this pod instance.') : __html('No recent warnings for this pod instance.');
                this.inspector.querySelector('.pod-events').innerHTML = warnings.map(event => `<div class="pod-event"><strong>${html(event.reason || 'Warning')}</strong><span class="text-muted">${html(ageLabel((event.series || {}).lastObservedTime || event.lastTimestamp || event.eventTime || (event.metadata || {}).creationTimestamp))}${(event.count || (event.series || {}).count || 1) > 1 ? ' / ' + html(event.count || event.series.count) + 'x' : ''}</span><p>${html(event.message || event.note || '')}</p></div>`).join('');
            }
        }, error => {
            if (!current()) return;
            status.textContent = __html(this.mode === 'logs' ? 'Logs unavailable: ' : 'Warnings unavailable: ') + error.message;
            if (this.mode === 'logs') { this.logText = ''; this.inspector.querySelector('.pod-log-output').textContent = ''; this.inspector.querySelector('.pod-copy-logs').disabled = true; }
            else this.inspector.querySelector('.pod-events').textContent = '';
        }, options);
    }
}
