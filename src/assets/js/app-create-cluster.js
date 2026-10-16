import global from './global.js'
import { ipcRenderer } from 'electron'
import { __html, attr, simulateClick, getKenzapSettings } from './helpers.js'
import { AppCreateImage } from './app-create-image.js'
import { AppClusterPicker } from './app-cluster-picker.js'
import { Settings } from '../../renderer/app-settings.js'

export class AppCreateCluster {
    constructor(app) {
        this.app = app;
        this.settings = getKenzapSettings();
        this.view();
    }

    view() {
        this.modal = document.querySelector('.modal');
        document.querySelector('.modal-title').textContent = __html('Create app');
        const registry = { ...(this.app.registry || this.settings.registry || {}) };
        if (!this.app.registry && registry.mode === 'repository' && registry.domain) {
            registry.domain = registry.domain.replace(/\/$/, '').split('/').slice(0, -1).concat(this.app.slug).join('/');
        }
        this.modal.querySelector('.modal-body').innerHTML = `
            <div class="app-create-deployment py-2">
                <p class="form-text">${__html('Creates a new namespace and private app configuration. Publish builds and deploys the application afterward. No DNS records are created.')}</p>
                <app-cluster-picker></app-cluster-picker>
                <label for="create-platform" class="form-label mt-3">${__html('Cluster architecture')}</label><select id="create-platform" class="form-select"><option value="linux/amd64" ${this.app.platform !== 'linux/arm64' ? 'selected' : ''}>Linux / AMD64 (x86-64)</option><option value="linux/arm64" ${this.app.platform === 'linux/arm64' ? 'selected' : ''}>Linux / ARM64</option></select><p class="form-text">${__html('Choose the cluster CPU architecture, not this computer.')}</p>
                <div class="mt-3"><label for="create-image-repository" class="form-label">${__html('Image repository')}</label><input id="create-image-repository" class="form-control" value="${attr(registry.domain || '')}" placeholder="registry.example.com/team/${attr(this.app.slug)}"><p class="form-text">${__html('Required for remote clusters. Optional for Minikube. Use your own registry; no hosted registry is allocated automatically.')}</p></div>
                <div class="row g-3"><div class="col-sm-6"><label for="create-registry-user" class="form-label">${__html('Registry username')}</label><input id="create-registry-user" class="form-control" autocomplete="username" value="${attr(registry.user || '')}"></div><div class="col-sm-6"><label for="create-registry-pass" class="form-label">${__html('Registry password')}</label><input id="create-registry-pass" class="form-control" type="password" autocomplete="new-password" value="${attr(registry.pass || '')}"></div></div>
                <p class="form-text">${__html('Leave credentials blank if Docker and the cluster already have registry access. Remote creation requires namespace, RBAC and client-certificate provisioning permissions.')}</p>
                <p class="app-create-progress form-text" role="status"></p><p class="app-create-error text-danger form-text mb-0" role="alert"></p>
            </div>`;
        document.querySelector('.modal-footer').innerHTML = `<button type="button" class="btn btn-outline-dark close-modal d-none" data-bs-dismiss="modal">${__html('Close')}</button><div class="btn-group"><button type="button" class="btn btn-outline-dark app-picker-back">${__html('Back')}</button><button type="button" class="btn btn-outline-primary btn-app-create">${__html('Create app')}</button></div>`;
        this.appClusterPicker = new AppClusterPicker(this.app);
        this.appClusterPicker.init();
        const clusterHint = this.modal.querySelector('app-cluster-picker p.form-text');
        if (clusterHint && this.appClusterPicker.clusters.length) clusterHint.textContent = __html('Choose the cluster for this app.');
        this.modal.querySelector('.app-picker-back').onclick = () => {
            if (this.loading) return;
            this.readRegistry();
            new AppCreateImage(this.app);
        };
        this.modal.querySelector('.btn-app-create').onclick = () => this.create();
    }

    readRegistry() {
        this.app.platform = this.modal.querySelector('#create-platform').value;
        this.app.registry = {
            domain: this.modal.querySelector('#create-image-repository').value.trim(),
            user: this.modal.querySelector('#create-registry-user').value.trim(),
            pass: this.modal.querySelector('#create-registry-pass').value
        };
    }

    setLoading(loading) {
        this.loading = loading;
        this.modal.querySelectorAll('input, select, button:not([data-bs-dismiss]), .cluster-picker').forEach(element => {
            if (element.matches('.cluster-picker')) { element.style.pointerEvents = loading ? 'none' : ''; return; }
            element.disabled = loading;
        });
        this.modal.querySelector('.btn-app-create').textContent = __html(loading ? 'Creating...' : 'Create app');
        const close = this.modal.querySelector('.modal-header [data-bs-dismiss]');
        if (close) close.disabled = loading;
    }

    async create() {
        if (this.loading) return;
        const error = this.modal.querySelector('.app-create-error');
        error.textContent = '';
        this.readRegistry();
        this.app.clusters = this.appClusterPicker.get();
        if (this.app.clusters.length !== 1) { error.textContent = __html('Select one cluster.'); return; }
        if (this.app.clusters[0] !== 'local' && !this.app.registry.domain) { error.textContent = __html('Enter an image repository for this remote cluster.'); return; }
        if (!!this.app.registry.user !== !!this.app.registry.pass) { error.textContent = __html('Provide both registry username and password, or leave both blank.'); return; }
        const request = { title: this.app.title, namespace: this.app.namespace, image: this.app.image, image_id: this.app.image_id,
            icon: this.app.icon || '', dockerfiles: this.app.dockerfiles, registry: this.app.registry, variables: this.app.actions ? this.app.actions.variables : {},
            clusters: this.app.clusters, platform: this.app.platform, project: global.state.project || '' };
        const progress = (event, update) => {
            if (update.appId === request.namespace && this.modal.isConnected) this.modal.querySelector('.app-create-progress').textContent = update.message;
        };
        const blockDismiss = event => event.preventDefault();
        this.setLoading(true);
        this.modal.addEventListener('hide.bs.modal', blockDismiss);
        ipcRenderer.on('app-create-progress', progress);
        try {
            const result = await ipcRenderer.invoke('app-create', request);
            if (!result || !result.ok) throw new Error(result && result.error || __html('Unable to create the app.'));
            if (!global.state.dev) global.state.dev = {};
            global.state.dev[result.value.id] = { status: 'stop', edgeStatus: 'unknown' };
            this.modal.removeEventListener('hide.bs.modal', blockDismiss);
            simulateClick(this.modal.querySelector('.close-modal'));
            new Settings(result.value.id);
        } catch (failure) {
            error.textContent = failure.message;
            this.modal.querySelector('.app-create-progress').textContent = '';
        } finally {
            ipcRenderer.removeListener('app-create-progress', progress);
            this.modal.removeEventListener('hide.bs.modal', blockDismiss);
            if (this.modal.isConnected) this.setLoading(false);
        }
    }
}
