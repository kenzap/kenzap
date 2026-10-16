const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function monitoringIdentity(baseDir, appId, clusterId) {
    try {
        const settings = JSON.parse(fs.readFileSync(path.join(baseDir, '.kenzap', '.config'), 'utf8'));
        const appDir = appId ? path.join(baseDir, appId) : null;
        const app = appId ? JSON.parse(fs.readFileSync(path.join(appDir, '.kenzap'), 'utf8')) : {};
        const directories = [...new Set([path.join(baseDir, '.kenzap'), appDir, app.path].filter(Boolean))];
        const files = [];
        for (const directory of directories) {
            if (!fs.existsSync(directory)) continue;
            for (const name of fs.readdirSync(directory).filter(name => /^kubeconfig.*\.ya?ml$/i.test(name) || name === 'app.yaml').sort()) {
                const file = path.join(directory, name), stat = fs.statSync(file);
                files.push([file, stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino]);
            }
        }
        return crypto.createHash('sha256').update(JSON.stringify([baseDir, appId, clusterId,
            app.path, app.namespace, app.clusters, settings.localClusterEnabled,
            (settings.clusters || []).find(cluster => cluster.id === clusterId), files])).digest('hex');
    } catch (_) {
        // Missing or unreadable settings must trigger a real read, not reuse old success.
        return null;
    }
}

module.exports = { monitoringIdentity };
