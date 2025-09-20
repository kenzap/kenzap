'use strict';

import global from '../assets/js/global.js';
import { __html, attr, getKenzapSettings, hideLoader, initBreadcrumbs, onClick } from '../assets/js/helpers.js';
import { NavigationHeader } from '../assets/js/navigation-header.js';
// import { EdgeStatus } from '../assets/js/app-status.js'
import fs from "fs";
import path from 'path';
import { Footer } from '../assets/js/app-footer.js';
import { ClusterDeployments } from '../assets/js/cluster-deployments.js';
import { getClusterKubeconfig, parseInstallResult, parseWarningResult } from '../assets/js/cluster-kubernetes-helpers.js';
import { ClusterNodeList } from '../assets/js/cluster-node-list.js';
import { ClusterNodeStats } from '../assets/js/cluster-node-stats.js';
import { DevTools, getKubectlPath, run_script, run_ssh_script } from '../assets/js/dev-tools.js';
import "../assets/libs/bootstrap.5.0.2.1.0.min.css";
import "../assets/libs/gstatic.com_charts_loader.js";
import "../assets/scss/app.css";
import "../assets/scss/settings.css";
import { ClusterList } from './cluster-list.js';
import { Home } from './home.js';

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
                        <div class="dropdown me-3">
                            <button class="btn btn-primary d-flex align-items-center mt-md-0 mt-2 dropdown-toggle" type="button" id="clusterActionsDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                                <span class="d-flex" role="status" aria-hidden="true">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bar-chart-line my-0 po me-2" viewBox="0 0 16 16">
                                        <path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1zm1 12h2V2h-2zm-3 0V7H7v7zm-5 0v-3H2v3z"/>
                                    </svg>
                                </span>
                                ${__html('Open')}
                            </button>
                            <ul class="dropdown-menu" aria-labelledby="clusterActionsDropdown">
                                <li><a class="dropdown-item cluster-dashboard" href="#">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bar-chart-line me-2" viewBox="0 0 16 16">
                                    <path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1zm1 12h2V2h-2zm-3 0V7H7v7zm-5 0v-3H2v3z"/>
                                    </svg>
                                    ${__html('K8s Dashboard')}
                                </a></li>
                                <li><a class="dropdown-item longhorn-ui" href="#">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-link me-2" viewBox="0 0 16 16">
                                    <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                                    <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
                                    </svg>
                                    ${__html('Longhorn')}
                                </a></li>
                                <li><a class="dropdown-item adminer-ui" href="#">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-link me-2" viewBox="0 0 16 16">
                                    <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                                    <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
                                    </svg>
                                    ${__html('Adminer')}
                                </a></li>
                            </ul>
                        </div>
                    
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

            const conn = run_ssh_script(sh, "launch-kubernetes-dashboard.sh", this.server, cb, 0, (tag, error) => { this.dashboardRequested = false; console.log(error); }, () => { }, 60 * 60 * 1000);

            // setTimeout(() => { console.log("SSH Force close."); conn.end(); }, 20000);
        });

        onClick('.longhorn-ui', e => {

            if (this.longhornRequested) return;

            this.longhornRequested = true;

            if (!this.longhornServer) this.longhornServer = 0;

            e.preventDefault();

            parseWarningResult(__html("Launching Longhorn UI in node %1$, please wait...", this.cluster.servers[this.longhornServer].server));

            let kubeconfig = getClusterKubeconfig(this.cluster.id);

            let kubectl = getKubectlPath();

            let cb = (data) => { this.longhornRequested = false; console.log(data.toString()); }

            let proc = run_script(kubectl + ' port-forward -n longhorn-system service/longhorn-frontend 8081:80 --kubeconfig=' + kubeconfig + ' ', [], cb, false, cb, cb);

            console.log(kubectl + ' port-forward -n longhorn-system service/longhorn-frontend 8081:80 --kubeconfig=' + kubeconfig + ' ')

            setTimeout(() => { require('electron').shell.openExternal(`http://127.0.0.1:8081/`); }, 1200);
        });
    }
}