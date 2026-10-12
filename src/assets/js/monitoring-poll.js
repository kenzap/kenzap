function createMonitoringPoll({ element, request, onData, onError, subscribe, interval = 10000 }) {
    let stopped = false;
    let busy = false;
    let refreshPending = false;
    let generation = 0;
    let timer;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        unsubscribe();
        observer.disconnect();
    };
    const refresh = async () => {
        clearTimeout(timer);
        if (stopped) return;
        if (!element.isConnected) { stop(); return; }
        if (busy) { refreshPending = true; return; }
        busy = true;
        const current = generation;
        try {
            const result = await request();
            if (!stopped && element.isConnected && current === generation) onData(result);
        } catch (error) {
            if (!stopped && element.isConnected && current === generation) onError(error);
        } finally {
            busy = false;
            if (!stopped && element.isConnected) {
                const delay = refreshPending ? 0 : interval;
                refreshPending = false;
                timer = setTimeout(refresh, delay);
            } else stop();
        }
    };
    const unsubscribe = subscribe(status => {
        generation += 1;
        if (status.state !== 'connected' && element.isConnected) {
            onError(new Error('Monitoring paused. Waiting for a verified SSH connection.'));
        }
        refresh();
    });
    const observer = new MutationObserver(() => { if (!element.isConnected) stop(); });
    observer.observe(document.body, { childList: true });
    refresh();
    return { stop, refresh };
}

module.exports = { createMonitoringPoll };
