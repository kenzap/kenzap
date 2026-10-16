import { ipcRenderer } from 'electron'
import global from './global.js'
import { __html, html, attr, getDefaultAppPath } from './helpers.js'
import { stateCache, FRESH_MS } from './state-cache.js'
import { monitoringIdentity } from './monitoring-identity.js'
import '../scss/app-config-files.css'

const transportLabel = transport => ({ ssh: 'Via SSH', direct: 'Direct API', local: 'Minikube' })[transport] || '';
const statusLabels = {
    applied: ['Applied', 'healthy', 'All declared resources match the file and their last-applied configuration.'],
    'not-applied': ['Not applied', 'muted', 'None of the resources in this file were found in the selected namespace.'],
    partial: ['Partially applied', 'warning', 'Some resources exist, but others are missing.'],
    changed: ['Changes detected', 'warning', 'The saved file differs from the live resources or their last-applied configuration.'],
    present: ['Present', 'info', 'Resources exist and declared fields match, but their last-applied version cannot be verified.'],
    removing: ['Removing', 'warning', 'One or more resources are being deleted.'],
    unknown: ['Unknown', 'muted', 'Cluster status has not been verified. This does not mean the file is not applied.'],
    checking: ['Checking...', 'muted', 'Reading configuration status from the selected cluster.'],
    invalid: ['Invalid file', 'danger', 'Fix this manifest before applying it.'],
    'wrong-namespace': ['Different namespace', 'muted', 'This file targets another namespace.'],
    unsupported: ['Not supported', 'muted', 'The file includes cluster-wide resources or kinds not supported by this cluster.']
};

export class ConfigFilesPanel {
    constructor(app) {
        this.app = app; this.catalog = { rows: [], clusters: [] }; this.generation = 0; this.results = new Map();
        this.fileStatuses = new Map(); this.statusGeneration = 0;
    }

    init() {
        if (global.state.configFilesView) global.state.configFilesView.destroy();
        this.element = document.querySelector('app-config-files');
        if (!this.element) return;
        global.state.configFilesView = this;
        this.element.innerHTML = `<section class="col-sm-7 pt-3 pb-3 config-files-section" aria-labelledby="config-files-heading">
            <div class="config-files-heading"><h5 class="card-title mb-0" id="config-files-heading">${__html('Configuration Files')}</h5><button type="button" class="btn btn-link p-0" data-config-action="refresh">${__html('Refresh')}</button></div>
            <p class="form-text mt-2 mb-3">${__html('Apply saved Kubernetes YAML and JSON files from this workspace, including subfolders such as etc/.')}</p>
            <div class="config-files-target"><label for="config-files-cluster" class="form-text m-0">${__html('Target cluster')}</label><select id="config-files-cluster" class="form-select form-select-sm" aria-label="${attr(__html('Configuration target cluster'))}"></select><span class="config-files-transport form-text m-0"></span></div>
            <p class="config-files-scope form-text mt-2 mb-3"></p><p class="config-files-error form-text text-danger" role="alert"></p>
            <div class="config-files-list"></div><p class="config-files-empty form-text mb-3" role="status">${__html('Loading configuration files...')}</p>
            <p class="config-files-note form-text mt-3 mb-0">${__html('Edit opens your default editor, such as VS Code. Save there, then return here or Refresh. Kubeconfigs and DevSpace settings are excluded.')}</p>
            <p class="config-files-note form-text mt-1 mb-0">${__html('Remove from cluster keeps the file. Move to Trash removes only the local file. Publish may recreate removed resources if it still references them.')}</p>
            <p class="config-files-note form-text mt-1 mb-0">${__html('Recent checks are reused for one minute. Last known status stays visible during updates. Refresh checks immediately. Pod health is shown separately above.')}</p>
        </section>`;
        this.element.onclick = event => {
            const button = event.target.closest('button[data-config-action]');
            if (!button || button.disabled) return;
            event.preventDefault();
            if (button.dataset.configAction === 'refresh') this.refresh();
            else this.action(button.dataset.file, button.dataset.configAction);
        };
        this.element.querySelector('select').onchange = event => { this.clusterId = event.target.value; this.results.clear(); this.rememberCatalog(); this.checkStatuses(false); };
        this.focus = () => { if (!this.busy) this.refresh(false); };
        window.addEventListener('focus', this.focus);
        this.connectionChanged = (event, update) => {
            if (!update || update.id !== this.clusterId || !this.element.isConnected) return;
            stateCache.invalidate(scope => scope.appId === this.app.id && scope.kind !== 'monitor');
            this.statusGeneration++; clearTimeout(this.statusTimer); this.fileStatuses.clear();
            if (!this.busy) this.refresh(); else this.render();
        };
        ipcRenderer.on('cluster-connection-status', this.connectionChanged);
        this.stateChanged = (event, update) => {
            if (!update || update.appId !== this.app.id || !this.element.isConnected) return;
            stateCache.invalidate(scope => scope.appId === this.app.id && scope.kind !== 'monitor');
            this.statusGeneration++; this.fileStatuses.clear(); this.render();
            if (!this.busy) this.refresh();
        };
        ipcRenderer.on('app-state-invalidated', this.stateChanged);
        this.observer = new MutationObserver(() => { if (!this.element.isConnected) this.destroy(); });
        this.observer.observe(document.body, { childList: true, subtree: true });
        const cached = stateCache.peek(this.catalogKey());
        if (cached) {
            this.catalog = cached.value.catalog; this.clusterId = cached.value.clusterId; this.loaded = true;
            const cluster = this.catalog.clusters.find(item => item.id === this.clusterId);
            for (const row of this.catalog.rows) {
                const entry = cluster && !cluster.error && stateCache.peek(this.statusKey(row, cluster));
                if (entry) this.fileStatuses.set(row.file, { ...entry.value, stale: !entry.fresh });
            }
            this.render();
        }
        this.refresh(false);
    }

    destroy() {
        this.generation++;
        this.statusGeneration++; clearTimeout(this.statusTimer);
        if (this.focus) window.removeEventListener('focus', this.focus);
        if (this.connectionChanged) ipcRenderer.removeListener('cluster-connection-status', this.connectionChanged);
        if (this.stateChanged) ipcRenderer.removeListener('app-state-invalidated', this.stateChanged);
        if (this.observer) this.observer.disconnect();
    }

    async invoke(channel, request) {
        const result = await ipcRenderer.invoke(channel, request);
        if (!result || !result.ok) throw new Error(result && result.error || __html('Unable to complete this configuration action.'));
        return result.value;
    }

    catalogKey() {
        const identity = monitoringIdentity(getDefaultAppPath(), this.app.id);
        return identity ? JSON.stringify(['config-catalog', this.app.id, identity]) : null;
    }

    statusKey(row, cluster) {
        const identity = monitoringIdentity(getDefaultAppPath(), this.app.id, cluster.id);
        return identity ? JSON.stringify(['config-status', this.app.id, identity, cluster.id, cluster.namespace, cluster.transport, row.file, row.digest]) : null;
    }

    rememberCatalog() {
        const key = this.catalogKey();
        if (key) stateCache.set(key, { catalog: this.catalog, clusterId: this.clusterId }, { appId: this.app.id, clusterIds: this.catalog.clusters.map(cluster => cluster.id), kind: 'config-catalog' });
    }

    async refresh(force = true) {
        if (this.busy || !this.element.isConnected) return;
        this.statusGeneration++; clearTimeout(this.statusTimer);
        const generation = ++this.generation;
        try {
            const catalog = await this.invoke('app-config-files-list', { appId: this.app.id });
            if (!this.element.isConnected || generation !== this.generation) return;
            this.catalog = catalog; this.error = ''; this.loaded = true;
            if (!catalog.clusters.some(cluster => cluster.id === this.clusterId)) this.clusterId = (catalog.clusters[0] || {}).id || '';
            this.rememberCatalog();
        } catch (error) {
            if (!this.element.isConnected || generation !== this.generation) return;
            this.error = error.message; this.loaded = true;
            this.catalog = { rows: [], clusters: [] };
        }
        this.render();
        await this.checkStatuses(force);
    }

    scheduleStatusCheck(delay = FRESH_MS) {
        clearTimeout(this.statusTimer);
        if (!this.element.isConnected) return;
        this.statusTimer = setTimeout(() => {
            if (document.hidden || this.busy) this.scheduleStatusCheck();
            else this.refresh(false);
        }, delay);
    }

    async checkStatuses(force = true) {
        const generation = ++this.statusGeneration, clusterId = this.clusterId;
        clearTimeout(this.statusTimer); this.fileStatuses.clear();
        const cluster = this.catalog.clusters.find(item => item.id === clusterId);
        const files = [];
        let nextCheck = FRESH_MS;
        for (const row of this.catalog.rows) {
            const foreign = cluster && cluster.namespace && row.resources.some(resource => resource.metadata.namespace && resource.metadata.namespace !== cluster.namespace);
            const status = row.error ? 'invalid' : foreign ? 'wrong-namespace' : !cluster || cluster.error ? 'unknown' : 'checking';
            const entry = status === 'checking' && stateCache.peek(this.statusKey(row, cluster));
            this.fileStatuses.set(row.file, entry ? { ...entry.value, stale: force || !entry.fresh } : { status });
            if (!force && entry && entry.fresh) nextCheck = Math.min(nextCheck, Math.max(1, FRESH_MS - (Date.now() - entry.at)));
            if (status === 'checking' && (force || !entry || !entry.fresh)) files.push({ file: row.file, digest: row.digest });
        }
        this.render();
        const current = () => generation === this.statusGeneration && !this.busy && this.element.isConnected && clusterId === this.clusterId;
        for (let offset = 0; offset < files.length && current(); offset += 20) {
            const batch = files.slice(offset, offset + 20);
            const keys = new Map(batch.map(file => [file.file, this.statusKey(file, cluster)]));
            try {
                const requestKey = JSON.stringify(['config-check', [...keys.values()], batch]);
                const load = () => this.invoke('app-config-files-status', { appId: this.app.id, clusterId, files: batch });
                const response = [...keys.values()].every(Boolean) ? await stateCache.read(requestKey, load, {
                    force: true, retain: false, scope: { appId: this.app.id, clusterId, kind: 'config-check' }
                }) : await load();
                if (!current()) return;
                if (batch.some(file => keys.get(file.file) !== this.statusKey(file, cluster))) {
                    for (const file of batch) this.fileStatuses.set(file.file, { status: 'unknown' });
                    throw new Error(__html('The status target changed. Refresh to check again.'));
                }
                if (response.clusterId !== clusterId || response.namespace !== cluster.namespace || !Array.isArray(response.rows)) throw new Error(__html('The status target changed. Refresh to check again.'));
                const received = new Set();
                for (const row of response.rows) if (batch.some(file => file.file === row.file && file.digest === row.digest)) {
                    const result = { ...row, checkedAt: response.checkedAt };
                    this.fileStatuses.set(row.file, result); received.add(row.file);
                    const key = this.statusKey(row, cluster);
                    if (key && row.status !== 'unknown') stateCache.set(key, result, { appId: this.app.id, clusterId, kind: 'config-status' });
                    else if (key) stateCache.delete(key);
                }
                for (const file of batch) if (!received.has(file.file)) {
                    this.fileStatuses.set(file.file, { status: 'unknown' }); stateCache.delete(keys.get(file.file));
                }
            } catch (error) {
                if (!current()) return;
                for (const file of batch) {
                    stateCache.delete(keys.get(file.file));
                    const previous = this.fileStatuses.get(file.file);
                    this.fileStatuses.set(file.file, previous && previous.checkedAt ? { ...previous, stale: true, failed: true, message: error.message } : { status: 'unknown', message: error.message });
                }
            }
            if (current()) this.render();
        }
        if (current()) this.scheduleStatusCheck(nextCheck);
    }

    statusMarkup(row) {
        const result = this.fileStatuses.get(row.file) || { status: 'unknown' };
        const definition = statusLabels[result.status] || statusLabels.unknown;
        const counts = result.counts ? ` ${result.counts.total - result.counts.missing}/${result.counts.total} ` + __html('resources found.') : '';
        const checked = result.checkedAt ? ' ' + __html('Checked') + ': ' + new Date(result.checkedAt).toLocaleTimeString() : '';
        const suffix = result.stale ? __html(result.failed ? 'Last known; updates unavailable' : 'Last known; refreshing...') : '';
        const title = (result.message || __html(definition[2])) + counts + checked;
        return `<span class="config-file-status" data-status="${attr(result.status)}" data-stale="${result.stale ? 'true' : 'false'}" data-tone="${result.stale ? 'muted' : definition[1]}" title="${attr(title)}" role="status"><span aria-hidden="true"></span>${__html(definition[0])}${suffix ? ' (' + suffix + ')' : ''}</span>`;
    }

    render() {
        if (!this.element.isConnected) return;
        const cluster = this.catalog.clusters.find(item => item.id === this.clusterId);
        const select = this.element.querySelector('select');
        select.innerHTML = this.catalog.clusters.map(item => `<option value="${attr(item.id)}">${html(item.name.replace(/&nbsp;/g, ' '))}</option>`).join('');
        select.value = this.clusterId; select.disabled = !!this.busy || !this.catalog.clusters.length;
        this.element.querySelector('[data-config-action="refresh"]').disabled = !!this.busy;
        this.element.querySelector('.config-files-transport').textContent = cluster ? __html(transportLabel(cluster.transport)) : '';
        this.element.querySelector('.config-files-scope').textContent = cluster ? cluster.error || __html('Only namespace') + ': ' + cluster.namespace : __html('Assign a cluster to apply files. Editing local files is still available.');
        this.element.querySelector('.config-files-error').textContent = this.error || this.catalog.warning || '';
        this.element.querySelector('.config-files-list').innerHTML = this.catalog.rows.map(row => this.row(row, cluster)).join('');
        const empty = this.element.querySelector('.config-files-empty');
        empty.hidden = !!this.catalog.rows.length;
        empty.textContent = !this.loaded ? __html('Loading configuration files...') : this.error ? '' : __html('No Kubernetes manifests found. Add a YAML or JSON manifest to this app workspace, then Refresh.');
    }

    row(row, cluster) {
        const result = this.results.get(row.file), previous = row.history[this.clusterId];
        const history = previous && (!cluster || !cluster.namespace || !previous.namespace || previous.namespace === cluster.namespace) ? previous : null;
        const busy = this.busy && this.busy.file === row.file;
        const foreign = cluster && cluster.namespace && row.resources.some(resource => resource.metadata.namespace && resource.metadata.namespace !== cluster.namespace);
        const blocked = row.error || !cluster || cluster.error || foreign;
        const summary = row.resources.slice(0, 3).map(resource => resource.kind + ' / ' + resource.metadata.name).join(' · ') + (row.resources.length > 3 ? ' · +' + (row.resources.length - 3) : '');
        const historyText = history ? (history.digest !== row.digest ? __html('Changed since last action') : history.action === 'remove' ? __html('Removal requested') : __html('Last applied')) + ' · ' + new Date(history.at).toLocaleString() : __html('No action recorded here');
        const message = result ? !result.error && result.digest && result.digest !== row.digest ? __html('The file changed since this action. Apply again to submit the latest saved version.') : result.message : row.error || (foreign ? __html('This file targets another namespace.') : '');
        const disabled = this.busy ? 'disabled' : '';
        return `<article class="config-file-row" data-config-file="${attr(row.file)}">
            <div class="config-file-heading"><div class="config-file-description"><div class="config-file-title"><span class="config-file-name">${html(row.file)}</span>${this.statusMarkup(row)}</div><p class="config-file-resources form-text mt-1 mb-0">${html(summary || __html('Needs review in your editor'))}</p></div><div class="config-file-actions">
                <button type="button" class="btn btn-link p-0" data-config-action="edit" data-file="${attr(row.file)}" ${disabled}>${__html('Edit')}</button>
                <button type="button" class="btn btn-outline-primary btn-sm" data-config-action="apply" data-file="${attr(row.file)}" ${disabled || blocked ? 'disabled' : ''}>${__html(busy && this.busy.action === 'apply' ? 'Applying...' : 'Apply')}</button>
            </div></div>
            <div class="config-file-footer"><span class="config-file-history form-text m-0">${html(historyText)}</span><details class="config-file-more"><summary>${__html('More')}</summary><div><button type="button" class="btn btn-link text-danger p-0" data-config-action="remove" data-file="${attr(row.file)}" ${disabled || blocked ? 'disabled' : ''}>${__html('Remove from cluster...')}</button><button type="button" class="btn btn-link text-danger p-0" data-config-action="trash" data-file="${attr(row.file)}" ${disabled || !row.digest ? 'disabled' : ''}>${__html('Move file to Trash...')}</button></div></details></div>
            ${busy ? `<p class="config-file-message form-text mt-2 mb-0" role="status">${__html(this.busy.action === 'edit' ? 'Opening editor...' : this.busy.action === 'apply' ? 'Waiting for confirmation or applying...' : 'Waiting for confirmation or completing action...')}</p>` : ''}
            ${message ? `<p class="config-file-message form-text mt-2 mb-0 ${result && result.error || row.error || foreign ? 'text-danger' : ''}" role="status">${html(message)}</p>` : ''}
            ${result && result.output ? `<details class="config-file-output mt-2"><summary>${__html('Command output')}</summary><pre tabindex="0">${html(result.output)}</pre></details>` : ''}
        </article>`;
    }

    async action(file, action) {
        if (this.busy || !['edit', 'apply', 'remove', 'trash'].includes(action)) return;
        const row = this.catalog.rows.find(item => item.file === file);
        if (!row) return;
        const generation = ++this.generation;
        if (action !== 'edit') stateCache.invalidate(scope => scope.appId === this.app.id && scope.kind !== 'monitor');
        this.statusGeneration++; clearTimeout(this.statusTimer); this.fileStatuses.clear();
        this.busy = { file, action }; this.results.delete(file); this.render();
        try {
            const result = await this.invoke('app-config-files-' + action, { appId: this.app.id, file, digest: row.digest, clusterId: this.clusterId });
            if (generation !== this.generation || !this.element.isConnected) return;
            if (!result.canceled) this.results.set(file, { digest: row.digest, output: result.output, message: result.warning || __html(action === 'edit' ? 'Opened in your default editor.' : action === 'apply' ? 'Configuration applied.' : action === 'remove' ? 'Removal requested. The local file was kept.' : 'Local file moved to Trash.') });
        } catch (error) {
            if (generation !== this.generation || !this.element.isConnected) return;
            this.results.set(file, { error: true, message: error.message });
        } finally {
            if (generation === this.generation && this.element.isConnected) { this.busy = null; await this.refresh(action !== 'edit'); }
        }
    }
}
