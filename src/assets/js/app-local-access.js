import { ipcRenderer, clipboard } from 'electron'
import global from './global.js'
import { __html, attr, html, toast } from './helpers.js'
import { initLocalAccess, localSessions, updateLocalAccess } from './local-access-client.js'

const arrow = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" stroke-width="1.2"/></svg>';
const labels = { starting: 'Connecting', saving: 'Saving port', running: 'Active', paused: 'Paused', pausing: 'Pausing', retrying: 'Reconnecting', stopping: 'Stopping', failed: 'Failed', stopped: 'Off' };

export class LocalAccessPanel {
    constructor(app) {
        this.app = app;
        this.catalog = { rows: [] };
        this.pending = new Map();
        this.savingPorts = new Map();
        this.drafts = new Map();
        this.errors = new Map();
        this.markup = new Map();
        this.generation = 0;
    }

    init() {
        this.element = document.querySelector('app-local-access');
        if (!this.element) return;
        global.state.localAccessView = this;
        this.element.innerHTML = `<section class="col-sm-7 pt-3 pb-3 local-access-section" aria-labelledby="local-access-heading">
            <div class="d-flex align-items-center justify-content-between gap-3">
                <h5 class="card-title mb-0" id="local-access-heading">${__html('Local Access')}</h5>
                <span class="local-access-transport form-text m-0"></span>
            </div>
            <p class="form-text mt-2 mb-3">${__html('Connect to this app privately from your computer. Public endpoints stay unchanged.')}</p>
            <div class="local-access-error form-text text-danger" role="alert"></div>
            <div class="local-access-rows"></div>
            <p class="form-text local-access-empty mb-3" role="status">${__html('Loading service ports...')}</p>
            <p class="form-text local-access-note mb-0">${__html('Only this computer. Connections stay on when you leave this page and turn off when the app closes.')}</p>
            <p class="form-text local-access-note mt-1 mb-0">${__html('Use the app\'s own login. Ingress-only sign-in does not protect local access.')}</p>
        </section>`;
        this.element.oninput = event => {
            if (event.target.matches('.local-access-port')) this.drafts.set(event.target.dataset.target, event.target.value);
        };
        this.element.onchange = event => {
            const targetId = event.target.dataset.target;
            if (event.target.matches('.local-access-switch')) this.toggle(targetId, event.target.checked);
            if (event.target.matches('.local-access-port')) this.configure(targetId, event.target.value);
        };
        this.element.onclick = event => {
            const button = event.target.closest('[data-local-action]');
            if (!button) return;
            event.preventDefault();
            this.action(button.dataset.target, button.dataset.localAction);
        };
        initLocalAccess();
        this.refresh();
    }

    async invoke(channel, request) {
        const result = await ipcRenderer.invoke(channel, request);
        if (!result || !result.ok) throw new Error(result && result.error || __html('Unable to update local access.'));
        return result.value;
    }

    async refresh() {
        const generation = ++this.generation;
        try {
            const catalog = await this.invoke('local-access-describe', { appId: this.app.id });
            if (generation !== this.generation || !this.element.isConnected) return;
            this.catalog = catalog;
            this.loadError = '';
            catalog.sessions.forEach(updateLocalAccess);
        } catch (error) {
            if (generation !== this.generation) return;
            this.loadError = error.message;
        }
        this.loaded = true;
        this.render();
    }

    rows() {
        const rows = this.catalog.rows.slice();
        for (const session of localSessions(this.app.id)) {
            if ((session.desired || session.running) && !rows.some(row => row.targetId === session.targetId)) {
                rows.push({ ...session, reason: __html('This Service is no longer in the endpoint file. Turn off its connection.') });
            }
        }
        return rows;
    }

    render() {
        if (!this.element || !this.element.isConnected) return;
        const rows = this.rows();
        this.element.querySelector('.local-access-error').textContent = this.loadError || this.catalog.warning || '';
        this.element.querySelector('.local-access-transport').textContent = ({ ssh: __html('Via SSH'), direct: __html('Direct API'), local: __html('Minikube') })[this.catalog.transport] || '';
        const empty = this.element.querySelector('.local-access-empty');
        empty.classList.toggle('d-none', !!rows.length || !this.loaded);
        empty.textContent = this.loadError ? '' : __html('No service ports yet. Add and save an endpoint to enable local access.');
        const list = this.element.querySelector('.local-access-rows');
        const ids = new Set(rows.map(row => row.targetId));
        list.querySelectorAll('[data-local-row]').forEach(node => {
            if (!ids.has(node.dataset.localRow)) { this.markup.delete(node.dataset.localRow); node.remove(); }
        });
        for (const row of rows) {
            const markup = this.row(row);
            if (this.markup.get(row.targetId) === markup) continue;
            const node = list.querySelector('[data-local-row="' + row.targetId + '"]');
            if (node) node.outerHTML = markup;
            else list.insertAdjacentHTML('beforeend', markup);
            this.markup.set(row.targetId, markup);
        }
    }

    row(row) {
        const session = localSessions(this.app.id).find(item => item.targetId === row.targetId) || {};
        const pending = this.pending.get(row.targetId);
        const busy = !!pending, enabled = pending === 'starting' || (!!session.desired && pending !== 'stopping');
        const locked = busy || enabled || session.running;
        const port = this.drafts.has(row.targetId) ? this.drafts.get(row.targetId) : session.desired || session.running ? session.localPort : row.localPort;
        const error = this.errors.get(row.targetId) || (session.status === 'failed' ? session.error : '') || row.reason || '';
        const status = pending || session.status || 'stopped';
        const label = labels[status] || 'Off';
        const active = status === 'running';
        const address = session.address || `127.0.0.1:${port}`;
        return `<article class="local-access-row" data-local-row="${attr(row.targetId)}">
            <div class="local-access-row-heading">
                <div class="local-access-service"><div class="fw-medium">${html(row.service)}</div><div class="form-text m-0">${html(row.namespace)}${row.portName ? ' / ' + html(row.portName) : ''}</div></div>
                <div class="local-access-controls">
                    <span class="local-access-state" data-state="${attr(status)}" role="status"><span class="local-access-dot"></span>${__html(label)}</span>
                    <div class="form-check form-switch m-0"><input class="form-check-input local-access-switch" type="checkbox" role="switch" id="local-toggle-${attr(row.targetId)}" data-target="${attr(row.targetId)}" aria-label="${attr(__html('Local access to') + ' ' + row.service + ':' + row.servicePort)}" ${enabled ? 'checked' : ''} ${busy || status === 'stopping' || (!enabled && row.reason) ? 'disabled' : ''}></div>
                </div>
            </div>
            <div class="local-access-mapping">
                <div><label class="form-text mt-0 mb-1" for="local-port-${attr(row.targetId)}">${__html('Local port')}</label><div class="input-group input-group-sm local-access-address"><span class="input-group-text">127.0.0.1:</span><input type="number" min="1" max="65535" step="1" inputmode="numeric" class="form-control local-access-port" id="local-port-${attr(row.targetId)}" data-target="${attr(row.targetId)}" value="${attr(port)}" ${locked ? 'disabled' : ''} aria-describedby="local-error-${attr(row.targetId)}"></div></div>
                <span class="local-access-arrow">${arrow}</span>
                <div class="local-access-destination"><span class="form-text d-block mt-0 mb-1">${__html('Service port')}</span><span class="local-access-port-value">${html(row.servicePort)} <span class="text-muted">${html(row.scheme ? row.scheme.toUpperCase() : row.protocol || 'TCP')}</span></span></div>
            </div>
            <div class="local-access-actions">
                ${active ? `${session.url ? `<button type="button" class="btn btn-link p-0" data-local-action="open" data-target="${attr(row.targetId)}">${__html('Open in browser')}</button>` : ''}<button type="button" class="btn btn-link p-0" data-local-action="copy" data-target="${attr(row.targetId)}" title="${attr(address)}">${__html('Copy address')}</button>`
                : !locked ? `<button type="button" class="btn btn-link p-0" data-local-action="free-port" data-target="${attr(row.targetId)}" ${row.reason ? 'disabled' : ''}>${__html('Choose free port')}</button>` : `<span class="form-text m-0">${__html(status === 'paused' || status === 'pausing' ? 'Resumes after SSH reconnects. Switch off to cancel.' : status === 'retrying' ? 'Reconnecting to the app...' : 'You can leave this page.')}</span>`}
            </div>
            <p class="local-access-row-error form-text mb-0 ${error ? '' : 'd-none'}" id="local-error-${attr(row.targetId)}" role="status">${html(error)}</p>
        </article>`;
    }

    configure(targetId, value) {
        if (this.pending.has(targetId)) return this.savingPorts.get(targetId);
        const saving = this.savePort(targetId, value);
        this.savingPorts.set(targetId, saving);
        return saving.finally(() => this.savingPorts.delete(targetId));
    }

    async savePort(targetId, value) {
        if (this.pending.has(targetId)) return;
        this.pending.set(targetId, 'saving'); this.errors.delete(targetId);
        try {
            const result = await this.invoke('local-access-configure', { appId: this.app.id, targetId, localPort: Number(value) });
            const row = this.catalog.rows.find(item => item.targetId === targetId);
            if (row) row.localPort = result.localPort;
            this.catalog.warning = '';
            this.drafts.delete(targetId);
        } catch (error) { this.errors.set(targetId, error.message); }
        finally { this.pending.delete(targetId); this.render(); }
    }

    async toggle(targetId, enabled) {
        if (this.savingPorts.has(targetId)) await this.savingPorts.get(targetId);
        if (this.pending.has(targetId)) return;
        const row = this.rows().find(item => item.targetId === targetId);
        if (!row) return;
        const session = localSessions(this.app.id).find(item => item.targetId === targetId);
        this.pending.set(targetId, enabled ? 'starting' : 'stopping'); this.errors.delete(targetId); this.render();
        try {
            const value = this.drafts.has(targetId) ? this.drafts.get(targetId) : row.localPort;
            const result = await this.invoke(enabled ? 'local-access-start' : 'local-access-stop', {
                appId: this.app.id, targetId, localPort: Number(value), jobId: session && session.jobId
            });
            if (enabled) { row.localPort = Number(value); this.drafts.delete(targetId); this.catalog.warning = ''; }
            updateLocalAccess(result);
        } catch (error) { this.errors.set(targetId, error.message); }
        finally { this.pending.delete(targetId); this.render(); }
    }

    async action(targetId, action) {
        const session = localSessions(this.app.id).find(item => item.targetId === targetId);
        if (action === 'copy' && session && session.status === 'running') {
            clipboard.writeText(session.url || session.address); toast(__html('Copied')); return;
        }
        try {
            if (action === 'open' && session) await this.invoke('local-access-open', { appId: this.app.id, targetId, jobId: session.jobId });
            if (action === 'free-port') {
                const port = await this.invoke('local-access-suggest-port');
                this.drafts.set(targetId, port); await this.configure(targetId, port);
            }
        } catch (error) { this.errors.set(targetId, error.message); this.render(); }
    }
}
