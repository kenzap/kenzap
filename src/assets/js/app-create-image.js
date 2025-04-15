
import global from "./global.js"
import { __html, attr, onClick, getKenzapSettings } from './helpers.js'
import { Actions } from './app-actions.js'
import { AppCreateTitle } from './app-create-title.js'
import { AppCreateCluster } from './app-create-cluster.js'
import { getAppRegistry } from './app-registry-helpers.js'
import * as ace from 'ace-builds/src-noconflict/ace';
import 'ace-builds/webpack-resolver'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/mode-javascript'
import "../scss/app-picker.css"
import { on } from "events"
import fs from "fs"
import * as path from 'path';

/**
 * Class representing an App Create Dialog where user selects preconfigured docker image templates.
 */
export class AppCreateImage {

    constructor(app) {

        this.app = app;

        this.apps = [];

        this.settings = getKenzapSettings();

        // console.log(this.settings);

        this.init();

        // preload app registry for app deployment
        if (!this.app.registry) getAppRegistry(this.app, (registry) => {

            this.app.registry = registry;
        });
    }

    init() {

        this.view();
    }

    view() {

        this.loadImages();

        // get modal html
        this.modal = document.querySelector(".modal");

        // set wide screen
        document.querySelector(".modal-dialog").classList.add("modal-lg");

        document.querySelector(".modal-title").innerHTML = __html("Configurations");

        this.modal.querySelector(".modal-body").innerHTML = this.apps.map((app, i) => {

            return `
                <div class="col-sm-12 pt-3 mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5 class="card-title">${__html(app.name || 'Docker File')}</h5>
                        <button type="button" class="btn btn-outline-primary btn-sm select-app-btn" data-i="${attr(i)}" data-id="${attr(app.id)}">${__html('Select')}</button>
                    </div>
                    <p class="form-text">${__html('Edit docker file below for ' + (app.name || 'this app') + '.')}</p>
                    ${app.dockerfiles.map(dockerfile => `
                    <div class="docker-editor mb-3">
                        <label for="dockerfile-${attr(app.id)}-${attr(dockerfile.name)}" class="form-label d-none">${__html(dockerfile.name)}</label>
                        <textarea id="dockerfile-${attr(app.id)}-${attr(dockerfile.name)}" data-id="${attr(app.id)}" data-i="${attr(i)}" data-name="${attr(dockerfile.name)}" type="text" autocomplete="off" rows="10" class="form-control monospace">${attr(dockerfile.content)}</textarea>
                    </div>
                    `).join('')}
                    <div class="clearfix"></div>
                </div>
                `;
        }).join('');

        // footer buttons
        document.querySelector(".modal-footer").innerHTML = `
        <div class="${this.app.image == 'custom' ? 'btn-group' : ''}" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal app-title-back" tabindex="-1">${__html("Back")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary btn-continue ${this.app.image == 'custom' ? '' : 'd-none'}" tabindex="-1">${__html("Continue")}</button>
        </div>
        `;

        onClick(".app-title-back", e => {

            new AppCreateTitle(this.app);
        });

        onClick(".select-app-btn", e => {

            e.preventDefault();

            let i = e.currentTarget.dataset.i;

            let slug = this.app.slug;
            let image_id = this.apps[i].id;

            this.app = { ...this.app, ...this.apps[i] };

            this.app.slug = slug;
            this.app.actions = this.actions;
            this.app.image_id = image_id;

            new AppCreateCluster(this.app);
        });

        onClick(".btn-continue", e => {

            e.preventDefault();

            this.app.actions = this.actions;

            new AppCreateCluster(this.app);
        });

        this.renderDockerfile();
    }

    loadImages() {

        let self = this;

        if (!this.app.image) { this.loadEmptyImage(); return; }

        const appsPath = path.join(__dirname, "..", "templates", "apps", this.app.image);
        const folders = fs.readdirSync(appsPath).filter(folder => {
            const folderPath = path.join(appsPath, folder);
            return fs.statSync(folderPath).isDirectory();
        });

        this.apps = folders.map(folder => {

            const manifestPath = path.join(appsPath, folder, 'manifest.json');
            const dockerfiles = fs.readdirSync(path.join(appsPath, folder)).filter(file => file.toLowerCase().startsWith('dockerfile'));

            let obj = { id: folder, dockerfiles: [] };

            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

                    this.actions = new Actions(manifest.actions, self.settings, self.app.title, self.app.namespace);

                    obj = { ...obj, ...manifest };
                } catch (error) {
                    console.error(`Error reading manifest.json in folder ${folder}:`, error);
                }
            }

            if (dockerfiles.length > 0) {
                obj.dockerfiles = dockerfiles.map(dockerfile => {
                    const dockerfilePath = path.join(appsPath, folder, dockerfile);
                    return { name: dockerfile, content: this.actions.apply("firstView", fs.readFileSync(dockerfilePath, 'utf8')) };
                });
            }

            return obj;

        }).filter(app => app !== null);
    }

    loadEmptyImage() {


    }

    renderDockerfile() {

        const textareas = this.modal.querySelectorAll("textarea[id^='dockerfile-']");
        textareas.forEach(textarea => {
            const editor = ace.edit(textarea, {
                maxLines: 20,
                minLines: 10,
                fontSize: 14,
                theme: 'ace/theme/monokai',
                mode: 'ace/mode/sh',
                tabSize: 4
            });

            editor.setValue(textarea.innerHTML);
            editor.clearSelection();
        });
    }
}