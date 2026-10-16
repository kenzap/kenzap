'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { Actions } = require('../assets/js/app-actions');
const { imageRepository, registryHost } = require('../assets/js/image-repository');

function buildWorkspace({ directory, app, templatesDir, settings, variables = {} }) {
    const local = app.clusters[0] === 'local';
    if (!/^[a-z0-9-]+$/.test(app.image) || !/^\d+$/.test(app.image_id)) throw new Error('Select a valid app template configuration.');
    const source = path.join(templatesDir, 'apps', app.image, app.image_id);
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
        throw new Error(`Template "${app.image}" configuration ${app.image_id} was not found at ${source}. Reopen Add app after restarting with the latest build.`);
    }
    const manifestPath = path.join(source, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
    const actions = new Actions(manifest.actions, { ...settings, id: settings.id || 'local', endpoint: '127.0.0.1:8080' }, app.title, app.namespace);
    actions.variables = Object.fromEntries(Object.entries(variables).filter(([name, value]) => /^[a-zA-Z0-9_]+$/.test(name) && typeof value === 'string' && value.length < 4096));
    if (['wordpress', 'myticket-wp'].includes(app.image)) actions.variables.wordpress_db_host = 'db';
    const base = imageRepository(app.registry.domain, app.slug, local);
    app.registry = { ...app.registry, domain: base, mode: 'repository' };
    const host = registryHost(base);
    const transform = text => {
        let content = actions.apply('firstView', text);
        const replacements = { template_registry_url: `https://${host}`, template_registry_username: 'registry-user',
            template_registry_password: 'registry-password', template_registry: base, template_namespace: app.namespace,
            template_slug: app.slug, template_https_endpoint: `https://${app.slug}.example.invalid`, template_endpoint: `${app.slug}.example.invalid` };
        for (const [key, value] of Object.entries(replacements)) content = content.split(key).join(value || '');
        return content;
    };
    function copy(from, to) {
        for (const name of fs.readdirSync(from)) {
            if (['manifest.json', '.DS_Store', '.git'].includes(name)) continue;
            const sourcePath = path.join(from, name), targetPath = path.join(to, name), stat = fs.lstatSync(sourcePath);
            if (stat.isSymbolicLink()) throw new Error('Template links are not supported.');
            if (stat.isDirectory()) { fs.mkdirSync(targetPath, { mode: 0o755 }); copy(sourcePath, targetPath); }
            else {
                const data = fs.readFileSync(sourcePath);
                fs.writeFileSync(targetPath, data.includes(0) ? data : transform(data.toString('utf8')), { mode: stat.mode & 0o777 });
            }
        }
    }
    copy(source, directory);
    for (const dockerfile of app.dockerfiles || []) {
        if (!/^Dockerfile(?:[._-][a-zA-Z0-9_-]+)?$/.test(dockerfile.name) || typeof dockerfile.content !== 'string' || dockerfile.content.length > 1024 * 1024) throw new Error('Invalid Dockerfile edit.');
        fs.writeFileSync(path.join(directory, dockerfile.name), transform(dockerfile.content));
    }
    for (const [prefix, fallback] of [['devspace', 'devspace.yaml'], ['app', 'app.yaml'], ['endpoints', 'endpoints.yaml']]) {
        if (!fs.readdirSync(directory).some(name => name === fallback || name.startsWith(prefix + '-') && name.endsWith('.yaml'))) {
            fs.writeFileSync(path.join(directory, fallback), transform(fs.readFileSync(path.join(templatesDir, 'app', fallback), 'utf8')));
        }
    }
    const configs = fs.readdirSync(directory).filter(name => /^devspace.*\.yaml$/.test(name)).sort();
    app.imageRepositories = {};
    for (const file of configs) {
        const config = yaml.load(fs.readFileSync(path.join(directory, file), 'utf8'));
        const component = file.replace(/^devspace-?/, '').replace(/\.yaml$/, '');
        const images = Object.entries(config.images || {});
        if (!images.length) throw new Error(`No buildable image configured in ${file}.`);
        for (const [name, image] of images) {
            const suffix = [configs.length > 1 ? component || 'app' : '', images.length > 1 ? name : ''].filter(Boolean).join('-');
            const repository = base + (suffix ? '-' + suffix : '');
            const old = image.image;
            image.image = repository;
            image.buildKit = image.buildKit || {};
            const args = image.buildKit.args || [];
            image.buildKit.args = args.filter((arg, index) => arg !== '--platform' && args[index - 1] !== '--platform' && !arg.startsWith('--platform='));
            image.buildKit.args.push('--platform', app.platform || 'linux/amd64');
            const dockerfile = path.resolve(directory, image.dockerfile || 'Dockerfile');
            if (!dockerfile.startsWith(directory + path.sep) || !fs.existsSync(dockerfile)
                || !/^FROM\s+(?!\.\.\.)\S+/im.test(fs.readFileSync(dockerfile, 'utf8'))) throw new Error(`Provide a valid Dockerfile for ${file}.`);
            for (const dev of Object.values(config.dev || {})) {
                if (dev.imageSelector === old) dev.imageSelector = repository;
                dev.arch = (app.platform || 'linux/amd64').split('/')[1];
            }
            for (const deployment of Object.values(config.deployments || {})) {
                for (const resourceFile of (deployment.kubectl || {}).manifests || []) {
                    const target = path.resolve(directory, resourceFile);
                    if (!target.startsWith(directory + path.sep) || !fs.existsSync(target)) throw new Error(`Missing deployment manifest in ${file}.`);
                    const documents = yaml.loadAll(fs.readFileSync(target, 'utf8'));
                    for (const doc of documents.filter(Boolean)) {
                        const pod = doc.kind === 'Pod' ? doc.spec : doc.spec && doc.spec.template && doc.spec.template.spec;
                        if (pod) {
                            for (const container of [...(pod.containers || []), ...(pod.initContainers || [])]) if (container.image === old) container.image = repository;
                            if (!app.registry.user || local) delete pod.imagePullSecrets;
                            if (local) for (const container of pod.containers || []) container.imagePullPolicy = 'IfNotPresent';
                        }
                    }
                    fs.writeFileSync(target, documents.filter(Boolean).map(doc => yaml.dump(doc)).join('---\n'));
                }
            }
            app.imageRepositories[file] = repository;
        }
        config.pipelines = config.pipelines || {};
        if (!config.pipelines.deploy) config.pipelines.deploy = { run: 'run_dependencies --all\nensure_pull_secrets --all\nbuild_images --all\ncreate_deployments --all' };
        if (app.registry.user && app.registry.pass && !local) config.pullSecrets = { pullsecret: { registry: `https://${host}`, username: app.registry.user, password: app.registry.pass } };
        else delete config.pullSecrets;
        config.localRegistry = { enabled: false };
        fs.writeFileSync(path.join(directory, file), yaml.dump(config), { mode: 0o600 });
        fs.chmodSync(path.join(directory, file), 0o600);
    }
    const endpointsFile = path.join(directory, 'endpoints.yaml');
    // New apps start private; public hostnames and external DNS are an explicit later choice.
    const endpoints = yaml.loadAll(fs.readFileSync(endpointsFile, 'utf8')).filter(resource => resource && resource.kind !== 'Ingress');
    fs.writeFileSync(endpointsFile, endpoints.map(resource => yaml.dump(resource)).join('---\n'));
    for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.yaml'))) {
        const content = fs.readFileSync(path.join(directory, file), 'utf8');
        if (/template_[a-z0-9_]+/i.test(content)) throw new Error(`Unresolved template settings in ${file}.`);
        for (const document of yaml.loadAll(content).filter(Boolean)) {
            if (document.kind && document.metadata && document.metadata.namespace && document.metadata.namespace !== app.namespace) throw new Error(`Template ${file} targets a different namespace.`);
        }
    }
    app.dockerfiles = fs.readdirSync(directory).filter(file => /^Dockerfile/.test(file)).map(name => ({ name, content: fs.readFileSync(path.join(directory, name), 'utf8') }));
    return app;
}

module.exports = { buildWorkspace, imageRepository };
