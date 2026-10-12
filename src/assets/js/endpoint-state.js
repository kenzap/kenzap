'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const clone = value => JSON.parse(JSON.stringify(value));
const namespace = resource => resource.metadata.namespace || 'default';
const resourceKey = resource => `${resource.kind}/${namespace(resource)}/${resource.metadata.name}`;
const serviceKey = service => `${service.namespace || service.slug || 'default'}/${service.name}`;
const backendKey = (ingress, route) => route.backend && route.backend.service
    ? `${namespace(ingress)}/${route.backend.service.name}` : null;
const rules = ingress => (ingress.spec && ingress.spec.rules) || [];
const paths = rule => (rule.http && rule.http.paths) || [];
const publicEnabled = service => service && service.active_private && service.active_public;

function mergeIngress(target, archived, keys) {
    for (const rule of rules(archived)) {
        const restoredPaths = paths(rule).filter(route => keys.has(backendKey(archived, route)));
        if (!restoredPaths.length) continue;
        const current = rules(target).find(item => item.host === rule.host);
        if (current) {
            for (const route of restoredPaths) {
                if (!paths(current).some(item => JSON.stringify(item) === JSON.stringify(route))) current.http.paths.push(clone(route));
            }
        } else target.spec.rules.push({ ...clone(rule), http: { ...clone(rule.http), paths: clone(restoredPaths) } });
    }
    const hosts = new Set(rules(target).map(rule => rule.host));
    for (const entry of (archived.spec.tls || [])) {
        const restoredHosts = (entry.hosts || []).filter(host => hosts.has(host));
        if (!restoredHosts.length) continue;
        if (!target.spec.tls) target.spec.tls = [];
        const current = target.spec.tls.find(item => item.secretName === entry.secretName);
        if (current) current.hosts = [...new Set([...(current.hosts || []), ...restoredHosts])];
        else target.spec.tls.push({ ...clone(entry), hosts: restoredHosts });
    }
}

class EndpointState {
    constructor(directory, app) {
        this.directory = directory;
        this.app = app;
        this.manifestPath = path.join(directory, 'endpoints.yaml');
        this.statePath = path.join(directory, '.endpoints-state.json');
    }

    read() {
        const resources = fs.existsSync(this.manifestPath)
            ? yaml.loadAll(fs.readFileSync(this.manifestPath, 'utf8')).filter(Boolean) : [];
        const state = fs.existsSync(this.statePath) ? JSON.parse(fs.readFileSync(this.statePath, 'utf8'))
            : { version: 1, disabledEndpoints: [], disabledResources: [], pendingDeletes: [] };
        if (state.version !== 1 || !['disabledEndpoints', 'disabledResources', 'pendingDeletes'].every(key => Array.isArray(state[key]))) {
            throw new Error('The disabled endpoint state is invalid. Restore .endpoints-state.json before saving.');
        }
        if (resources.some(resource => !resource.kind || !resource.metadata || !resource.metadata.name)) {
            throw new Error('Every endpoint resource must have a kind and metadata.name.');
        }
        return { resources, state };
    }

    services(resources, state) {
        const services = resources.filter(resource => resource.kind === 'Service').map(resource => {
            const firstPort = (resource.spec.ports || [])[0];
            if (!firstPort) throw new Error(`Service ${resource.metadata.name} has no port.`);
            const service = { name: resource.metadata.name, namespace: namespace(resource), slug: this.app.slug,
                port: firstPort.port, host: '', private: `${resource.metadata.name}.${namespace(resource)}`,
                active_private: 1, active_public: 0 };
            for (const ingress of resources.filter(item => item.kind === 'Ingress')) {
                const rule = rules(ingress).find(item => paths(item).some(route => backendKey(ingress, route) === serviceKey(service)));
                if (rule) { service.host = rule.host || ''; service.active_public = 1; break; }
            }
            return service;
        });
        for (const disabled of state.disabledEndpoints) {
            const current = services.find(service => serviceKey(service) === serviceKey(disabled));
            // Active YAML wins if someone restored or edited a route outside the interface.
            if (!current) services.push(clone(disabled));
            else if (!current.active_public) current.host = disabled.host || '';
        }
        return services;
    }

    load() {
        const { resources, state } = this.read();
        return this.services(resources, state);
    }

    restoreResources(resources, state) {
        const combined = clone(resources);
        const liveRoutes = new Set();
        resources.filter(item => item.kind === 'Ingress').forEach(ingress =>
            rules(ingress).forEach(rule => paths(rule).forEach(route => liveRoutes.add(backendKey(ingress, route)))));
        const disabled = new Map(state.disabledEndpoints.map(service => [serviceKey(service), service]));
        const restoreKeys = new Set([...disabled.keys()].filter(key => !liveRoutes.has(key)));
        for (const archived of state.disabledResources) {
            const current = combined.find(resource => resourceKey(resource) === resourceKey(archived));
            if (archived.kind === 'Service') {
                if (!current && disabled.has(`${namespace(archived)}/${archived.metadata.name}`)) combined.push(clone(archived));
            } else if (archived.kind === 'Ingress') {
                const target = current || { ...clone(archived), spec: { ...clone(archived.spec), rules: [] } };
                if (!target.spec.rules) target.spec.rules = [];
                mergeIngress(target, archived, restoreKeys);
                if (!current && target.spec.rules.length) combined.push(target);
            }
        }
        return combined;
    }

    build(resources, services, originals) {
        const desired = new Map(services.map(service => [serviceKey(service), service]));
        const baseline = new Map(originals.map(service => [serviceKey(service), service]));
        const managed = new Set([...baseline.keys(), ...desired.keys()]);
        const result = [];
        const routed = new Set();
        const existingService = resources.find(item => item.kind === 'Service');
        const defaultNamespace = this.app.namespace || (existingService && existingService.metadata.namespace) || this.app.slug;
        for (const resource of resources) {
            if (resource.kind === 'Service') {
                const key = `${namespace(resource)}/${resource.metadata.name}`;
                const service = desired.get(key);
                if (managed.has(key) && (!service || !service.active_private)) continue;
                const output = clone(resource);
                if (service && (!baseline.has(key) || String(service.port) !== String(baseline.get(key).port))) {
                    output.spec.ports[0].port = Number(service.port);
                }
                result.push(output);
            } else if (resource.kind === 'Ingress') {
                const output = clone(resource);
                const hostChanges = new Map();
                let touched = false;
                output.spec.rules = [];
                for (const rule of rules(resource)) {
                    const byHost = new Map();
                    for (const route of paths(rule)) {
                        const key = backendKey(resource, route);
                        const service = desired.get(key);
                        if (managed.has(key)) touched = true;
                        if (managed.has(key) && !publicEnabled(service)) continue;
                        const original = baseline.get(key);
                        const host = service && original && service.host !== original.host && rule.host === original.host
                            ? service.host : rule.host;
                        const preserved = clone(route);
                        if (service && original && String(service.port) !== String(original.port)) {
                            const port = preserved.backend.service.port;
                            const sourceService = resources.find(item => item.kind === 'Service' && `${namespace(item)}/${item.metadata.name}` === key);
                            const firstPort = sourceService && sourceService.spec.ports[0];
                            if (port.number === Number(original.port) || (firstPort && port.name === firstPort.name)) {
                                preserved.backend.service.port = { number: Number(service.port) };
                            }
                        }
                        if (!byHost.has(host)) byHost.set(host, []);
                        byHost.get(host).push(preserved);
                        routed.add(key);
                    }
                    hostChanges.set(rule.host, [...new Set([...(hostChanges.get(rule.host) || []), ...byHost.keys()])]);
                    for (const [host, routes] of byHost) output.spec.rules.push({ ...clone(rule), host, http: { ...clone(rule.http), paths: routes } });
                }
                if (output.spec.tls) output.spec.tls = output.spec.tls.map(entry => {
                    if (!entry.hosts) return entry;
                    return { ...entry, hosts: [...new Set(entry.hosts.flatMap(host => hostChanges.has(host) ? hostChanges.get(host) : [host]))] };
                }).filter(entry => !entry.hosts || entry.hosts.length);
                if (!touched || output.spec.rules.length || output.spec.defaultBackend) result.push(output);
            } else result.push(clone(resource));
        }
        for (const service of services) {
            const key = serviceKey(service);
            if (service.active_private && !result.some(item => item.kind === 'Service' && `${namespace(item)}/${item.metadata.name}` === key)) {
                result.push({ apiVersion: 'v1', kind: 'Service', metadata: { name: service.name, namespace: service.namespace || defaultNamespace },
                    spec: { type: 'ClusterIP', selector: { app: service.selector_app || `${this.app.slug}-${service.name}` },
                        ports: [{ name: 'http', port: Number(service.port) }] } });
            }
            if (!publicEnabled(service) || routed.has(key)) continue;
            let ingress = result.find(item => item.kind === 'Ingress' && namespace(item) === (service.namespace || defaultNamespace));
            if (!ingress) {
                ingress = { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress',
                    metadata: { name: `${this.app.slug}-ingress`, namespace: service.namespace || defaultNamespace,
                        annotations: clone(this.app.annotations || {}) }, spec: { ingressClassName: 'nginx', rules: [] } };
                if (this.app.clusters[0] !== 'local') ingress.spec.tls = [{ hosts: [], secretName: 'letsencrypt-prod' }];
                result.push(ingress);
            }
            ingress.spec.rules.push({ host: service.host, http: { paths: [{ path: '/', pathType: 'Prefix',
                backend: { service: { name: service.name, port: { number: Number(service.port) } } } }] } });
            if (ingress.spec.tls && ingress.spec.tls.length) {
                ingress.spec.tls[0].hosts = [...new Set([...(ingress.spec.tls[0].hosts || []), service.host])];
            }
        }
        return result;
    }

    save(services, originals = services) {
        const { resources, state } = this.read();
        const combined = this.restoreResources(resources, state);
        const firstService = combined.find(resource => resource.kind === 'Service');
        const defaultNamespace = this.app.namespace || (firstService && firstService.metadata.namespace) || this.app.slug;
        services = services.map(service => ({ ...service, namespace: service.namespace || defaultNamespace }));
        originals = originals.map(service => ({ ...service, namespace: service.namespace || defaultNamespace }));
        const live = new Map(this.services(resources, state).map(service => [serviceKey(service), service]));
        const baseline = new Map(originals.map(service => [serviceKey(service), service]));
        const fields = ['host', 'port', 'active_private', 'active_public'];
        services = services.map(service => {
            const key = serviceKey(service);
            const original = baseline.get(key);
            if (!original) return service;
            const current = live.get(key);
            const changed = field => String(service[field]) !== String(original[field]);
            if (!current && !fields.some(changed)) { baseline.delete(key); return null; }
            if (current) for (const field of fields) {
                if (!changed(field) || String(service[field]) === String(current[field])) {
                    service[field] = current[field];
                    original[field] = current[field];
                } else if (String(current[field]) !== String(original[field])) {
                    throw new Error('This endpoint changed outside the interface. Reopen the app settings before saving.');
                }
            }
            return service;
        }).filter(Boolean);
        originals = [...baseline.values()];
        const desired = this.build(combined, services, originals);
        const knownRoutes = new Set();
        combined.filter(resource => resource.kind === 'Ingress').forEach(resource =>
            rules(resource).forEach(rule => paths(rule).forEach(route => knownRoutes.add(backendKey(resource, route)))));
        // Archive the edited configuration, not an outdated pre-toggle copy.
        const catalog = this.build(combined, services.map(service => ({ ...service, active_private: 1,
            active_public: service.active_public || knownRoutes.has(serviceKey(service)) ? 1 : 0 })), originals);
        const disabledEndpoints = services.filter(service => !service.active_private || (!service.active_public && service.host)).map(clone);
        const disabled = new Map(disabledEndpoints.map(service => [serviceKey(service), service]));
        const disabledResources = catalog.filter(resource => resource.kind === 'Service'
            ? disabled.has(`${namespace(resource)}/${resource.metadata.name}`) && !disabled.get(`${namespace(resource)}/${resource.metadata.name}`).active_private
            : resource.kind === 'Ingress' && rules(resource).some(rule => paths(rule).some(route => disabled.has(backendKey(resource, route))))).map(resource => {
                const archived = clone(resource);
                if (archived.kind === 'Ingress') archived.spec.rules = rules(archived).map(rule => ({ ...rule,
                    http: { ...rule.http, paths: paths(rule).filter(route => disabled.has(backendKey(archived, route))) } })).filter(rule => rule.http.paths.length);
                return archived;
            });
        const desiredKeys = new Set(desired.map(resourceKey));
        const pending = [...state.pendingDeletes, ...resources.filter(resource => ['Ingress', 'Service'].includes(resource.kind) && !desiredKeys.has(resourceKey(resource)))
            .map(resource => ({ apiVersion: resource.apiVersion, kind: resource.kind,
                metadata: { name: resource.metadata.name, namespace: resource.metadata.namespace } }))];
        const pendingDeletes = [...new Map(pending.filter(resource => !desiredKeys.has(resourceKey(resource))).map(resource => [resourceKey(resource), resource])).values()];
        this.writeAtomic(this.statePath, JSON.stringify({ version: 1, disabledEndpoints, disabledResources, pendingDeletes }, null, 2));
        if (JSON.stringify(resources) !== JSON.stringify(desired) || !fs.existsSync(this.manifestPath)) {
            this.writeAtomic(this.manifestPath, desired.map(resource => yaml.dump(resource)).join('---\n'));
        }
        return { resources: desired, pendingDeletes };
    }

    writeAtomic(file, content) {
        const temporary = file + '.' + process.pid + '.tmp';
        try {
            fs.writeFileSync(temporary, content, { mode: 0o600 });
            fs.renameSync(temporary, file);
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
}

module.exports = { EndpointState, resourceKey };
