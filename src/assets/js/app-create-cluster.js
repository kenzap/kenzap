
import global from "./global.js"
import { __html, attr, onClick, kenzapdir, getDefaultAppPath, toast, simulateClick, getKenzapSettings } from './helpers.js'
import { AppCreateImage } from './app-create-image.js'
import { AppClusterPicker } from './app-cluster-picker.js'
import { getAppRegistry } from './app-registry-helpers.js'
import { provisionClusterApp } from './app-create-helpers.js'
import { provisionClusterAppLocal } from './app-create-local-helpers.js'
import fs from "fs"
import * as path from 'path';
import { Settings } from '../../../src/renderer/app-settings.js'
import { log } from "console"

/**
 * Class representing an App Create Dialog where user proivdes app name.
 */
export class AppCreateCluster {

    constructor(app) {

        this.app = app;

        this.settings = getKenzapSettings();

        this.init();
    }

    init() {

        this.view();

        // preload app registry for app deployment
        if (!this.app.registry) getAppRegistry(this.app, (registry) => {

            this.app.registry = registry;
        });
    }

    view() {

        // get modal html
        this.modal = document.querySelector(".modal");

        // set wide screen
        document.querySelector(".modal-dialog").classList.add("modal-lg");

        document.querySelector(".modal-title").innerHTML = __html("Deployment");

        this.modal.querySelector(".modal-body").innerHTML = `
            <div class="form-group my-5 py-5 text-center-">
                <div class="m-auto" style="max-width: 500px;">
                    <label for="app-title d-none" class="form-label h5 d-none">${__html('App Name')}</label>
                    <console-output-modal class="form-text text-start"></console-output-modal>
                    <app-cluster-picker></app-cluster-picker>
                    <div class="invalid-feedback">${__html('Please provide a valid app name.')}</div>
                </div>
            </div>
            `;

        // footer buttons
        document.querySelector(".modal-footer").innerHTML = `
            <button id="btn-close" type="button" class="btn btn-outline-dark d-none close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Close")}</button>
            <div class="btn-group" role="group" aria-label="Basic example">
                <button id="btn-middle" type="button" class="btn btn-outline-dark app-picker-back" tabindex="-1">${__html("Back")}</button>
                <button id="btn-primary" type="button" class="btn btn-outline-primary app-picker-next btn-app-create" tabindex="-1">${__html("Continue")}</button>
            </div>
            `;

        // next action listener
        onClick(".app-picker-next", e => {

            e.preventDefault();

            if (this.loading) return;

            // block ui
            this.setLoading(true);

            document.querySelector('app-cluster-picker').classList.add('d-none');

            // structure app data
            this.app.id = this.app.slug;
            this.app.description = "";
            this.app.keywords = "";
            this.app.ui = "";
            this.app.new = true;
            this.app.status = "0";
            this.app.project = global.state.project || "";
            this.app.path = path.join(kenzapdir, this.app.slug);
            this.app.clusters = this.appClusterPicker.get();

            log(this.app);

            // return;

            // validate data
            if (!getDefaultAppPath()) { alert(__html('Application path can not be created.')); return; }

            if (this.app.clusters.length == 0) { alert(__html('Please select cluster.')); return; }

            if (this.app.registry.domain.length == 0) { alert(__html('Can not continue without docker registry.')); return; }

            if (this.app.clusters.length == 0) { alert(__html('Please select your cluster')); return; }

            // create app folder if not exists
            if (!fs.existsSync(this.app.path)) { fs.mkdirSync(this.app.path); }

            // create app in production cluster
            if (this.app.clusters[0] != 'local') provisionClusterApp(this.app, (msg, app) => {

                simulateClick(document.querySelector(".close-modal"));

                // Close the modal
                new Settings(app.id);
            });

            // create app in local cluster
            if (this.app.clusters[0] == 'local') provisionClusterAppLocal(this.app, (msg, app) => {

                simulateClick(document.querySelector(".close-modal"));

                // Close the modal
                new Settings(app.id);
            });
        });

        this.appClusterPicker = new AppClusterPicker(this.app);
        this.appClusterPicker.init();

        // previous action listener
        onClick(".app-picker-back", e => {

            if (this.loading) return;

            new AppCreateImage(this.app);
        });
    }

    setLoading(state) {

        if (state) {

            document.querySelector('.btn-app-create').innerHTML = `
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                ${__html('Creating...')}
            `;

            this.loading = true;

        } else {

            setTimeout(() => {

                if (document.querySelector('.btn-app-create')) document.querySelector('.btn-app-create').innerHTML = `
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle me-2" viewBox="0 0 16 16">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>  
                    </span>
                    ${__html('Create')}
                    `;
            }, 3000);

            this.loading = false;

            hideLoader();
        }
    }
}