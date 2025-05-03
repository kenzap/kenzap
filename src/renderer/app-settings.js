'use strict';

import { ipcRenderer } from 'electron'
import global from '../assets/js/global.js'
import { __html, html, attr, toast, initBreadcrumbs, cacheSettings, getDefaultAppPath, getKenzapSettings, hideLoader, log } from '../assets/js/helpers.js'
import { AppClusterPicker } from '../assets/js/app-cluster-picker.js'
import { DockerFile } from '../assets/js/app-docker-file.js'
import { Endpoints } from '../assets/js/app-endpoints.js'
import { AppRegistry } from '../assets/js/app-registry.js'
import { NavigationHeader } from '../assets/js/navigation-header.js'
import { getAppList, getAppIcon } from '../assets/js/app-list-helpers.js'
import { AppStats } from '../assets/js/app-stats.js'
import { AppResources } from '../assets/js/app-resources.js'
import { AppStatus } from '../assets/js/app-status.js'
import { Footer } from '../assets/js/app-footer.js'
import { isPathValid, getAppDetails } from '../assets/js/app-settings-helpers.js'
import { Home } from './home.js'
import { AppList } from './app-list.js'
import { DevTools, toggleDepIconState } from '../assets/js/dev-tools.js'
import slugify from 'slugify'
import "../assets/libs/gstatic.com_charts_loader.js"
import "../assets/libs/bootstrap.5.0.2.1.0.min.css"
import "../assets/scss/app.css"
import "../assets/scss/settings.css"
import * as path from 'path';
import fs from "fs"

/** 
 * Settings class. App settings page.
 * Inits configuration components of:
 * Dockerfile, Endpoints, Clusters, Users, App resources, etc
 *
 * @link 
 * @since 1.0.0
 *
 * @package Kenzap
 */
export class Settings {

    constructor(id) {

        global.state.page = "app-settings";

        if (!global.state.pub[id]) global.state.pub[id] = {}

        // load this page
        this.init(id);
    }

    init(id) {

        this.settings = getKenzapSettings();

        // set scroll to top
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });

        // get app list
        this.apps = getAppList();
        global.state.apps = this.apps;

        // get app data
        this.app = this.apps.filter(app => app.id == id)[0];
        this.app.ui = "";
        global.state.app = this.app;

        log("App settings", this.app);

        this.view();

        // data centers
        this.appClusterPicker = new AppClusterPicker(this.app);
        this.appClusterPicker.init();

        // init header
        this.nav = new NavigationHeader(global);
        this.nav.init();

        // edge clusters
        this.appStats = new AppStats(global);
        this.appStats.init();

        // docker file
        this.endpoints = new Endpoints(this.app);
        this.endpoints.init();

        // docker file
        this.dockerFile = new DockerFile(global);
        this.dockerFile.init();

        // app registry
        this.appRegistry = new AppRegistry(global);
        this.appRegistry.init();

        // init dev tools listeners
        this.devTools = new DevTools(global);
        this.devTools.init();

        // init dev tools listeners
        this.appResources = new AppResources(global);

        // init
        this.footer = new Footer(global);
        this.footer.init();

        // initiate breadcrumbs
        initBreadcrumbs(
            [
                { link: '#home', cb: () => { new Home() }, text: __html('Home') },
                { link: '#apps', cb: () => { new AppList() }, text: __html('Apps') },
                { text: this.app.title }
            ]
        );

        // show message if any from previous methods
        if (global.state.msg) { toast(html(global.state.msg)); global.state.msg = ""; }

        // init edge status
        this.edgeStatus = new AppStatus(global);
        this.edgeStatus.init();

        // missing path warning
        isPathValid();

        // show save message
        if (global.state.updated) toast(__html('Application updated')); global.state.updated = false;

        this.listeners();

        hideLoader();
    }

    view() {

        document.querySelector('body').innerHTML = `
            <navigation-header></navigation-header>
            <div class="container p-edit app-settings">
                <div class="app-warnings">

                </div>
                <div class="d-flex justify-content-between bd-highlight mb-3">
                    <nav class="bc" aria-label="breadcrumb"></nav>
                    <div class="d-flex align-items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="currentColor" title="${__html("Open folder")}" class="bi bi-play-circle form-text m-0 me-3 po open-folder " viewBox="0 0 16 16" data-id="${attr(this.app.id)}">
                            <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a2 2 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139q.323-.119.684-.12h5.396z"/>
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="currentColor" title="${__html("Stop development mode")}" class="bi bi-stop-circle text-danger m-0 me-3 po stop-dev-app ${global.state.dev[this.app.id].status == "sync" ? "" : "d-none"}" viewBox="0 0 16 16" data-id="${attr(this.app.id)}">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                            <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h3A1.5 1.5 0 0 1 11 6.5v3A1.5 1.5 0 0 1 9.5 11h-3A1.5 1.5 0 0 1 5 9.5v-3z"/>
                        </svg>
                        <div class="dropdown devToolsSyncCont d-flex" data-id="${attr(this.app.id)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="currentColor" title="${__html("Start development mode")}" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" class="bi bi-play-circle form-text m-0 me-3 po start-dev-app dropdown-toggle ${global.state.dev[this.app.id].status == "stop" ? "" : "d-none"}" viewBox="0 0 16 16" data-id="${attr(this.app.id)}">
                                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                            </svg>
                            <ul class="dropdown-menu mt-1" aria-labelledby="devToolsSyncCont"></ul>
                        </div>
                        <div class="dropdown devToolsConsoleCont d-flex" data-id="${attr(this.app.id)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="currentColor" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" class="bi bi-terminal form-text m-0 me-3 po start-terminal" viewBox="0 0 16 16" data-id="${attr(this.app.id)}">
                                <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm9.5 5.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1m-6.354-.354a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2a.5.5 0 1 0-.708.708L4.793 6.5z"/>
                            </svg>
                            <ul class="dropdown-menu mt-1" aria-labelledby="devToolsConsoleCont" ></ul>
                        </div>
                        <div class="dropdown devToolsPublishCont d-flex" data-id="${attr(this.app.id)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" fill="currentColor" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" class="bi bi-cloud-arrow-up form-text m-0 me-3 po app-deploy app-publish" data-id="${attr(this.app.id)}" viewBox="0 0 16 16">
                                <path fill-rule="evenodd" d="M7.646 5.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 6.707V10.5a.5.5 0 0 1-1 0V6.707L6.354 7.854a.5.5 0 1 1-.708-.708z"/>
                                <path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z"/>
                            </svg>
                            <ul class="dropdown-menu mt-1" aria-labelledby="devToolsPublishCont" ></ul>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="currentColor" class="bi bi-stop-circle text-danger form-text m-0 me-3 po d-none app-deploy app-stop-publish" data-id="${attr(this.app.id)}" viewBox="0 0 16 16">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
                            <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h3A1.5 1.5 0 0 1 11 6.5v3A1.5 1.5 0 0 1 9.5 11h-3A1.5 1.5 0 0 1 5 9.5z"/>
                        </svg>
                        <a style="margin-right:16px;" class="preview-link nounderline d-none" target="_blank" href="#">${__html('template')}<i class="mdi mdi-monitor"></i></a>
                        <button class="btn btn-primary ms-1 app-save" type="button">${__html('Save')}</button>
                    </div>
                </div>
                <div class="row-">
                    <div class="col-lg-12- grid-margin- stretch-card- ">
                        <div class="card- border-white- shadow-sm-">
                            <div class="card-body- p-0">
                                <div class="px-2- mt-2">

                                    <div class="d-flex ">
                                        <div class="edge-status ${attr(global.state.dev[this.app.id].edgeStatus)}" data-id="${attr(this.app.id)}"></div>
                                        <div class="d-flex align-items-center justify-content-start">
                                            <div class="timgc app-settings icon-md" data-id="${attr(this.app.id)}">
                                                <a href="#">
                                                    ${getAppIcon(this.app)}
                                                </a>
                                            </div>
                                            <div class="ms-3">
                                                <div>
                                                    <div class="d-flex align-items-center justify-content-start">
                                                        <h4 class="card-title mb-0 me-3 text-accent">${__html('%1$', this.app.title)}</h4>
                                                        <div><div class="badge dev-badge bg-danger fw-light po card-title mb-0 ${global.state.dev[this.app.id].status == 'sync' ? "" : "d-none"}" data-id="${attr(this.app.id)}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div></div>
                                                    </div>
                                                    <p class="form-text mt-0 mb-0">${__html('This app operates in <a href="#">%1$</a> namespace.', this.app.slug)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <p class="form-text">
                                        <p class="form-text d-none">${__html('This app operates in <a href="#">%1$</a> namespace.', this.app.slug)}</div>
                                        <pre id="console-output" class="console-output form-text">${global.state.console ? global.state.console : ""}</pre>
                                    </p>
                                    <div class="col-sm-7">
                                        <h5 class="card-title d-none">${__html('General')}</h5>
                                        <p class="form-text d-none">${__html('About this application.')}</p>
                                        <div class="mb-3 row pt-2 d-none-">
                                            <label for="appTitle" class="col-sm-3 col-form-label">${__html('Title')}</label>
                                            <div class="col-sm-9">
                                                <input type="text" class="form-control" id="appTitle" value="${attr(this.app.title || "")}" >
                                            </div>
                                        </div>
                                        <div class="mb-3 row ${this.settings.projects.length > 1 ? "" : "d-none-"}">
                                            <label for="appProject" class="col-sm-3 col-form-label">${__html('Project')}</label>
                                            <div class="col-sm-9">
                                                <select id="appProject" class="form-select project-select form-select-lg- mb-0" aria-label="Large select example" style="width:100%;">
                                                    ${this.settings.projects.map((p, i) => {

            return `<option ${p.id == this.app.project ? 'selected' : ''} value="${attr(p.id)}">${html(p.project)}</option>`

        }).join('')
            }
                                                </select>
                                            </div>
                                        </div>
                                        <div class="mb-3 row d-none">
                                            <label for="appKeywords" class="col-sm-3 col-form-label ">${__html('Keywords')}</label>
                                            <div class="col-sm-9">
                                                <input type="text" class="form-control" id="appKeywords" value="${attr(this.app.keywords || "")}">
                                            </div>
                                        </div>
                                        <div class="mb-3 row">
                                            <label for="appDescription" class="col-sm-3 col-form-label">${__html('Description')}</label>
                                            <div class="col-sm-9">
                                                <input type="text" class="form-control" id="appDescription" value="${attr(this.app.description || "")}">
                                            </div>
                                        </div>
                                        <div class="mb-3 row">
                                            <label for="appPath" class="col-sm-3 col-form-label">${__html('Local path')}</label>
                                            <div class="col-sm-9">
                                                <input type="text" class="form-control bg-white" id="appPath" value="${attr(this.app.path || getDefaultAppPath() + require('path').sep + this.app.id)}" readonly>
                                            </div>
                                        </div>
                                    </div>
                                    <app-stats></app-stats>
                                    <app-endpoints></app-endpoints>
                                    <app-cluster-picker></app-cluster-picker>
                                    <app-registry></app-registry>
                                    <docker-file></docker-file>
                                    <app-users></app-users>
                                    <app-resources></app-resources>
                                    <div class="col-sm-7 pt-3 pb-3 d-none">
                                        <h5 class="card-title">${__html('Footprint')}</h5>
                                        <p class="form-text">${__html('Your app`s regional footprint, used for compliance and edge computing.')}</p>
                                        <div class="map-regions">

                                        </div>
                                        <div class="clearfix"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <app-footer></app-footer>
        `;
    }

    listeners() {

        // app save listener
        document.querySelector('.app-save').addEventListener('click', e => {

            e.preventDefault();

            // add data
            let data = {
                id: this.app.id,
                title: document.querySelector('#appTitle').value.trim(),
                slug: slugify(this.app.title.toLowerCase(), { remove: /[.,/#!$%^&*;:{}=\_`~()]/g }),
                project: document.querySelector('#appProject').value,
                description: document.querySelector('#appDescription').value.trim(),
                keywords: document.querySelector('#appKeywords').value,
                path: document.querySelector('#appPath').value,
                endpoints: this.endpoints.get(),
                resources: this.appResources.get(),
                clusters: this.appClusterPicker.get(),
                dockerfiles: this.dockerFile.get(),
                app: getAppDetails(this.app.id),
                users: [],
            };

            // console.log("App data", data); return;

            // Remove all files that start with kubeconfig in the app folder, except those in data.clusters
            const clusterIds = data.clusters.map(id => `kubeconfig-${id}.yaml`);
            fs.readdirSync(data.path).forEach(file => {
                if (file.startsWith('kubeconfig') && !clusterIds.includes(file)) {
                    const filePath = path.join(data.path, file);
                    fs.unlinkSync(filePath);
                    log(`Removed kubeconfig file: ${filePath}`);
                }
            });

            // Copy kubeconfig from app folder only if missing in clusterIds
            data.clusters.forEach(id => {

                if (id == "local") return;

                let appFolder = getDefaultAppPath() + require('path').sep + '.kenzap';
                const kubeconfigSource = path.join(appFolder, `kubeconfig-${id}.yaml`);
                const kubeconfigDestination = path.join(data.path, `kubeconfig-${id}.yaml`);

                console.log("Copying kubeconfig from: ", kubeconfigSource);

                if (!fs.existsSync(kubeconfigDestination) && fs.existsSync(kubeconfigSource)) {
                    fs.copyFileSync(kubeconfigSource, kubeconfigDestination);
                    log(`Kubeconfig copied from ${kubeconfigSource} to ${kubeconfigDestination}`);
                } else if (!fs.existsSync(kubeconfigSource)) {
                    log(`Kubeconfig file not found at ${kubeconfigSource}`);
                }
            });

            // // Copy kubeconfig from parent folder /.kenzap
            // let appFolder = getDefaultAppPath() + require('path').sep + '.kenzap';

            // const kubeconfigSource = path.join(appFolder, `kubeconfig-${id}.yaml`);
            // const kubeconfigDestination = path.join(data.path, `kubeconfig-${id}.yaml`);

            // if (fs.existsSync(kubeconfigSource)) {
            //     fs.copyFileSync(kubeconfigSource, kubeconfigDestination);
            //     log(`Kubeconfig copied from ${kubeconfigSource} to ${kubeconfigDestination}`);
            // } else {
            //     log(`Kubeconfig file not found at ${kubeconfigSource}`);
            // }

            this.appRegistry.save();

            this.endpoints.save();

            this.dockerFile.save();

            cacheSettings(data);

            global.state.msg = "Application updated";

            this.destroy();

            this.init(data.id);
        });

        // path picker
        document.querySelector('#appPath').addEventListener('click', e => {

            e.preventDefault();

            ipcRenderer.invoke("pick-folder", []).then(returnValue => {

                if (!returnValue.filePath) return;

                let pathArr = returnValue.filePath.split('/');
                pathArr.pop();
                let path = pathArr.join('/');

                document.querySelector("#appPath").value = path;
            });
        });

        toggleDepIconState(this.app.id);
    }

    destroy() {

        this.appStats.destroy();

        this.dockerFile.destroy();
    }
}