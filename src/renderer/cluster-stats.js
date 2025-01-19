'use strict';

import global from '../assets/js/global.js'
import { __html, html, attr, toast, initBreadcrumbs, getKenzapSettings, onClick, hideLoader } from '../assets/js/helpers.js'
import { NavigationHeader } from '../assets/js/navigation-header.js'
// import { EdgeStatus } from '../assets/js/app-status.js'
import { Footer } from '../assets/js/app-footer.js'
import { parseErrorResult, parseWarningResult, parseInstallResult } from '../assets/js/cluster-kubernetes-helpers.js'
import { ClusterNodeList } from '../assets/js/cluster-node-list.js'
import { ClusterNodeStats } from '../assets/js/cluster-node-stats.js'
import { ClusterDeployments } from '../assets/js/cluster-deployments.js'
import { Home } from './home.js'
import { ClusterList } from './cluster-list.js'
import { DevTools, run_ssh_script } from '../assets/js/dev-tools.js'
import fs from "fs"
import path from 'path';
import "../assets/libs/gstatic.com_charts_loader.js"
import "../assets/libs/bootstrap.5.0.2.1.0.min.css"
import "../assets/scss/app.css"
import "../assets/scss/settings.css"

/** 
 * Settings class. App settings page.
 * Inits configuration components of:
 * Dockerfile, endpoints, data centers, users, app resources.
 *
 * @link 
 * @since 1.0.0
 *
 * @package Kenzap
 */
export class ClusterStats {

    constructor(id) {

        this.settings = getKenzapSettings();

        this.cluster = this.settings.clusters.filter(cluster => cluster.id == id)[0];

        // load this page
        this.init();
    }

    init() {

        this.view();

        // init header
        global.state.nav = new NavigationHeader(global);
        global.state.nav.init();

        // node stats
        global.state.clusterNodeList = new ClusterNodeList(this.cluster);
        global.state.clusterNodeList.init();

        // node stats
        global.state.clusterNodeStats = new ClusterNodeStats(this.cluster);
        global.state.clusterNodeStats.init();

        // docker file
        global.state.clusterDeployments = new ClusterDeployments(this.cluster);
        global.state.clusterDeployments.init();

        // init dev tools listeners
        global.state.devTools = new DevTools(global);
        global.state.devTools.init();

        // init
        global.state.footer = new Footer(global);
        global.state.footer.init();

        // initiate breadcrumbs
        initBreadcrumbs(
            [
                { link: '#home', cb: () => { new Home() }, text: __html('Home') },
                { link: '#apps', cb: () => { new ClusterList() }, text: __html('Clusters') },
                { text: this.cluster.name }
            ]
        );

        // init edge status
        // global.state.edgeStatus = new EdgeStatus(global);
        // global.state.edgeStatus.init();

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
                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="currentColor" title="${__html("Open folder")}" class="bi bi-play-circle d-none form-text m-0 me-3 po open-folder " viewBox="0 0 16 16" data-id="">
                            <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a2 2 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139q.323-.119.684-.12h5.396z"/>
                        </svg>
                        <a style="margin-right:16px;" class="preview-link nounderline d-none" target="_blank" href="#">${__html('template')}<i class="mdi mdi-monitor"></i></a>
                        <button class="btn btn-primary d-flex align-items-center mt-md-0 mt-2 cluster-dashboard" type="button">
                            <span class="d-flex" role="status" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bar-chart-line my-0 po me-2" viewBox="0 0 16 16">
                                    <path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1zm1 12h2V2h-2zm-3 0V7H7v7zm-5 0v-3H2v3z"/>
                                </svg>
                            </span>
                            ${__html('Dashboard')}
                        </button>
                    </div>
                </div>
                <div class="row-">
                    <div class="col-lg-12- grid-margin- stretch-card- ">
                        <div class="card- border-white- shadow-sm-">
                            <div class="card-body- p-0">
                                <div class="px-2- mt-2">
                                    <div class="d-flex ">
                                        <div class="edge-status ${attr(this.cluster.status)}" data-id="${attr(this.cluster.id)}"></div>
                                        <div class="timgc app-settings" data-id="${attr(this.cluster.id)}">
                                            <a href="#">
                                            ${`<img src="https://cdn.kenzap.com/loading.png" data-srcset="https://cdn.kenzap.com/loading.png" class="img-fluid rounded" alt="Events placeholder" srcset="https://cdn.kenzap.com/loading.png">`}
                                            </a>
                                        </div>
                                        <div class="ms-3">
                                            <div>
                                                <div class="d-flex align-items-center justify-content-start">
                                                    <h4 class="card-title mb-0 me-3 text-accent">${__html('%1$', this.cluster.name)}</h4>
                                                    <div><div class="badge dev-badge bg-danger fw-light po card-title mb-0 ${this.cluster.status == 'sync' ? "" : "d-none"}" data-id="${attr(this.cluster.id)}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div></div>
                                                </div>
                                                <p class="form-text mt-0 mb-0">${__html('This cluster has <a href="#">%1$</a> active nodes.', this.cluster.nodes ? this.cluster.nodes.length : (this.cluster.servers ? this.cluster.servers.length : "0"))}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <p class="form-text">
                                        <p class="form-text d-none">${__html('This app operates in <a href="#">%1$</a> namespace.', this.cluster.name)}</div>
                                        <pre id="console-output" class="console-output form-text">${global.state.console ? global.state.console : ""}</pre>
                                    </p>
                                    
                                    <cluster-node-list></cluster-node-list>
                                    <cluster-node-stats></cluster-node-stats>
                                    <cluster-deployments></cluster-deployments>
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

        onClick('.cluster-dashboard', e => {

            if (this.dashboardRequested) return;

            this.dashboardRequested = true;

            if (!this.dashboardServer) this.dashboardServer = 0;

            e.preventDefault();

            parseWarningResult(__html("Launching Kubernetes dashboard in node %1$, please wait...", this.cluster.servers[this.dashboardServer].server));

            let sh = fs.readFileSync(path.join(__dirname, "../assets/templates/sh/launch-kubernetes-dashboard.sh")).toString();

            let cb = (data) => {

                this.dashboardRequested = false;

                // console.log(data.toString());

                let result = parseInstallResult(data.toString());

                if (result.success) {

                    parseWarningResult(__html("Please use this token: %1$", result.token));

                    setTimeout(() => { require('electron').shell.openExternal(`https://${this.cluster.servers[this.dashboardServer].server}:10443/`); }, 3000);

                    // console.log(result.token);
                }
            }

            // setTimeout(() => { console.log("SSH init A"); }, 1000);

            this.server = this.cluster.servers[this.dashboardServer];

            const conn = run_ssh_script(sh, "launch-kubernetes-dashboard.sh", this.server, cb, 0, (error) => { this.dashboardRequested = false; console.log(error); }, () => { }, 60 * 60 * 1000);

            // setTimeout(() => { console.log("SSH Force close."); conn.end(); }, 20000);
        });
    }
}