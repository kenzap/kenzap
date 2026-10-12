'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { execFile } = require('child_process');
const { tunnelAppConfig } = require('./cluster-monitor');

const quote = value => `'${String(value).replace(/'/g, "'\\''")}'`;

function findDevspace() {
    const candidates = ['/opt/homebrew/bin/devspace', '/usr/local/bin/devspace', '/usr/bin/devspace',
        path.join(os.homedir(), '.devspace', 'bin', 'devspace'), path.join(os.homedir(), '.local', 'bin', 'devspace'),
        ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'devspace'))];
    for (const candidate of candidates) {
        try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch (_) {}
    }
    throw new Error('Install DevSpace to publish apps, sync files, or open pod terminals.');
}

function containerName(directory, file) {
    const manifest = path.join(directory, file.replace(/^devspace/, 'app'));
    if (!fs.existsSync(manifest)) return null;
    const documents = yaml.loadAll(fs.readFileSync(manifest, 'utf8'));
    const workloads = documents.flatMap(item => item && item.kind === 'List' ? item.items || [] : [item]);
    const names = new Set();
    for (const item of workloads) {
        if (!item || !item.spec) continue;
        const spec = item.kind === 'Pod' ? item.spec : item.spec.template && item.spec.template.spec;
        for (const container of (spec && spec.containers) || []) if (container.name) names.add(container.name);
    }
    // Let DevSpace offer its pod/container picker when the manifest is ambiguous.
    return names.size === 1 ? [...names][0] : null;
}

class PodConsole {
    constructor({ monitor, execute = execFile, devspace = findDevspace, platform = process.platform }) {
        this.monitor = monitor;
        this.execute = execute;
        this.devspace = devspace;
        this.platform = platform;
        this.sessions = new Map();
        this.closed = false;
    }

    invalidate(clusterId) {
        for (const [directory, session] of this.sessions) {
            if (session.clusterId === clusterId && session.transport === 'ssh') this.remove(directory);
        }
    }

    remove(directory) {
        fs.rmSync(directory, { recursive: true, force: true });
        this.sessions.delete(directory);
    }

    async open(request) {
        if (this.closed) throw new Error('Pod terminals are shutting down.');
        if (this.platform !== 'darwin') throw new Error('Opening a pod in Terminal is currently supported on macOS only.');
        const { appId, file } = request || {};
        if (typeof appId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(appId)) throw new Error('Invalid app.');
        if (typeof file !== 'string' || file.includes('\0') || file !== path.basename(file)
            || !file.startsWith('devspace') || !file.endsWith('.yaml')) throw new Error('Invalid DevSpace configuration.');
        const appDir = path.join(this.monitor.connections.baseDir, appId);
        const app = JSON.parse(fs.readFileSync(path.join(appDir, '.kenzap'), 'utf8'));
        if (!app.clusters || !app.clusters.length) throw new Error('Assign a cluster before opening a pod terminal.');
        const directory = app.path || appDir;
        if (!fs.statSync(path.join(directory, file)).isFile()) throw new Error('The selected DevSpace configuration is missing.');
        const route = this.monitor.describe({ clusterId: app.clusters[0], appId, operation: 'pods' });
        const executable = this.devspace();
        const container = containerName(directory, file);
        for (const temporary of this.sessions.keys()) if (!fs.existsSync(temporary)) this.sessions.delete(temporary);
        const temporary = fs.mkdtempSync(path.join(this.monitor.connections.runtimeDir, 'console-'));
        const session = { clusterId: route.clusterId, transport: route.transport };
        this.sessions.set(temporary, session);
        try {
            const args = ['enter', '--namespace', route.namespace, '--config', file];
            const setup = [];
            if (container) args.push('--container', container);
            if (route.transport === 'local') args.push('--kube-context', 'minikube');
            else {
                let kubeconfigPath = route.sourcePath;
                let content = fs.readFileSync(route.sourcePath, 'utf8');
                if (route.transport === 'ssh') {
                    content = tunnelAppConfig(content, path.dirname(route.sourcePath), route.connection);
                    kubeconfigPath = path.join(temporary, 'kubeconfig.yaml');
                    fs.writeFileSync(kubeconfigPath, content, { mode: 0o600 });
                    setup.push('unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy');
                }
                args.push('--kubeconfig', kubeconfigPath, '--kube-context', yaml.load(content)['current-context']);
                setup.push(`export KUBECONFIG=${quote(kubeconfigPath)}`);
            }
            // Quote each argument rather than interpolating paths into a nested shell command.
            const scriptPath = path.join(temporary, 'console.command');
            const script = ['#!/bin/bash', 'umask 077',
                `cleanup() { /bin/rm -rf -- ${quote(temporary)}; }`,
                "trap cleanup EXIT", "trap 'exit 130' INT", "trap 'exit 143' TERM HUP",
                'unset DEVSPACE_FLAGS',
                `export PATH=${quote(`${path.dirname(executable)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}`)}`,
                ...setup, `cd -- ${quote(directory)} || exit 1`,
                [executable, ...args].map(quote).join(' '), 'status=$?',
                'if [ "$status" -ne 0 ]; then printf "\\nPod terminal failed. Check the connection and pod exec permissions.\\n"; fi',
                'exit "$status"', ''].join('\n');
            fs.writeFileSync(scriptPath, script, { mode: 0o700 });
            await new Promise((resolve, reject) => this.execute('/usr/bin/open', ['-a', 'Terminal', scriptPath],
                { shell: false, timeout: 10000, encoding: 'utf8' },
                (error, stdout, stderr) => error ? reject(new Error((stderr || error.message).trim())) : resolve()));
            if (this.closed || !this.sessions.has(temporary)) throw new Error('The connection changed while opening the terminal. Reconnect and try again.');
            return { transport: route.transport, namespace: route.namespace };
        } catch (error) {
            this.remove(temporary);
            throw error;
        }
    }

    close() {
        this.closed = true;
        for (const directory of this.sessions.keys()) this.remove(directory);
    }
}

module.exports = { PodConsole, findDevspace };
