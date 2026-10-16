import { ipcRenderer } from 'electron';
import { createMonitoringPoll } from './monitoring-poll.js';
import { stateCache, FRESH_MS } from './state-cache.js';
import { monitoringIdentity } from './monitoring-identity.js';
import { getDefaultAppPath } from './helpers.js';

const subscribers = new Map();
ipcRenderer.on('cluster-connection-status', (_, status) => {
    stateCache.invalidate(scope => scope.clusterId === status.id || (scope.clusterIds || []).includes(status.id));
    const callbacks = subscribers.get(status.id);
    if (callbacks) [...callbacks].forEach(callback => callback(status));
});

ipcRenderer.on('app-state-invalidated', (_, update) => {
    stateCache.invalidate(scope => scope.appId === update.appId);
    const callbacks = subscribers.get(update.clusterId);
    if (callbacks) [...callbacks].forEach(callback => callback({ state: 'connected', appId: update.appId }));
});

function cacheKey(clusterId, operation, options) {
    if (operation === 'logs' || operation === 'events') return null;
    const identity = monitoringIdentity(getDefaultAppPath(), options.appId, clusterId);
    return identity ? JSON.stringify(['monitor', identity, operation, options]) : null;
}

export async function readClusterState(clusterId, operation, options = {}, force = false) {
    const key = cacheKey(clusterId, operation, options);
    const load = async () => {
        const result = await ipcRenderer.invoke('cluster-monitor-read', { ...options, clusterId, operation, force });
        if (!result.ok) {
            const error = new Error(result.error);
            error.code = result.code;
            throw error;
        }
        if (key && key !== cacheKey(clusterId, operation, options)) throw new Error('Monitoring settings changed. Refreshing the selected target.');
        return result.value;
    };
    return key ? stateCache.read(key, load, { force, scope: { clusterId, appId: options.appId, kind: 'monitor' } }) : load();
}

export function pollClusterState(element, clusterId, operation, onData, onError, options = {}, interval = 10000) {
    const key = cacheKey(clusterId, operation, options), entry = key && stateCache.peek(key);
    return createMonitoringPoll({
        element, interval, onData, onError,
        snapshot: entry ? { ...entry.value, cached: true, stale: !entry.fresh } : null,
        initialDelay: entry && entry.fresh ? Math.max(1, FRESH_MS - (Date.now() - entry.at)) : 0,
        request: () => readClusterState(clusterId, operation, options, true),
        subscribe: callback => {
            if (!subscribers.has(clusterId)) subscribers.set(clusterId, new Set());
            const callbacks = subscribers.get(clusterId);
            const listener = status => { if (!status.appId || status.appId === options.appId) callback(status); };
            callbacks.add(listener);
            return () => {
                callbacks.delete(listener);
                if (!callbacks.size) subscribers.delete(clusterId);
            };
        }
    });
}

export function monitoringLabel(result) {
    const label = result.transport === 'ssh' ? 'Monitoring via SSH' : result.transport === 'local' ? 'Monitoring local cluster' : 'Monitoring via direct API';
    return label + (result.stale ? ' - Last known status, refreshing...' : result.cached ? ' - Checked ' + new Date(result.observedAt).toLocaleTimeString() : '');
}
