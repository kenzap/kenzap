'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { ManagedJobs } = require('./managed-jobs');
const { tunnelAppConfig } = require('./cluster-monitor');
const { findDevspace } = require('./pod-console');

const ACTIVE = new Set(['queued', 'running', 'pausing', 'stopping']);
const STRATEGIES = new Set(['mirrorLocal', 'mirrorRemote', 'preferLocal', 'preferRemote', 'preferNewest', 'keepAll']);

function syncMapping(config) {
    const mappings = [];
    for (const pod of Object.values(config.dev || {})) {
        if (!pod || typeof pod !== 'object') continue;
        for (const sync of pod.sync || []) mappings.push({ pod, sync });
        for (const container of Object.values(pod.containers || {})) {
            for (const sync of container.sync || []) mappings.push({ pod, sync });
        }
    }
    for (const sync of (config.development && config.development.sync) || []) mappings.push({ pod: sync, sync });
    if (mappings.length !== 1) throw new Error('Use a DevSpace configuration with one sync path. Multiple paths require an interactive selector and are not supported by this sync action yet.');
    const { pod, sync } = mappings[0];
    if (typeof sync.path !== 'string' || !sync.path.trim()) throw new Error('Configure an explicit local-to-container sync path first.');
    if (!(typeof pod.imageSelector === 'string' && pod.imageSelector.trim())
        && !(pod.labelSelector && typeof pod.labelSelector === 'object' && Object.keys(pod.labelSelector).length)) {
        throw new Error('Configure an imageSelector or labelSelector so sync cannot target an unrelated pod.');
    }
    if (sync.initialSync && !STRATEGIES.has(sync.initialSync)) throw new Error('Use an explicit supported initialSync strategy for this sync action.');
    return sync;
}

class AppSync extends ManagedJobs {
    constructor({ monitor, launch, kill, onUpdate, devspace = findDevspace, canStart = () => true }) {
        super({ launch, kill, onUpdate, timeoutMs: 0 });
        Object.assign(this, { monitor, devspace, canStart });
    }

    snapshot(job) {
        return { appId: job.appId, jobId: job.jobId, status: job.status, running: ACTIVE.has(job.status),
            desired: job.desired, transport: job.route.transport, namespace: job.route.namespace,
            file: job.file, attempt: job.attempt, error: job.error, log: job.log, revision: job.revision };
    }

    isBusy(appId) { const job = this.jobs.get(appId); return !!(job && (job.desired || ACTIVE.has(job.status))); }

    prepare(appId, file) {
        if (typeof appId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(appId)
            || typeof file !== 'string' || file.includes('\0') || file !== path.basename(file)
            || !file.startsWith('devspace') || !file.endsWith('.yaml')) throw new Error('Invalid sync request.');
        const appDir = path.join(this.monitor.connections.baseDir, appId);
        const appContent = fs.readFileSync(path.join(appDir, '.kenzap'), 'utf8');
        const app = JSON.parse(appContent);
        if (!app.clusters || !app.clusters.length) throw new Error('Assign a cluster before starting sync.');
        const directory = app.path || appDir;
        const content = fs.readFileSync(path.join(directory, file), 'utf8');
        const config = yaml.load(content);
        if (!config || typeof config !== 'object') throw new Error('Invalid DevSpace sync configuration.');
        const mapping = syncMapping(config);
        const route = this.monitor.describe({ clusterId: app.clusters[0], appId, operation: 'pods' });
        if (!this.canStart(appId)) throw new Error('Wait for publishing to finish before starting live sync.');
        return { directory, route, executable: this.devspace(), mapping,
            appDigest: crypto.createHash('sha256').update(appContent).digest('hex'),
            digest: crypto.createHash('sha256').update(content).digest('hex'),
            secrets: Object.values(config.pullSecrets || {}).map(secret => secret && secret.password).filter(value => typeof value === 'string') };
    }

    start(request) {
        if (this.closed) throw new Error('Live sync is shutting down.');
        const { appId, file } = request || {};
        const current = this.jobs.get(appId);
        if (current && ACTIVE.has(current.status)) throw new Error('Sync is already running for this app. Stop it before changing configuration.');
        const prepared = this.prepare(appId, file);
        if (current) current.desired = false;
        for (const [id, old] of this.jobs) if (this.jobs.size >= 64 && !old.desired && !ACTIVE.has(old.status)) this.jobs.delete(id);
        const job = { appId, file, jobId: crypto.randomUUID(), ...prepared, desired: true,
            status: 'queued', attempt: 0, error: '', log: '' };
        this.jobs.set(appId, job);
        this.launchSession(job);
        return this.snapshot(job);
    }

    launchSession(job) {
        job.aborted = false;
        job.abortMessage = '';
        job.abortStatus = '';
        job.status = 'queued';
        job.error = '';
        job.attempt++;
        this.emit(job);
        job.completion = Promise.resolve().then(() => this.sync(job));
    }

    abort(job, message, status) {
        if (!ACTIVE.has(job.status)) return;
        // Stop must revoke an automatic resume even if an SSH pause is already in progress.
        if (job.aborted && status !== 'stopped') return;
        job.aborted = true;
        job.abortMessage = message;
        job.abortStatus = status;
        job.status = status === 'paused' ? 'pausing' : 'stopping';
        if (job.stop) job.stop();
        this.emit(job);
    }

    stop(request) {
        const job = request && this.jobs.get(request.appId);
        if (!job || typeof request.jobId !== 'string' || job.jobId !== request.jobId) throw new Error('This sync session is no longer current.');
        job.desired = false;
        if (ACTIVE.has(job.status)) this.abort(job, 'Live sync stopped.', 'stopped');
        else { job.status = 'stopped'; job.error = ''; this.emit(job); }
        return this.snapshot(job);
    }

    connectionChanged(status) {
        if (this.closed) return;
        for (const job of this.jobs.values()) {
            if (job.route.clusterId !== status.id || job.route.transport !== 'ssh' || !job.desired) continue;
            if (status.state === 'connected') this.resume(job);
            else this.abort(job, 'Sync paused. Waiting for a verified SSH connection.', 'paused');
        }
    }

    resume(job) {
        if (this.closed || !job.desired || job.status !== 'paused' || this.jobs.get(job.appId) !== job) return;
        try {
            const next = this.prepare(job.appId, job.file);
            if (next.directory !== job.directory || next.route.clusterId !== job.route.clusterId
                || next.route.transport !== 'ssh' || next.route.namespace !== job.route.namespace
                || next.digest !== job.digest || next.appDigest !== job.appDigest) {
                throw new Error('The app or sync configuration changed while paused. Start sync again to use the new settings.');
            }
            Object.assign(job, next);
            this.log(job, '\nSSH verified. Resuming live sync.\n');
            this.launchSession(job);
        } catch (error) {
            // A still-unavailable SSH connection is a pause, not permission to use the public API.
            if (error.code === 'SSH_UNAVAILABLE') return;
            job.desired = false;
            job.status = 'failed';
            job.error = this.scrub(job, error.message);
            this.log(job, job.error + '\n');
            this.emit(job);
        }
    }

    check(job) {
        if (this.closed || job.aborted) throw new Error(job.abortMessage || 'Live sync is shutting down.');
        const route = job.route;
        if (route.transport === 'ssh' && (route.connection.stopped || route.connection.state !== 'connected'
            || this.monitor.connections.connections.get(route.clusterId) !== route.connection)) {
            const error = new Error('Sync paused. Waiting for a verified SSH connection.');
            error.code = 'SSH_UNAVAILABLE';
            throw error;
        }
    }

    async sync(job) {
        try {
            this.check(job);
            const args = ['sync', '--config', job.file, '--namespace', job.route.namespace, '--no-warn', '--no-colors', '--pick=false'];
            if (job.mapping.initialSync) args.push('--initial-sync', job.mapping.initialSync);
            const env = { ...process.env, FORCE_COLOR: '0',
                PATH: `${path.dirname(job.executable)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}` };
            delete env.DEVSPACE_FLAGS;
            if (job.route.transport === 'local') args.push('--kube-context', 'minikube');
            else {
                let content = fs.readFileSync(job.route.sourcePath, 'utf8');
                let kubeconfig = job.route.sourcePath;
                if (job.route.transport === 'ssh') {
                    content = tunnelAppConfig(content, path.dirname(job.route.sourcePath), job.route.connection);
                    job.temporary = fs.mkdtempSync(path.join(this.monitor.connections.runtimeDir, 'sync-'));
                    kubeconfig = path.join(job.temporary, 'kubeconfig.yaml');
                    fs.writeFileSync(kubeconfig, content, { mode: 0o600 });
                    env.NO_PROXY = env.no_proxy = `127.0.0.1,localhost,::1,${env.NO_PROXY || ''},${env.no_proxy || ''}`;
                }
                const config = yaml.load(content);
                job.secrets.push(...(config.users || []).flatMap(user => Object.values(user.user || {}).filter(value => typeof value === 'string')));
                env.KUBECONFIG = kubeconfig;
                args.push('--kubeconfig', kubeconfig, '--kube-context', config['current-context']);
            }
            job.status = 'running';
            this.log(job, `\nLive sync via ${job.route.transport} in namespace ${job.route.namespace}.\n`);
            this.emit(job);
            await this.run(job, job.executable, args, env);
            job.status = 'stopped';
            job.desired = false;
            this.log(job, 'Sync process exited.\n');
        } catch (error) {
            job.status = job.abortStatus || (error.code === 'SSH_UNAVAILABLE' ? 'paused' : 'failed');
            if (job.status !== 'paused') job.desired = false;
            job.error = job.status === 'stopped' ? '' : this.scrub(job, job.abortMessage || error.message);
            this.log(job, (job.error || 'Live sync stopped.') + '\n');
        } finally {
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
            job.temporary = null;
            job.secrets = [];
            this.emit(job);
            // A reconnect may finish before the old child closes. Resume only after cleanup.
            if (job.status === 'paused' && job.desired && !this.closed) {
                const connection = this.monitor.connections.connections.get(job.route.clusterId);
                if (connection && connection.state === 'connected' && !connection.stopped) setImmediate(() => this.resume(job));
            }
        }
    }

    close() {
        this.closed = true;
        for (const job of this.jobs.values()) {
            job.desired = false;
            this.abort(job, 'Live sync stopped because the app is closing.', 'stopped');
            if (job.stop) job.stop(true);
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
        }
    }
}

module.exports = { AppSync };
