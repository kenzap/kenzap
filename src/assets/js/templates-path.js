const fs = require('fs');
const path = require('path');

function resolveTemplatesPath({ development, moduleDirectory, resourcesPath }) {
    const candidates = development ? [
        path.resolve(moduleDirectory, '..', '..', 'src', 'assets', 'templates'),
        path.resolve(moduleDirectory, '..', 'templates')
    ] : [path.join(resourcesPath, 'templates')];
    // electron-webpack launches main from dist/main, not the project root.
    return candidates.find(directory => {
        try {
            return fs.statSync(path.join(directory, 'apps')).isDirectory()
                && ['devspace.yaml', 'app.yaml', 'endpoints.yaml'].every(file => fs.statSync(path.join(directory, 'app', file)).isFile());
        } catch (_) { return false; }
    }) || candidates[0];
}

function getTemplatesPath() {
    return resolveTemplatesPath({ development: process.env.NODE_ENV !== 'production',
        moduleDirectory: __dirname, resourcesPath: process.resourcesPath });
}

module.exports = { getTemplatesPath, resolveTemplatesPath };
