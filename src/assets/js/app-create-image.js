import { __html, attr, html, onClick, getKenzapSettings } from './helpers.js'
import { Actions } from './app-actions.js'
import { AppCreateTitle } from './app-create-title.js'
import { AppCreateCluster } from './app-create-cluster.js'
import { getTemplatesPath } from './templates-path.js'
import * as ace from 'ace-builds/src-noconflict/ace'
import 'ace-builds/webpack-resolver'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/mode-sh'
import '../scss/app-picker.css'
import fs from 'fs'
import * as path from 'path'

export class AppCreateImage {
    constructor(app) {
        this.app = app;
        this.settings = { ...getKenzapSettings(), endpoint: '127.0.0.1:8080' };
        this.editors = {};
        this.app.dockerfileDrafts = this.app.dockerfileDrafts || {};
        this.app.templateActions = this.app.templateActions || {};
        this.view();
    }

    editorId(version, name) { return 'dockerfile-' + this.app.image + '-' + version + '-' + name; }

    destroy() { Object.values(this.editors).forEach(editor => editor.destroy()); }

    view() {
        this.loadImages();
        this.modal = document.querySelector('.modal');
        document.querySelector('.modal-title').textContent = __html('Configurations');
        this.modal.querySelector('.modal-body').innerHTML = this.apps.length ? this.apps.map((configuration, index) => `
            <div class="pt-3 mb-4"><div class="d-flex justify-content-between align-items-center gap-3"><h5 class="card-title mb-0">${html(configuration.name || 'Dockerfile')}</h5><button type="button" class="btn btn-outline-primary btn-sm select-app-btn" data-i="${index}">${__html('Select')}</button></div>
            <p class="form-text">${__html('Review or edit the Dockerfile before continuing.')}</p>
            ${configuration.dockerfiles.map(dockerfile => {
                const id = this.editorId(configuration.id, dockerfile.name);
                const content = this.app.dockerfileDrafts[id] !== undefined ? this.app.dockerfileDrafts[id] : dockerfile.content;
                return `<div class="docker-editor mb-3"><label class="form-label small" for="${attr(id)}">${html(dockerfile.name)}</label><textarea id="${attr(id)}" class="form-control monospace" rows="10">${html(content)}</textarea></div>`;
            }).join('')}</div>`).join('') : `<p class="form-text">${__html('No configurations are available for this template. Choose another template.')}</p>`;
        document.querySelector('.modal-footer').innerHTML = `<button type="button" class="btn btn-outline-dark app-title-back">${__html('Back')}</button>`;
        onClick('.app-title-back', () => { this.destroy(); new AppCreateTitle(this.app); });
        onClick('.select-app-btn', event => {
            event.preventDefault();
            const selected = this.apps[Number(event.currentTarget.dataset.i)];
            this.app.image_id = selected.id;
            this.app.actions = selected.processor;
            this.app.dockerfiles = selected.dockerfiles.map(file => ({ name: file.name, content: this.editors[this.editorId(selected.id, file.name)].getValue() }));
            this.destroy();
            new AppCreateCluster(this.app);
        });
        this.modal.querySelectorAll('textarea').forEach(textarea => {
            const content = textarea.value;
            const editor = ace.edit(textarea, { maxLines: 20, minLines: 8, fontSize: 13, theme: 'ace/theme/monokai', mode: 'ace/mode/sh', tabSize: 4 });
            editor.setValue(content, -1);
            editor.getSession().on('change', () => { this.app.dockerfileDrafts[textarea.id] = editor.getValue(); });
            this.editors[textarea.id] = editor;
        });
    }

    loadImages() {
        const root = path.join(getTemplatesPath(), 'apps', this.app.image || 'custom');
        this.apps = fs.existsSync(root) ? fs.readdirSync(root).filter(name => /^\d+$/.test(name) && fs.statSync(path.join(root, name)).isDirectory()).sort((a, b) => Number(a) - Number(b)).map(id => {
            const directory = path.join(root, id), manifestFile = path.join(directory, 'manifest.json');
            const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
            const key = this.app.image + ':' + id;
            const processor = this.app.templateActions[key] || new Actions(manifest.actions, this.settings, this.app.title, this.app.namespace);
            processor.namespace = this.app.namespace;
            if (['wordpress', 'myticket-wp'].includes(this.app.image)) processor.variables.wordpress_db_host = 'db';
            this.app.templateActions[key] = processor;
            return { ...manifest, id, processor, dockerfiles: fs.readdirSync(directory).filter(name => /^Dockerfile/.test(name)).sort().map(name => ({
                name, content: processor.apply('firstView', fs.readFileSync(path.join(directory, name), 'utf8'))
            })) };
        }).filter(configuration => configuration.dockerfiles.length) : [];
    }
}
