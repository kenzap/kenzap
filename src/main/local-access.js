'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { ManagedJobs } = require('./managed-jobs');
const { tunnelAppConfig } = require('./cluster-monitor');

const ACTIVE = new Set(['starting', 'running', 'pausing', 'stopping']);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
const validName = value => typeof value === 'string' && value.length <= 63 && /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value);
const validPort = value => Number.isInteger(value) && value > 0 && value <= 65535;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function webScheme(port) {
    const hint = String(port.appProtocol || port.name || '').toLowerCase();
    if (/^https(?:$|-)/.test(hint) || [443, 8443].includes(port.port)) return 'https';
    if (/^(?:http(?:$|-)|kubernetes.io\/h2c$)/.test(hint) || [80, 8080, 8000, 3000].includes(port.port)) return 'http';
    return '';
}

function availablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}

class LocalAccess extends ManagedJobs {
    constructor({ monitor, launch, kill, onUpdate, retryDelays = [1000, 2000, 4000, 8000, 16000], startupMs = 45000 }) {
        super({ launch, kill, onUpdate });
        Object.assign(this, { monitor, retryDelays, startupMs });
        this.preferencesPath = path.join(monitor.connections.runtimeDir, 'local-access.json');
        this.preferences = {};
        try {
            if (fs.existsSync(this.preferencesPath)) {
                const stored = JSON.parse(fs.readFileSync(this.preferencesPath, 'utf8'));
                if (!stored || Array.isArray(stored) || typeof stored !== 'object'
                    || Object.entries(stored).some(([key, port]) => !/^[a-f0-9]{64}$/.test(key) || !validPort(port))) throw new Error('Invalid local ports.');
                this.preferences = stored;
            }
        } catch (_) {
            // Optional port preferences must not prevent the desktop app from opening.
            this.preferenceWarning = 'Saved local ports could not be loaded. Choose your local ports again.';
        }
    }

    catalog(appId) {
        if (!validId(appId)) throw new Error('Invalid app.');
        const appDir = path.join(this.monitor.connections.baseDir, appId);
        const app = JSON.parse(fs.readFileSync(path.join(appDir, '.kenzap'), 'utf8'));
        const directory = app.path || appDir;
        const clusterId = (app.clusters || [])[0];
        const transport = clusterId === 'local' ? 'local' : clusterId
            ? this.monitor.connections.usesSSHForMonitoring(clusterId) ? 'ssh' : 'direct' : '';
        const file = path.join(directory, 'endpoints.yaml');
        const resources = fs.existsSync(file) ? yaml.loadAll(fs.readFileSync(file, 'utf8')).filter(Boolean) : [];
        const rows = [];
        for (const service of resources.flatMap(item => item.kind === 'List' ? item.items || [] : [item])) {
            if (!service || service.kind !== 'Service') continue;
            const name = (service.metadata || {}).name, namespace = (service.metadata || {}).namespace || 'default';
            if (!validName(name) || !validName(namespace)) throw new Error('Invalid Service name or namespace in endpoints.yaml.');
            const spec = service.spec || {};
            for (const port of spec.ports || []) {
                if (!validPort(port.port)) throw new Error(`Invalid port on Service ${name}.`);
                const protocol = port.protocol || 'TCP';
                const targetId = digest([appId, namespace, name, port.port, protocol]);
                if (rows.some(row => row.targetId === targetId)) throw new Error('Duplicate Service ports in endpoints.yaml.');
                const reason = protocol !== 'TCP' ? 'Only TCP services support local access.'
                    : !spec.selector || !Object.keys(spec.selector).length ? 'This Service has no pod selector.' : '';
                rows.push({ targetId, service: name, namespace, servicePort: port.port, portName: port.name || '', protocol,
                    scheme: webScheme(port), reason, fingerprint: digest([namespace, name, spec.selector, port, spec.type]),
                    localPort: this.preferences[targetId] || (port.port === 80 ? 8080 : port.port === 443 ? 8443 : port.port) });
            }
        }
        return { appId, directory, clusterId, transport, rows };
    }

    describe(appId) {
        const { directory, ...catalog } = this.catalog(appId);
        return { ...catalog, warning: this.preferenceWarning || '', rows: catalog.rows.map(({ fingerprint, ...row }) => row),
            sessions: this.list().filter(job => job.appId === appId) };
    }

    reconcile(appId) {
        const catalog = this.catalog(appId);
        for (const job of this.jobs.values()) {
            if (job.appId !== appId || !job.desired) continue;
            const target = catalog.rows.find(row => row.targetId === job.targetId);
            if (target && target.fingerprint === job.target.fingerprint && catalog.directory === job.directory
                && catalog.clusterId === job.route.clusterId) continue;
            clearTimeout(job.retryTimer); job.desired = false;
            const error = 'The Service changed or was removed. Turn local access on again to use the current endpoint.';
            if (ACTIVE.has(job.status)) this.abort(job, error, 'failed');
            else { job.status = 'failed'; job.error = error; this.emit(job); }
        }
    }

    target(request) {
        const catalog = this.catalog(request && request.appId);
        const target = catalog.rows.find(row => row.targetId === request.targetId);
        if (!target) throw new Error('This Service port is no longer in endpoints.yaml. Save the endpoint and refresh Local Access.');
        return { ...catalog, target };
    }

    configure(request) {
        const { target } = this.target(request);
        const job = this.jobs.get(target.targetId);
        if (job && (job.desired || ACTIVE.has(job.status))) throw new Error('Turn off local access before changing its port.');
        const port = request.localPort;
        if (!validPort(port)) throw new Error('Choose a local port between 1 and 65535.');
        this.preferences[target.targetId] = port;
        fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences), { mode: 0o600 });
        this.preferenceWarning = '';
        return { targetId: target.targetId, localPort: port };
    }

    prepare(request) {
        const { target, directory, clusterId } = this.target(request);
        if (target.reason) throw new Error(target.reason);
        if (!clusterId) throw new Error('Assign a cluster before enabling local access.');
        const route = this.monitor.describe({ clusterId, appId: request.appId, operation: 'pods' });
        if (target.namespace !== route.namespace) throw new Error('This Service is outside the app namespace. Select a matching namespace in the app kubeconfig.');
        return { target, directory, route, executable: this.monitor.kubectl() };
    }

    start(request) {
        if (this.closed) throw new Error('Local access is shutting down.');
        const prepared = this.prepare(request);
        const current = this.jobs.get(prepared.target.targetId);
        if (current && (current.desired || ACTIVE.has(current.status))) throw new Error('Local access is already enabled for this port.');
        if ([...this.jobs.values()].filter(job => job.desired || ACTIVE.has(job.status)).length >= 32) throw new Error('Turn off an existing forward before opening another.');
        const { localPort } = this.configure(request);
        for (const [id, old] of this.jobs) if (this.jobs.size >= 128 && !old.desired && !ACTIVE.has(old.status)) this.jobs.delete(id);
        const job = { ...prepared, appId: request.appId, targetId: prepared.target.targetId,
            jobId: crypto.randomUUID(), localPort, desired: true, failures: 0, error: '', log: '', secrets: [] };
        this.jobs.set(job.targetId, job);
        this.launchSession(job);
        return this.snapshot(job);
    }

    snapshot(job) {
        return { appId: job.appId, targetId: job.targetId, jobId: job.jobId, service: job.target.service,
            namespace: job.route.namespace, servicePort: job.target.servicePort, localPort: job.localPort,
            transport: job.route.transport, status: job.status, desired: job.desired, running: ACTIVE.has(job.status),
            address: `127.0.0.1:${job.localPort}`, url: job.status === 'running' && job.target.scheme
                ? `${job.target.scheme}://127.0.0.1:${job.localPort}/` : '', error: job.error, revision: job.revision };
    }

    launchSession(job) {
        clearTimeout(job.retryTimer);
        job.retryTimer = null;
        job.aborted = false; job.abortStatus = ''; job.abortMessage = ''; job.readyAt = 0;
        job.status = 'starting'; job.error = '';
        this.emit(job);
        job.completion = Promise.resolve().then(() => this.forward(job));
    }

    check(job) {
        if (this.closed || job.aborted) throw new Error(job.abortMessage || 'Local access stopped.');
        const route = job.route;
        if (route.transport === 'ssh' && (route.connection.stopped || route.connection.state !== 'connected'
            || this.monitor.connections.connections.get(route.clusterId) !== route.connection)) {
            const error = new Error('Waiting for a verified SSH connection.');
            error.code = 'SSH_UNAVAILABLE'; throw error;
        }
    }

    abort(job, message, status) {
        if (!ACTIVE.has(job.status) || (job.aborted && status !== 'stopped'
            && !(status === 'failed' && job.abortStatus === 'paused'))) return;
        clearTimeout(job.startupTimer);
        job.aborted = true; job.abortMessage = message; job.abortStatus = status;
        job.status = status === 'paused' ? 'pausing' : 'stopping';
        if (job.stop) job.stop();
        this.emit(job);
    }

    stop(request) {
        const job = request && this.jobs.get(request.targetId);
        if (!job || job.appId !== request.appId || job.jobId !== request.jobId) throw new Error('This forwarding session is no longer current.');
        job.desired = false; clearTimeout(job.retryTimer); job.retryTimer = null;
        if (ACTIVE.has(job.status)) this.abort(job, 'Local access stopped.', 'stopped');
        else { job.status = 'stopped'; job.error = ''; this.emit(job); }
        return this.snapshot(job);
    }

    resume(job) {
        if (this.closed || !job.desired || !['paused', 'retrying'].includes(job.status) || this.jobs.get(job.targetId) !== job) return;
        try {
            const next = this.prepare(job);
            if (next.directory !== job.directory || next.route.clusterId !== job.route.clusterId
                || next.route.namespace !== job.route.namespace || next.route.transport !== job.route.transport
                || next.target.fingerprint !== job.target.fingerprint) throw new Error('The app or Service changed. Turn local access on again to use the new settings.');
            Object.assign(job, next);
            this.launchSession(job);
        } catch (error) {
            if (error.code === 'SSH_UNAVAILABLE') { job.status = 'paused'; job.error = 'Waiting for a verified SSH connection.'; }
            else { job.status = 'failed'; job.desired = false; job.error = this.scrub(job, error.message); }
            this.emit(job);
        }
    }

    connectionChanged(status) {
        if (this.closed) return;
        for (const job of this.jobs.values()) {
            if (job.route.transport !== 'ssh' || job.route.clusterId !== status.id || !job.desired) continue;
            if (status.state === 'connected') { if (job.status === 'paused') this.resume(job); }
            else {
                clearTimeout(job.retryTimer); job.retryTimer = null;
                if (ACTIVE.has(job.status)) this.abort(job, 'Waiting for a verified SSH connection.', 'paused');
                else { job.status = 'paused'; job.error = 'Waiting for a verified SSH connection.'; this.emit(job); }
            }
        }
    }

    async forward(job) {
        try {
            this.check(job);
            const args = ['port-forward', `service/${job.target.service}`, `${job.localPort}:${job.target.servicePort}`,
                '--address', '127.0.0.1', '--namespace', job.route.namespace, '--pod-running-timeout=20s'];
            const env = { ...process.env, LC_ALL: 'C', LANG: 'C' };
            if (job.route.transport === 'local') args.push('--context', 'minikube');
            else {
                let content = fs.readFileSync(job.route.sourcePath, 'utf8'), kubeconfig = job.route.sourcePath;
                if (job.route.transport === 'ssh') {
                    content = tunnelAppConfig(content, path.dirname(kubeconfig), job.route.connection);
                    job.temporary = fs.mkdtempSync(path.join(this.monitor.connections.runtimeDir, 'forward-'));
                    kubeconfig = path.join(job.temporary, 'kubeconfig.yaml');
                    fs.writeFileSync(kubeconfig, content, { mode: 0o600 });
                    env.NO_PROXY = env.no_proxy = `127.0.0.1,localhost,::1,${env.NO_PROXY || ''},${env.no_proxy || ''}`;
                }
                const config = yaml.load(content);
                job.secrets = (config.users || []).flatMap(user => Object.values(user.user || {}).filter(value => typeof value === 'string'));
                env.KUBECONFIG = kubeconfig;
                args.push('--kubeconfig', kubeconfig, '--context', config['current-context']);
            }
            job.onLine = line => {
                if (job.aborted || job.status !== 'starting' || !line.startsWith(`Forwarding from 127.0.0.1:${job.localPort} -> `)) return;
                clearTimeout(job.startupTimer);
                job.readyAt = Date.now(); job.status = 'running'; job.error = ''; this.emit(job);
            };
            job.startupTimer = setTimeout(() => this.abort(job, 'Local access did not start in time. Check the Service and pod status.', 'failed'), this.startupMs);
            job.startupTimer.unref();
            await this.run(job, job.executable, args, env);
            throw new Error('The selected pod disconnected.');
        } catch (error) {
            job.status = job.abortStatus || (error.code === 'SSH_UNAVAILABLE' ? 'paused' : 'failed');
            job.error = job.status === 'stopped' ? '' : this.scrub(job, job.abortMessage || error.message);
            if (job.status === 'failed' && job.desired && !job.aborted) {
                const fatal = /address already in use|unable to listen|permission denied|forbidden|unauthorized|cannot find executable|unable to start|certificate|x509/i.test(job.error);
                if (/address already in use|unable to listen/i.test(job.error)) job.error = `Port ${job.localPort} is unavailable. Turn off local access and choose another port.`;
                if (job.readyAt && Date.now() - job.readyAt > 60000) job.failures = 0;
                if (!fatal && job.failures < this.retryDelays.length) job.status = 'retrying';
            }
            if (!['paused', 'retrying'].includes(job.status)) job.desired = false;
        } finally {
            clearTimeout(job.startupTimer); job.onLine = null;
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
            job.temporary = null;
            this.emit(job);
            if (job.status === 'retrying' && job.desired && !this.closed) {
                const delay = this.retryDelays[job.failures++];
                job.retryTimer = setTimeout(() => { job.retryTimer = null; this.resume(job); }, delay);
                job.retryTimer.unref();
            } else if (job.status === 'paused' && job.desired && !this.closed) {
                const current = this.monitor.connections.connections.get(job.route.clusterId);
                if (current && current.state === 'connected' && !current.stopped) setImmediate(() => this.resume(job));
            }
        }
    }

    open(request) {
        const job = request && this.jobs.get(request.targetId);
        if (!job || job.appId !== request.appId || job.jobId !== request.jobId || job.status !== 'running'
            || !job.target.scheme || !job.desired) throw new Error('Start a web forwarding session before opening it.');
        this.check(job);
        return this.snapshot(job).url;
    }

    close() {
        this.closed = true;
        for (const job of this.jobs.values()) {
            job.desired = false; clearTimeout(job.retryTimer); clearTimeout(job.startupTimer);
            this.abort(job, 'Local access stopped because the app is closing.', 'stopped');
            if (job.stop) job.stop(true);
            if (job.temporary) fs.rmSync(job.temporary, { recursive: true, force: true });
        }
    }
}

module.exports = { LocalAccess, availablePort };
