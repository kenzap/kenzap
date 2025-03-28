
import global from "./global.js"
import { __html, attr, onClick, getDefaultAppPath, toast, getToken, getKenzapSettings, saveKenzapSettings, onKeyUp, onChange, log } from './helpers.js'
import { appList } from './app-picker-list.js'
import { Actions } from './app-actions.js'
import "../scss/app-picker.css"
import { Settings } from '../../renderer/app-settings.js'
import { AppCreate } from '../../renderer/app-create.js'
import * as ace from 'ace-builds/src-noconflict/ace';
import 'ace-builds/webpack-resolver'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/mode-javascript'
import { on } from "events"
import fs from "fs"
import * as path from 'path';
import slugify from 'slugify'

/**
 * Class representing an App Picker dialog.
 * 1. Select an app from the list of available apps.
 * 2. Provide app title.
 * 3. View the app's image template.
 */
export class AppPicker {

    constructor(global) {

        this.apps = [];

        this.settings = getKenzapSettings();

        this.init();
    }

    init() {

        this.selectApp();
    }

    selectApp() {

        // get modal html
        this.modal = document.querySelector(".modal");

        // set wide screen
        document.querySelector(".modal-dialog").classList.add("modal-lg");

        // set product modal title
        document.querySelector(".modal-title").innerHTML = __html("Apps");

        // set product modal body
        this.modal.querySelector(".modal-body").innerHTML = `
            <div class="form-cont">
                <div class="form-group- mt-3">
                    <div class="form-group- mt-1">
                        <div class="name-cont form-group d-none">
                            <label for="env-name">${__html('Search..')}</label>
                            <div class="input-name mb-0">
                                <div class="card-title d-flex align-items-center justify-content-between bd-highlight">
                                    <input id="project-name" type="text" class="project-name form-control" value="${""}" placeholder="${__html('Node.js')}" >
                                    <div class="d-flex ms-2 po d-none" role="status" aria-hidden="true">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-plus-circle po add-project-btn ms-2 form-text" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16">
                                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                                        </svg>
                                    </div>
                                </div
                                <div class="invalid-feedback env-name-notice"></div>
                                <p class="form-text d-none-">${__html("Search app template by name.")}</p>
                            </div>
                        </div>
                        <div class="apps-cont mb-3">
                            <div class="app-picker-list">

                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;

        // bg gradient
        document.querySelector(".modal-content").classList.add("bg-gradient");
        document.querySelector(".modal-content").classList.add("bg-light");

        // footer buttons
        document.querySelector(".modal-footer").innerHTML = `
        <div class="btn-group-" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Cancel")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary save-projects d-none" data-bs-dismiss="modal" tabindex="-1">${__html("Create")}</button>
        </div>
        `;

        this.modal.querySelector("#project-name").focus();

        // render HTML
        this.selectAppTable();

        // next action listener
        onClick(".app-icon-container", e => {

            e.preventDefault();

            let i = e.currentTarget.dataset.i;

            this.app = appList[i];

            this.provideTitle();
        });
    }

    selectAppTable() {
        this.modal.querySelector(".app-picker-list").innerHTML = appList.map((app, i) => {
            return `
                <div class="app-icon-container text-center d-inline-block m-3" data-i="${i}">
                    <div class="app-icon" data-id="${attr(app.image)}" data-i="${i}">
                        <img src="${attr(app.icon)}" alt="${attr(app.name)}" class="img-fluid rounded" style="width: 64px; height: 64px; border-radius: 15px;">
                    </div>
                    <div class="app-name mt-2" >${app.name}</div>
                </div>
            `;
        }).join('');
    }

    provideTitle() {

        document.querySelector(".modal-title").innerHTML = __html("App Name");

        this.modal.querySelector(".modal-body").innerHTML = `
            <div class="form-group my-5 py-5 text-center-">
                <div class="m-auto" style="max-width: 500px;">
                    <label for="app-title" class="form-label h5 d-none">${__html('App Name')}</label>
                    <input id="app-title" type="text" class="form-control form-control-lg mx-auto" placeholder="${__html('Enter app name')}" value="${attr(this.title ? this.title : "")}" />
                    <div class="invalid-feedback">${__html('Please provide a valid app name.')}</div>
                </div>
            </div>
            `;

        this.modal.querySelector("#app-title").focus();

        // footer buttons
        document.querySelector(".modal-footer").innerHTML = `
        <div class="btn-group" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark app-picker-back" tabindex="-1">${__html("Back")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary app-picker-next" tabindex="-1">${__html("Continue")}</button>
        </div>
        `;

        // next action listener
        onClick(".app-picker-next", e => {

            let title = document.querySelector("#app-title").value;
            this.title = title;
            this.namespace = slugify(title.toLowerCase(), { remove: /[.,/#!$%^&*;:{}=\_`~()]/g });

            if (title.length < 2 || this.namespace < 2) {
                document.querySelector("#app-title").classList.add("is-invalid");
                return;
            }

            this.viewImages();
        });

        // previous action listener
        onClick(".app-picker-back", e => {
            this.init();
        });
    }

    loadImages() {

        const appsPath = path.join(__dirname, "..", "templates", "apps", this.app.image);
        const folders = fs.readdirSync(appsPath).filter(folder => {
            const folderPath = path.join(appsPath, folder);
            return fs.statSync(folderPath).isDirectory();
        });

        // log(folders);

        this.apps = folders.map(folder => {

            const manifestPath = path.join(appsPath, folder, 'manifest.json');
            const dockerfiles = fs.readdirSync(path.join(appsPath, folder)).filter(file => file.toLowerCase().startsWith('dockerfile'));

            // log(dockerfiles);

            let obj = { id: folder, dockerfiles: [] };

            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

                    this.actions = new Actions(manifest.actions, this.settings, this.title, this.namespace);

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

        // log(this.apps)
    }

    viewImages() {

        this.loadImages();

        document.querySelector(".modal-title").innerHTML = __html("Configurations");

        this.modal.querySelector(".modal-body").innerHTML = this.apps.map((app, i) => {

            // log(app);

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
        <div class="btn-group-" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal app-title-back" tabindex="-1">${__html("Back")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary save-projects d-none" data-bs-dismiss="modal" tabindex="-1">${__html("Continue")}</button>
        </div>
        `;

        onClick(".app-title-back", e => {
            this.provideTitle();
        });

        onClick(".select-app-btn", e => {

            e.preventDefault();

            let i = e.currentTarget.dataset.i;

            this.apps[i].actions = this.actions;
            this.apps[i].image = this.app.image;
            this.apps[i].title = this.title;
            this.apps[i].namespace = this.namespace;
            this.apps[i].icon = this.app.icon;

            // log(this.apps[i]);

            document.querySelector(".btn-close").click();

            new AppCreate(this.apps[i]);
        });

        this.renderDockerfile();
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