import { ipcRenderer } from 'electron'
import global from './global.js'
import { __html } from './helpers.js'

let listening = false;

export function localSessions(appId) {
    return Object.values(global.state.localAccess || {}).filter(session => session.appId === appId);
}

export function renderLocalAccessIndicators() {
    document.querySelectorAll('.local-access-indicator[data-app-id]').forEach(element => {
        const sessions = localSessions(element.dataset.appId).filter(session => session.desired || session.running);
        const active = sessions.filter(session => session.status === 'running').length;
        element.classList.toggle('d-none', !sessions.length);
        element.textContent = active ? __html('Local access active') + (active > 1 ? ` (${active})` : '')
            : sessions.some(session => session.status === 'paused' || session.status === 'pausing')
                ? __html('Local access paused') : __html('Local access connecting');
    });
}

export function updateLocalAccess(session) {
    if (!session || !session.targetId) return;
    if (!global.state.localAccess) global.state.localAccess = {};
    const previous = global.state.localAccess[session.targetId];
    if (previous && previous.revision >= session.revision) return;
    global.state.localAccess[session.targetId] = session;
    renderLocalAccessIndicators();
    const view = global.state.localAccessView;
    if (view && view.app.id === session.appId) view.render();
}

export function initLocalAccess() {
    if (!listening) {
        listening = true;
        ipcRenderer.on('local-access-update', (event, session) => updateLocalAccess(session));
        ipcRenderer.on('local-access-catalog-changed', (event, update) => {
            const view = global.state.localAccessView;
            if (view && view.app.id === update.appId && view.element.isConnected) view.refresh();
        });
    }
    return ipcRenderer.invoke('local-access-list').then(result => {
        if (result && result.ok) result.value.forEach(updateLocalAccess);
        renderLocalAccessIndicators();
    }).catch(() => {});
}
