import global from './global.js'
import { __html, attr, html, onClick, getSetting, toast } from './helpers.js'
import { validPath, toggleDepIconState } from './dev-tools.js'
import { ipcRenderer } from 'electron'
import fs from 'fs'

let listening = false;

function renderPublishConsole(id) {
    const owner = global.state.consoleOwner;
    const selected = global.state.page === 'app-settings' && global.state.app ? global.state.app.id : owner ? owner.appId : global.state.publishConsoleApp;
    const state = global.state.pub && global.state.pub[id];
    if (selected !== id || !state || typeof state.log !== 'string') return;
    if (owner && owner.appId === id && owner.type !== 'publish') return;
    const sync = global.state.dev && global.state.dev[id];
    if ((!owner || owner.appId !== id) && sync && (sync.syncDesired || sync.syncError)) return;
    global.state.console = html(state.log);
    const output = document.querySelector('.console-output');
    if (output) { output.textContent = state.log; output.scrollTop = output.scrollHeight; }
}

export function updatePublishState(update, notify = true) {
    if (!update || !update.appId) return;
    if (!global.state.pub) global.state.pub = {};
    const previous = global.state.pub[update.appId] || {};
    if ((previous.revision || 0) >= update.revision) return;
    global.state.pub[update.appId] = {
        ...previous, ...update, preparing: !notify && !!previous.preparing, publishStatus: update.status,
        proc: update.running ? { managed: true, jobId: update.jobId } : null,
        edgePending: update.running || update.status === 'succeeded'
    };
    global.state.loading = Object.values(global.state.pub).some(item => item.running || item.preparing);
    if (update.status === 'succeeded') {
        for (const app of [global.state.app, ...(global.state.apps || [])].filter(Boolean)) {
            if (app.id === update.appId) { app.status = 'published'; app.new = false; }
        }
        const tools = document.querySelector('.app-development-tools[data-id="' + update.appId + '"]');
        if (tools) tools.classList.remove('d-none');
    }
    toggleDepIconState(update.appId);
    const edge = document.querySelector('.edge-status[data-id="' + update.appId + '"]');
    if (edge && !update.running && update.status !== 'succeeded') edge.classList.remove('pending');
    renderPublishConsole(update.appId);
    if (notify && !update.running && previous.publishStatus !== update.status) {
        toast(html(update.status === 'succeeded' ? __html('Publishing completed') : update.error || __html('Publishing failed')));
    }
}

export class DevToolsPublish {
    init() {
        if (!listening) {
            listening = true;
            ipcRenderer.on('app-publish-update', (event, update) => updatePublishState(update));
        }
        ipcRenderer.invoke('app-publish-list').then(result => {
            if (result && result.ok) result.value.forEach(update => {
                updatePublishState(update, false);
                renderPublishConsole(update.appId);
            });
        }).catch(() => {});
        this.listeners();
    }

    listeners() {
        onClick('.app-deploy', async e => {
            e.preventDefault();
            const id = e.currentTarget.dataset.id;
            if (!global.state.pub) global.state.pub = {};
            const state = global.state.pub[id] || (global.state.pub[id] = {});
            if (state.preparing) return;
            if (state.running) {
                if (confirm(__html('Cancel publishing?'))) await this.stop_publish_process(id);
                return;
            }
            const sync = global.state.dev && global.state.dev[id];
            if (sync && (sync.syncDesired || sync.syncRunning || sync.syncPreparing)) {
                toast(__html('Stop live sync before publishing this app.')); return;
            }
            if (document.querySelector('.settings') && this.beforePublish) {
                state.preparing = true;
                toggleDepIconState(id);
                try { if (!await this.beforePublish()) return; }
                catch (error) { toast(html(error.message)); return; }
                finally { global.state.pub[id].preparing = false; toggleDepIconState(id); }
            }
            this.deploy(id);
        });
    }

    deploy(id) {
        const cache = getSetting(id);
        if (!validPath(cache)) return;
        const files = fs.readdirSync(cache.path).filter(file => file.startsWith('devspace') && file.endsWith('.yaml')).sort();
        const selector = '.devToolsPublishCont[data-id="' + id + '"]';
        const menu = document.querySelector(selector + ' ul');
        if (!menu) return;
        if (!files.length) { toast(__html('No DevSpace configurations found in this workspace.')); return; }
        menu.innerHTML = files.map(file => `<li><a class="dropdown-item po dev-tools-publish" data-file="${attr(file)}" href="#">${html(file.replace('devspace-', '').replace('.yaml', ''))}</a></li>`).join('')
            + `<li><hr class="dropdown-divider"></li><li><a class="dropdown-item po dev-tools-publish" data-file="all" href="#">${__html('publish all')}</a></li>`;
        const closeMenu = () => {
            const dropdown = document.querySelector(selector + ' .dropdown-menu.show');
            if (dropdown) dropdown.classList.remove('show');
        };
        if (files.length === 1) {
            this.start(id, files[0]);
            closeMenu();
        } else {
            onClick(selector + ' .dev-tools-publish', e => {
                e.preventDefault();
                this.start(id, e.currentTarget.dataset.file);
                closeMenu();
            });
        }
    }

    async start(id, file) {
        const state = global.state.pub[id] || (global.state.pub[id] = {});
        if (state.running || state.preparing) return;
        const sync = global.state.dev && global.state.dev[id];
        if (sync && (sync.syncDesired || sync.syncRunning || sync.syncPreparing)) {
            toast(__html('Stop live sync before publishing this app.')); return;
        }
        state.preparing = true;
        state.publishStatus = 'queued';
        state.error = '';
        global.state.publishConsoleApp = id;
        global.state.consoleOwner = { type: 'publish', appId: id };
        global.state.console = '';
        const output = document.querySelector('.console-output');
        if (output) output.textContent = '';
        toggleDepIconState(id);
        toast(__html('Publishing'));
        try {
            const result = await ipcRenderer.invoke('app-publish-start', { appId: id, file });
            if (!result || !result.ok) throw new Error(result && result.error || __html('Unable to start publishing.'));
            updatePublishState(result.value);
        } catch (error) {
            const current = global.state.pub[id];
            current.preparing = false;
            current.running = false;
            current.proc = null;
            current.publishStatus = 'failed';
            current.error = error.message;
            current.edgePending = false;
            global.state.loading = Object.values(global.state.pub).some(item => item.running || item.preparing);
            toggleDepIconState(id);
            toast(html(error.message));
        } finally {
            global.state.pub[id].preparing = false;
            toggleDepIconState(id);
        }
    }

    async stop_publish_process(id) {
        const state = global.state.pub[id];
        if (!state || !state.running) return;
        try {
            const result = await ipcRenderer.invoke('app-publish-cancel', { appId: id, jobId: state.jobId });
            if (!result || !result.ok) throw new Error(result && result.error || __html('Unable to cancel publishing.'));
            updatePublishState(result.value);
        } catch (error) { toast(html(error.message)); }
    }
}
