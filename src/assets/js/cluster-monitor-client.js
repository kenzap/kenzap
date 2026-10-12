import { ipcRenderer } from 'electron';
import { createMonitoringPoll } from './monitoring-poll.js';

const subscribers = new Map();
ipcRenderer.on('cluster-connection-status', (_, status) => {
    const callbacks = subscribers.get(status.id);
    if (callbacks) [...callbacks].forEach(callback => callback(status));
});

export async function readClusterState(clusterId, operation, options = {}) {
    const result = await ipcRenderer.invoke('cluster-monitor-read', { ...options, clusterId, operation });
    if (!result.ok) {
        const error = new Error(result.error);
        error.code = result.code;
        throw error;
    }
    return result.value;
}

export function pollClusterState(element, clusterId, operation, onData, onError, options = {}, interval = 10000) {
    return createMonitoringPoll({
        element, interval, onData, onError,
        request: () => readClusterState(clusterId, operation, options),
        subscribe: callback => {
            if (!subscribers.has(clusterId)) subscribers.set(clusterId, new Set());
            const callbacks = subscribers.get(clusterId);
            callbacks.add(callback);
            return () => {
                callbacks.delete(callback);
                if (!callbacks.size) subscribers.delete(clusterId);
            };
        }
    });
}

export function monitoringLabel(result) {
    return result.transport === 'ssh' ? 'Monitoring via SSH' : result.transport === 'local' ? 'Monitoring local cluster' : 'Monitoring via direct API';
}
