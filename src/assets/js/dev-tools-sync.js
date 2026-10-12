import global from './global.js'
import { __html, attr, html, onClick, getSetting, toast } from './helpers.js'
import { validPath, toggleDepIconState } from './dev-tools.js'
import { ipcRenderer } from 'electron'
import fs from 'fs'

let listening = false;

function renderSyncConsole(id) {
    const owner = global.state.consoleOwner;
    const selected = global.state.page === 'app-settings' && global.state.app ? global.state.app.id : owner && owner.appId;
    const state = global.state.dev && global.state.dev[id];
    if (selected !== id || !state || typeof state.syncLog !== 'string') return;
    if (owner && owner.appId === id && owner.type !== 'sync') return;
    if ((!owner || owner.appId !== id) && !state.syncDesired && !state.syncError) return;
    global.state.console = html(state.syncLog);
    const output = document.querySelector('.console-output');
    if (output) { output.textContent = state.syncLog; output.scrollTop = output.scrollHeight; }
}

export function updateSyncState(update, notify = true) {
    if (!update || !update.appId) return;
    if (!global.state.dev) global.state.dev = {};
    const previous = global.state.dev[update.appId] || {};
    if ((previous.syncRevision || 0) >= update.revision) return;
    // Pod health belongs to the monitor; sync must not replace its running/edge fields.
    global.state.dev[update.appId] = { ...previous,
        syncStatus: update.status, syncDesired: update.desired, syncRunning: update.running,
        syncPreparing: !notify && !!previous.syncPreparing, syncRevision: update.revision,
        syncJobId: update.jobId, syncLog: update.log, syncError: update.error,
        syncTransport: update.transport, syncFile: update.file, status: update.desired ? 'sync' : 'stop'
    };
    toggleDepIconState(update.appId);
    renderSyncConsole(update.appId);
    if (notify && ['failed', 'paused'].includes(update.status) && previous.syncStatus !== update.status) {
        toast(html(update.error || __html('Live sync paused')));
    }
}

export class DevToolsSync {
    init() {
        if (!listening) {
            listening = true;
            ipcRenderer.on('app-sync-update', (event, update) => updateSyncState(update));
        }
        ipcRenderer.invoke('app-sync-list').then(result => {
            if (result && result.ok) result.value.forEach(update => {
                updateSyncState(update, false);
                renderSyncConsole(update.appId);
            });
        }).catch(() => {});
        this.listeners();
    }

    listeners() {
        onClick('.start-dev-app', e => { e.preventDefault(); this.sync(e.currentTarget.dataset.id, 'start'); });
        onClick('.stop-dev-app', e => { e.preventDefault(); this.syncStop(e.currentTarget.dataset.id); });
    }

    sync(id, command) {
        if (command === 'stop') return this.syncStop(id);
        const state = global.state.dev && global.state.dev[id] || {};
        if (state.syncRunning || state.syncPreparing) return;
        const publishing = global.state.pub && global.state.pub[id];
        if (publishing && (publishing.running || publishing.preparing)) {
            toast(__html('Wait for publishing to finish before starting live sync.')); return;
        }
        const cache = getSetting(id);
        if (!validPath(cache)) return;
        try {
            const files = fs.readdirSync(cache.path).filter(file => file.startsWith('devspace') && file.endsWith('.yaml')).sort();
            const selector = '.devToolsSyncCont[data-id="' + id + '"]';
            const menu = document.querySelector(selector + ' ul');
            if (!menu) return;
            if (!files.length) { toast(__html('No DevSpace configurations found in this workspace.')); return; }
            menu.innerHTML = files.map(file => '<li><a class="dropdown-item po dev-tools-sync-start" data-file="' + attr(file) + '" href="#">' + html(file.replace('devspace-', '').replace('.yaml', '')) + '</a></li>').join('');
            const closeMenu = () => {
                const dropdown = document.querySelector(selector + ' .dropdown-menu.show');
                if (dropdown) dropdown.classList.remove('show');
            };
            if (files.length === 1) { this.syncStart(id, files[0]); closeMenu(); }
            else onClick(selector + ' .dev-tools-sync-start', e => {
                e.preventDefault(); this.syncStart(id, e.currentTarget.dataset.file); closeMenu();
            });
        } catch (error) { toast(html(error.message)); }
    }

    async syncStart(id, file) {
        if (!global.state.dev) global.state.dev = {};
        const state = global.state.dev[id] || (global.state.dev[id] = {});
        if (state.syncRunning || state.syncPreparing) return;
        const publishing = global.state.pub && global.state.pub[id];
        if (publishing && (publishing.running || publishing.preparing)) {
            toast(__html('Wait for publishing to finish before starting live sync.')); return;
        }
        state.syncPreparing = true;
        state.syncError = '';
        global.state.consoleOwner = { type: 'sync', appId: id };
        global.state.console = '';
        const output = document.querySelector('.console-output');
        if (output) output.textContent = '';
        toggleDepIconState(id);
        try {
            const result = await ipcRenderer.invoke('app-sync-start', { appId: id, file });
            if (!result || !result.ok) throw new Error(result && result.error || __html('Unable to start live sync.'));
            updateSyncState(result.value);
        } catch (error) {
            const current = global.state.dev[id];
            current.syncPreparing = false;
            current.syncError = error.message;
            // A rejected restart must not hide an existing paused session's Stop control.
            if (!current.syncDesired) { current.syncStatus = 'failed'; current.syncRunning = false; current.status = 'stop'; }
            toggleDepIconState(id);
            toast(html(error.message));
        } finally {
            global.state.dev[id].syncPreparing = false;
            toggleDepIconState(id);
        }
    }

    async syncStop(id) {
        const state = global.state.dev && global.state.dev[id];
        if (!state || !state.syncJobId || (!state.syncDesired && !state.syncRunning)) return;
        try {
            const result = await ipcRenderer.invoke('app-sync-stop', { appId: id, jobId: state.syncJobId });
            if (!result || !result.ok) throw new Error(result && result.error || __html('Unable to stop live sync.'));
            updateSyncState(result.value);
        } catch (error) { toast(html(error.message)); }
    }
}
