
import fs from "fs";
import yaml from 'js-yaml';
import * as path from 'path';
import global from "./global.js";
import { __html, API, getKenzapSettings, getSetting, getToken, hideLoader, parseError, cacheSettings } from './helpers.js';
import { imageRepository, registryHost } from './image-repository.js';

/**
 * Fetches the application registry from the Kenzap API and processes the response.
 * 
 * @param {Function} cb - A callback function to be executed if the request is successful. 
 *                        The registry data will be passed as an argument to this function.
 * 
 * @returns {void}
 */
export function getAppRegistry(app, cb) {

    // console.log(app);

    let settings = getKenzapSettings();

    if (!settings.id) settings.id = getToken(12);

    // read yaml file if registry is already defined
    let registry = getCurrentRegistry(app, settings);

    // if registry is already defined
    if (registry.domain) { cb(registry); return; }

    // get free registry if currently not defined
    getFreeRegistry(app, settings, cb);
}

export function getCurrentRegistry(app, settings) {

    let cache = getSetting(app.id);
    if (cache.registry && cache.registry.mode === 'repository') return cache.registry;

    // read devspace
    if (cache.path) if (fs.existsSync(path.join(cache.path, 'devspace.yaml'))) {

        try {

            const devspace = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'devspace.yaml'), 'utf8'));

            // console.log(devspace[0].pullSecrets.pullsecret);

            if (!devspace[0].pullSecrets.pullsecret) return {};

            let registry = { domain: devspace[0].pullSecrets.pullsecret.registry, user: devspace[0].pullSecrets.pullsecret.username, pass: devspace[0].pullSecrets.pullsecret.password };

            // saveKenzapSettings({ id: settings.id, registry: registry });

            return registry;

        } catch (error) {

            console.log(error);
        }
    }

    return {}
}

export function getFreeRegistry(app, settings, cb) {

    // get free registry https://api.kenzap-apps.kenzap.cloud/v2/?cmd=get_free_registry&app_id=Y4uR3s&app_slug=app-39987
    console.log(API() + "?cmd=get_free_registry&app_id=" + settings.id + "&app_slug=kenzap-app");
    fetch(API() + "?cmd=get_free_registry&app_id=" + settings.id + "&app_slug=kenzap-app", {
        method: 'post',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Kenzap-Locale': "en",
            'Kenzap-Token': localStorage.getItem("kenzap_token")
        }
    })
        .then(response => response.json())
        .then(response => {

            global.state.loading = false;

            // console.log(response);

            // parse response
            if (response.success) {

                if (cb) cb(response.registry);

                // saveKenzapSettings({ id: settings.id, registry: response.registry });

            } else {

                hideLoader();

                switch (response.code) {

                    case 411:

                        alert(__html('Application with the same name already exists'))
                        break;
                    default:
                        parseError(response);
                        break;
                }
            }
        })
        .catch(error => {

            parseError(error);
        });
}

export function updateRepositoryRegistry(app, registry) {
    const cache = getSetting(app.id), directory = cache.path;
    registry.mode = 'repository';
    registry.domain = imageRepository(registry.domain, app.slug, app.clusters[0] === 'local');
    const previous = app.registry || cache.registry || {};
    const repositories = { ...(app.imageRepositories || cache.imageRepositories || {}) };
    for (const [file, old] of Object.entries(repositories)) {
        if (file !== path.basename(file) || !/^devspace.*\.yaml$/.test(file)) throw new Error('Invalid app image configuration.');
        const target = path.join(directory, file);
        if (!fs.existsSync(target)) continue;
        const config = yaml.load(fs.readFileSync(target, 'utf8'));
        const repository = registry.domain + (previous.domain && old.startsWith(previous.domain) ? old.slice(previous.domain.length) : '');
        for (const image of Object.values(config.images || {})) if (image.image === old) image.image = repository;
        for (const dev of Object.values(config.dev || {})) if (dev.imageSelector === old) dev.imageSelector = repository;
        if (registry.user && registry.pass && app.clusters[0] !== 'local') config.pullSecrets = { pullsecret: {
            registry: 'https://' + registryHost(registry.domain), username: registry.user, password: registry.pass
        } };
        else delete config.pullSecrets;
        for (const deployment of Object.values(config.deployments || {})) {
            for (const name of (deployment.kubectl || {}).manifests || []) {
                const resourcePath = path.resolve(directory, name);
                if (!resourcePath.startsWith(path.resolve(directory) + path.sep)) throw new Error('Invalid deployment manifest path.');
                const documents = yaml.loadAll(fs.readFileSync(resourcePath, 'utf8')).filter(Boolean);
                for (const document of documents) {
                    const pod = document.kind === 'Pod' ? document.spec : document.spec && document.spec.template && document.spec.template.spec;
                    if (!pod) continue;
                    for (const container of [...(pod.containers || []), ...(pod.initContainers || [])]) if (container.image === old) container.image = repository;
                    if (registry.user && registry.pass && app.clusters[0] !== 'local') pod.imagePullSecrets = [{ name: 'devspace-pull-secrets' }];
                    else delete pod.imagePullSecrets;
                }
                fs.writeFileSync(resourcePath, documents.map(document => yaml.dump(document)).join('---\n'));
            }
        }
        fs.writeFileSync(target, yaml.dump(config));
        repositories[file] = repository;
    }
    app.registry = { ...registry }; app.imageRepositories = repositories;
    cacheSettings({ id: app.id, registry: app.registry, imageRepositories: repositories });
}

export function updateDevspace(app, registry) {

    if ((app.registry || {}).mode === 'repository' || registry.mode === 'repository') { updateRepositoryRegistry(app, registry); return; }

    let cache = getSetting(app.id);

    // read devspace.yaml
    if (cache.path) if (fs.existsSync(path.join(cache.path, 'devspace.yaml'))) {

        try {

            const devspace = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'devspace.yaml'), 'utf8'))[0];

            devspace.dev.app.imageSelector = v2(registry.domain);
            devspace.images.app.image = v2(registry.domain);
            devspace.pullSecrets.pullsecret = { registry: https(v2(registry.domain)), username: registry.user, password: registry.pass };

            const devspaceF = yaml.dump({ ...devspace });

            fs.writeFileSync(path.join(cache.path, 'devspace.yaml'), devspaceF, 'utf-8');

        } catch (error) {

            console.log(error);
        }
    }
}

export function updateApp(app, registry) {

    if ((app.registry || {}).mode === 'repository' || registry.mode === 'repository') return;

    let cache = getSetting(app.id);

    // read app.yaml
    if (cache.path) if (fs.existsSync(path.join(cache.path, 'app.yaml'))) {

        try {

            const app = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'app.yaml'), 'utf8'))[0];

            app.spec.template.spec.containers[0].image = v2(registry.domain);

            const appF = yaml.dump({ ...app });

            fs.writeFileSync(path.join(cache.path, 'app.yaml'), appF, 'utf-8');

        } catch (error) {

            console.log(error);
        }
    }
}

export function https(domain) {

    if (!domain.startsWith('https')) {
        return 'https://' + domain;
    }
    return domain;
}

export function http(domain) {

    if (!domain.startsWith('http')) {
        return 'http://' + domain;
    }
    return domain;
}

export function v2(domain) {

    if (!domain.endsWith('/v2')) {
        return domain + '/v2';
    }

    return domain.replace('https://', '');
}

export function deleteRegistryTag(app, tag) {

    // tag = "latest";

    console.log("deleteRegistryTag ", tag);

    let cache = getSetting(app.id);

    // read devspace.yaml
    if (cache.path) {

        try {

            const devspace = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'devspace.yaml'), 'utf8'))[0];

            // console.log(devspace.pullSecrets.pullsecret);

            let { registry, username, password } = devspace.pullSecrets.pullsecret;

            registry = registry.replace('https://', '').replace('/v2', '');
            const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');


            // return;

            // skopeo delete --creds=udd9swzmcnmhbce2wc6xlqtqw:aXzfafLSRlNKZN5zZHEmEbJkp6IbpL9FaDpQc7caAZ5ETHDYfxi42WzCOCa8ahaJm7yuT4yS docker://i30845.eu-registry-1.kenzap.cloud/v2:latest
            const getDigest = () => {
                console.log(`https://${registry}/v2/v2/manifests/${tag}`);
                fetch(`https://${registry}/v2/v2/manifests/${tag}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': auth,
                        'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
                    }
                })
                    .then(response => response.json())
                    .then(response => {
                        console.log(`Digest Response`);
                        console.log(response.config.digest);

                        // deleteRegistryTagWithDigest(registry, auth, response.config.digest);
                    })
                    .catch(error => {
                        console.error('Error:', error);
                    });

                // console.log("response", response);

                // if (!response.ok) {
                //     throw new Error(`Failed to get digest for tag ${tag}. Status: ${response.status}`);
                // }

                // const data = response.json();

                // return data.config.digest;
            };

            getDigest();

        } catch (error) {

            console.log(error);
        }

    }
}

export function deleteRegistryTagWithDigest(registry, auth, digest) {

    fetch(`https://${registry}/v2/v2/manifests/${digest}`, {
        method: 'DELETE',
        headers: {
            'Authorization': auth,
            'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
        }
    })
        .then(response => response.json())
        .then(response => {
            // if (response.ok) {

            console.log("deleteRegistryTagWithDigest", response);

            //     console.log(`Tag ${tag} deleted successfully.`);
            // } else {
            //     console.error(`Failed to delete tag ${tag}. Status: ${response.status}`);
            // }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}
