
import { __html, attr, getKenzapSettings, saveKenzapSettings, log } from './helpers.js'
import { getAppRegistry, updateDevspace, deleteRegistryTag, updateApp } from './app-registry-helpers.js'
import fs from "fs"
import * as path from 'path';
import * as ace from 'ace-builds/src-noconflict/ace';
import 'ace-builds/webpack-resolver'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/mode-javascript'

export class AppCustomControls {

    constructor(global) {

        this.selector = "app-custom-controls";

        this.global = global;

        this.app = this.global.state.app;

        this.editors = [];

        log("AppCustomControls", this.app);
    }

    view() {

        console.log("AppCustomControls view", this.app.dockerfiles);

        document.querySelector(this.selector).innerHTML = `
            <div class="col-sm-7 pt-3 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Dockerfile')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary  d-none" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                </div>
                <p class="form-text">${__html('This dockerfile uses <a href="#">%1$</a> template.', this.app.name)}</p>
              
                ${this.app.dockerfiles.map(dockerfile => `
                <div class="docker-editor mb-3">
                    <label for="dockerfile-${attr(this.app.id)}-${attr(dockerfile.name)}" class="form-label d-none">${__html(dockerfile.name)}</label>
                    <textarea id="dockerfile-${attr(this.app.id)}-${attr(dockerfile.name)}" type="text" autocomplete="off" rows="10" class="form-control monospace">${attr(dockerfile.content)}</textarea>
                </div>
                `).join('')}
                <div class="clearfix"></div>

            </div>
            `;

        this.renderDockerfile();
    }

    renderDockerfile() {

        const textareas = document.querySelectorAll("textarea[id^='dockerfile-']");
        textareas.forEach(textarea => {
            const editor = ace.edit(textarea, {
                maxLines: 20,
                minLines: 10,
                fontSize: 14,
                theme: 'ace/theme/monokai',
                mode: 'ace/mode/sh',
                tabSize: 4
            });

            editor.setValue(textarea.value);
            editor.clearSelection();

            this.editors.push(editor);
        });
    }

    getDockerfiles() {

        let dockerfiles = [];

        this.editors.forEach(editor => {
            dockerfiles.push({
                name: editor.container.id.split('-').slice(2).join('-'),
                content: editor.getValue()
            });
        });

        return dockerfiles;
    }

    save() {

        let settings = getKenzapSettings();

        saveKenzapSettings({ id: settings.id, registry: this.registry });

        updateDevspace(this.global.state.app, this.registry);

        updateApp(this.global.state.app, this.registry);
    }

    init() {

        this.settings = getKenzapSettings();

        if (this.settings.registry) this.registry = this.settings.registry;

        // if (!this.settings.registry) 
        getAppRegistry(this.global.state.app, (registry) => {

            // console.log(this.registry, registry);

            this.registry = registry;

            this.view();
        });

        this.view();

        this.cleanup();
    }

    cleanup() {

        let tag = "";

        if (this.global.state.app.tags) {

            tag = this.global.state.app.tags[this.global.state.app.tags.length - 1];

            // console.log("removing tag", tag);

            deleteRegistryTag(this.global.state.app, tag);
        }
    }
}
