'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const LOG_LIMIT = 64 * 1024;

function killGroup(child, signal) {
    if (process.platform !== 'win32' && child.pid) {
        try { process.kill(-child.pid, signal); return; } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    child.kill(signal);
}

class ManagedJobs {
    constructor({ launch = spawn, kill = killGroup, onUpdate = () => {}, timeoutMs = 0,
        timeoutMessage = 'Operation timed out. Check the connection and try again.' } = {}) {
        Object.assign(this, { launch, kill, onUpdate, timeoutMs, timeoutMessage });
        this.jobs = new Map();
        this.revision = 0;
        this.closed = false;
    }

    list() { return [...this.jobs.values()].map(job => this.snapshot(job)); }

    emit(job) {
        clearTimeout(job.flushTimer);
        job.flushTimer = null;
        job.revision = ++this.revision;
        this.onUpdate(this.snapshot(job));
    }

    scrub(job, text) {
        let output = String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
        for (const secret of job.secrets) if (secret) output = output.split(secret).join('[redacted]');
        return output;
    }

    log(job, text) {
        job.log = (job.log + this.scrub(job, text)).slice(-LOG_LIMIT);
        if (!job.flushTimer) {
            job.flushTimer = setTimeout(() => this.emit(job), 100);
            job.flushTimer.unref();
        }
    }

    run(job, executable, args, env, input = '', timeout = this.timeoutMs) {
        this.check(job);
        return new Promise((resolve, reject) => {
            let settled = false, timer, forceTimer, child, launchError;
            let tail = '';
            const sinks = [];
            const finish = (error) => {
                if (settled) return;
                for (const sink of sinks) sink.end();
                settled = true;
                clearTimeout(timer);
                clearTimeout(forceTimer);
                job.stop = null;
                if (job.aborted) reject(new Error(job.abortMessage));
                else if (error) reject(error);
                else resolve();
            };
            const attach = stream => {
                const decoder = new StringDecoder('utf8');
                let pending = '', dropping = false;
                const line = text => {
                    const safe = this.scrub(job, text);
                    tail = (tail + safe + '\n').slice(-2048);
                    this.log(job, safe + '\n');
                    if (job.onLine) job.onLine(safe);
                };
                const write = text => {
                    const parts = (pending + text).split(/[\r\n]/);
                    pending = parts.pop();
                    for (const part of parts) {
                        if (!dropping && part) line(part.length > LOG_LIMIT ? '[Large output line omitted]' : part);
                        dropping = false;
                    }
                    if (pending.length > LOG_LIMIT) { pending = ''; dropping = true; }
                };
                stream.on('data', data => { if (!settled) write(decoder.write(Buffer.isBuffer(data) ? data : Buffer.from(data))); });
                sinks.push({ end: () => { write(decoder.end()); if (pending && !dropping) line(pending); pending = ''; } });
            };
            try {
                child = this.launch(executable, args, { cwd: job.directory, env, shell: false,
                    detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
                job.stop = (force = false) => {
                    clearTimeout(forceTimer);
                    try { this.kill(child, force ? 'SIGKILL' : 'SIGTERM'); } catch (_) {}
                    if (!force) {
                        forceTimer = setTimeout(() => { try { this.kill(child, 'SIGKILL'); } catch (_) {} }, 1500);
                        forceTimer.unref();
                    }
                };
                attach(child.stdout);
                attach(child.stderr);
                child.once('error', error => { launchError = error; if (!child.pid) finish(new Error(`Unable to start ${path.basename(executable)}: ${error.message}`)); });
                child.once('close', (code, signal) => {
                    for (const sink of sinks) sink.end();
                    finish(launchError || (code === 0 ? null : new Error(`${path.basename(executable)} exited with ${signal || code}. ${tail.trim()}`)));
                });
                child.stdin.on('error', error => {
                    if (error.code !== 'EPIPE') { launchError = error; if (job.stop) job.stop(); }
                });
                child.stdin.end(input);
                if (timeout > 0) {
                    timer = setTimeout(() => this.abort(job, this.timeoutMessage, 'failed'), timeout);
                    timer.unref();
                }
            } catch (error) { if (child && job.stop) job.stop(); finish(error); }
        });
    }

}

module.exports = { ManagedJobs };
