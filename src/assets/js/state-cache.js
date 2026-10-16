const FRESH_MS = 60000;

class StateCache {
    constructor({ now = () => Date.now(), limit = 256 } = {}) {
        this.now = now;
        this.limit = limit;
        this.entries = new Map();
        this.pending = new Map();
    }

    peek(key) {
        const entry = this.entries.get(key);
        if (!entry) return null;
        this.entries.delete(key);
        this.entries.set(key, entry);
        return { ...entry, fresh: this.now() - entry.at < FRESH_MS };
    }

    set(key, value, scope = {}) {
        this.entries.delete(key);
        this.entries.set(key, { value, scope, at: this.now() });
        while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
        return value;
    }

    read(key, loader, { scope = {}, force = false, retain = true } = {}) {
        const entry = this.peek(key);
        if (!force && entry && entry.fresh) return Promise.resolve(entry.value);
        if (this.pending.has(key)) return this.pending.get(key).promise;
        const job = { scope };
        job.promise = Promise.resolve().then(loader).then(value => {
            // Invalidated requests may finish, but must never restore obsolete snapshots.
            if (this.pending.get(key) !== job) {
                const error = new Error('State changed while checking. Refresh to try again.');
                error.code = 'STATE_INVALIDATED';
                throw error;
            }
            if (retain) this.set(key, value, scope);
            return value;
        }).catch(error => {
            if (this.pending.get(key) === job) this.entries.delete(key);
            throw error;
        }).finally(() => {
            if (this.pending.get(key) === job) this.pending.delete(key);
        });
        this.pending.set(key, job);
        return job.promise;
    }

    delete(key) {
        this.entries.delete(key);
        this.pending.delete(key);
    }

    invalidate(matches) {
        for (const [key, entry] of this.entries) if (matches(entry.scope)) this.entries.delete(key);
        for (const [key, job] of this.pending) if (matches(job.scope)) this.pending.delete(key);
    }
}

const stateCache = new StateCache();
module.exports = { StateCache, stateCache, FRESH_MS };
