'use strict';

import global from '../assets/js/global.js'
import { clipboard } from 'electron'
import { __html, html, attr, toast, initBreadcrumbs, showLoader, onClick, formatStatus, getSetting, hideLoader, getKenzapSettings, log } from '../assets/js/helpers.js'
import { checkEnvironment, deleteApp, DevTools } from '../assets/js/dev-tools.js'
import { NavigationHeader } from '../assets/js/navigation-header.js'
import { VersionControl } from '../assets/js/version-control.js'
import { getAppList } from '../assets/js/app-list-helpers.js'
import { AppProjects } from '../assets/js/app-projects.js'
import { AppStatus } from '../assets/js/app-status.js'
import { AppCreate } from './app-create.js'
import { Footer } from '../assets/js/app-footer.js'
import { Settings } from './app-settings.js'
import { ClusterList } from './cluster-list.js'
import { Home } from './home.js'
import yaml from 'js-yaml';
import fs from "fs"
import "../assets/libs/bootstrap.5.0.2.1.0.min.css"
import "../assets/scss/app.css"

/** 
 * AppList class. Load app list page.
 * Syncs data with local directory.
 *
 * @link 
 * @since 1.0.0
 *
 * @package Kenzap
 */
export class AppList {

    constructor() {

        // defaults
        global.state.page = "app-list";
        global.state.dev = {};

        // load this page
        this.init();
    }

    init() {

        this.settings = getKenzapSettings();

        // check if docker desktop and other services are working
        checkEnvironment();

        this.apps = getAppList();
        global.state.apps = this.apps;

        // log(this.apps);

        // get current project
        this.project = (this.settings.projects.find(project => project.current) || {}).id || ""

        global.state.project = this.project;

        this.view();

        // app projects
        this.appProjects = new AppProjects(global);
        this.appProjects.init();

        // header
        this.nav = new NavigationHeader(global);
        this.nav.init();

        // check dependencies
        this.nav = new VersionControl(global);
        this.nav.init();

        // footer
        this.footer = new Footer(global);
        this.footer.init();

        // initiate breadcrumbs
        initBreadcrumbs(
            [
                { link: '#home', cb: () => { new Home() }, text: __html('Home') },
                { text: __html('Apps') }
            ]
        );

        // show message if any from previous methods
        if (global.state.msg) { toast(html(global.state.msg)); global.state.msg = ""; }

        // init dev tools listeners
        this.devTools = new DevTools(global);
        this.devTools.init();

        // init edge status
        this.edgeStatus = new AppStatus(global);
        this.edgeStatus.init();

        // no records found
        if (!this.apps.length) {
            document.querySelector('.app-list').innerHTML = `
        <tr class="bg-white-">
            <td class="bg-white-" colspan="5">
                <div class="text-center m-auto" style="width:600px;">
                    <svg xmlns="http://www.w3.org/2000/svg" data-name="Layer 1" viewBox="0 0 1119.60911 699" xmlns:xlink="http://www.w3.org/1999/xlink"><title>server down</title><circle cx="292.60911" cy="213" r="213" fill="#f2f2f2"/><path d="M31.39089,151.64237c0,77.49789,48.6181,140.20819,108.70073,140.20819" transform="translate(-31.39089 -100.5)" fill="#2f2e41"/><path d="M140.09162,291.85056c0-78.36865,54.255-141.78356,121.30372-141.78356" transform="translate(-31.39089 -100.5)" fill="#1941df"/><path d="M70.77521,158.66768c0,73.61476,31.00285,133.18288,69.31641,133.18288" transform="translate(-31.39089 -100.5)" fill="#1941df"/><path d="M140.09162,291.85056c0-100.13772,62.7103-181.16788,140.20819-181.16788" transform="translate(-31.39089 -100.5)" fill="#2f2e41"/><path d="M117.22379,292.83905s15.41555-.47479,20.06141-3.783,23.713-7.2585,24.86553-1.95278,23.16671,26.38821,5.76263,26.5286-40.43935-2.711-45.07627-5.53549S117.22379,292.83905,117.22379,292.83905Z" transform="translate(-31.39089 -100.5)" fill="#a8a8a8"/><path d="M168.224,311.78489c-17.40408.14042-40.43933-2.71094-45.07626-5.53548-3.53126-2.151-4.93843-9.86945-5.40926-13.43043-.32607.014-.51463.02-.51463.02s.97638,12.43276,5.61331,15.2573,27.67217,5.67589,45.07626,5.53547c5.02386-.04052,6.7592-1.82793,6.66391-4.47526C173.87935,310.756,171.96329,311.75474,168.224,311.78489Z" transform="translate(-31.39089 -100.5)" opacity="0.2"/><ellipse cx="198.60911" cy="424.5" rx="187" ry="25.43993" fill="#3f3d56"/><ellipse cx="198.60911" cy="424.5" rx="157" ry="21.35866" opacity="0.1"/><ellipse cx="836.60911" cy="660.5" rx="283" ry="38.5" fill="#3f3d56"/><ellipse cx="310.60911" cy="645.5" rx="170" ry="23.12721" fill="#3f3d56"/><path d="M494,726.5c90,23,263-30,282-90" transform="translate(-31.39089 -100.5)" fill="none" stroke="#2f2e41" stroke-miterlimit="10" stroke-width="2"/><path d="M341,359.5s130-36,138,80-107,149-17,172" transform="translate(-31.39089 -100.5)" fill="none" stroke="#2f2e41" stroke-miterlimit="10" stroke-width="2"/><path d="M215.40233,637.78332s39.0723-10.82,41.47675,24.04449-32.15951,44.78287-5.10946,51.69566" transform="translate(-31.39089 -100.5)" fill="none" stroke="#2f2e41" stroke-miterlimit="10" stroke-width="2"/><path d="M810.09554,663.73988,802.218,714.03505s-38.78182,20.60284-11.51335,21.20881,155.73324,0,155.73324,0,24.84461,0-14.54318-21.81478l-7.87756-52.719Z" transform="translate(-31.39089 -100.5)" fill="#2f2e41"/><path d="M785.21906,734.69812c6.193-5.51039,16.9989-11.252,16.9989-11.252l7.87756-50.2952,113.9216.10717,7.87756,49.582c9.185,5.08711,14.8749,8.987,18.20362,11.97818,5.05882-1.15422,10.58716-5.44353-18.20362-21.38921l-7.87756-52.719-113.9216,3.02983L802.218,714.03506S769.62985,731.34968,785.21906,734.69812Z" transform="translate(-31.39089 -100.5)" opacity="0.1"/><rect x="578.43291" y="212.68859" width="513.25314" height="357.51989" rx="18.04568" fill="#2f2e41"/><rect x="595.70294" y="231.77652" width="478.71308" height="267.83694" fill="#3f3d56"/><circle cx="835.05948" cy="223.29299" r="3.02983" fill="#f2f2f2"/><path d="M1123.07694,621.32226V652.6628a18.04341,18.04341,0,0,1-18.04568,18.04568H627.86949A18.04341,18.04341,0,0,1,609.8238,652.6628V621.32226Z" transform="translate(-31.39089 -100.5)" fill="#2f2e41"/><polygon points="968.978 667.466 968.978 673.526 642.968 673.526 642.968 668.678 643.417 667.466 651.452 645.651 962.312 645.651 968.978 667.466" fill="#2f2e41"/><path d="M1125.828,762.03359c-.59383,2.539-2.83591,5.21743-7.90178,7.75032-18.179,9.08949-55.1429-2.42386-55.1429-2.42386s-28.4804-4.84773-28.4804-17.573a22.72457,22.72457,0,0,1,2.49658-1.48459c7.64294-4.04351,32.98449-14.02122,77.9177.42248a18.73921,18.73921,0,0,1,8.54106,5.59715C1125.07908,756.45353,1126.50669,759.15715,1125.828,762.03359Z" transform="translate(-31.39089 -100.5)" fill="#2f2e41"/><path d="M1125.828,762.03359c-22.251,8.526-42.0843,9.1622-62.43871-4.975-10.26507-7.12617-19.59089-8.88955-26.58979-8.75618,7.64294-4.04351,32.98449-14.02122,77.9177.42248a18.73921,18.73921,0,0,1,8.54106,5.59715C1125.07908,756.45353,1126.50669,759.15715,1125.828,762.03359Z" transform="translate(-31.39089 -100.5)" opacity="0.1"/><ellipse cx="1066.53846" cy="654.13477" rx="7.87756" ry="2.42386" fill="#f2f2f2"/><circle cx="835.05948" cy="545.66686" r="11.51335" fill="#f2f2f2"/><polygon points="968.978 667.466 968.978 673.526 642.968 673.526 642.968 668.678 643.417 667.466 968.978 667.466" opacity="0.1"/><rect x="108.60911" y="159" width="208" height="242" fill="#2f2e41"/><rect x="87.60911" y="135" width="250" height="86" fill="#3f3d56"/><rect x="87.60911" y="237" width="250" height="86" fill="#3f3d56"/><rect x="87.60911" y="339" width="250" height="86" fill="#3f3d56"/><rect x="271.60911" y="150" width="16" height="16" fill="#1941df" opacity="0.4"/><rect x="294.60911" y="150" width="16" height="16" fill="#1941df" opacity="0.8"/><rect x="317.60911" y="150" width="16" height="16" fill="#1941df"/><rect x="271.60911" y="251" width="16" height="16" fill="#1941df" opacity="0.4"/><rect x="294.60911" y="251" width="16" height="16" fill="#1941df" opacity="0.8"/><rect x="317.60911" y="251" width="16" height="16" fill="#1941df"/><rect x="271.60911" y="352" width="16" height="16" fill="#1941df" opacity="0.4"/><rect x="294.60911" y="352" width="16" height="16" fill="#1941df" opacity="0.8"/><rect x="317.60911" y="352" width="16" height="16" fill="#1941df"/><circle cx="316.60911" cy="538" r="79" fill="#2f2e41"/><rect x="280.60911" y="600" width="24" height="43" fill="#2f2e41"/><rect x="328.60911" y="600" width="24" height="43" fill="#2f2e41"/><ellipse cx="300.60911" cy="643.5" rx="20" ry="7.5" fill="#2f2e41"/><ellipse cx="348.60911" cy="642.5" rx="20" ry="7.5" fill="#2f2e41"/><circle cx="318.60911" cy="518" r="27" fill="#fff"/><circle cx="318.60911" cy="518" r="9" fill="#3f3d56"/><path d="M271.36733,565.03228c-6.37889-28.56758,14.01185-57.43392,45.544-64.47477s62.2651,10.41,68.644,38.9776-14.51861,39.10379-46.05075,46.14464S277.74622,593.59986,271.36733,565.03228Z" transform="translate(-31.39089 -100.5)" fill="#1941df"/><ellipse cx="417.21511" cy="611.34365" rx="39.5" ry="12.40027" transform="translate(-238.28665 112.98044) rotate(-23.17116)" fill="#2f2e41"/><ellipse cx="269.21511" cy="664.34365" rx="39.5" ry="12.40027" transform="translate(-271.07969 59.02084) rotate(-23.17116)" fill="#2f2e41"/><path d="M394,661.5c0,7.732-19.90861,23-42,23s-43-14.268-43-22,20.90861-6,43-6S394,653.768,394,661.5Z" transform="translate(-31.39089 -100.5)" fill="#fff"/></svg>
                    <div class="pt-4 form-text">${__html("No applications to display yet.")}</div>
                </div>
            </td>
        </tr>`;
        }

        // load apps
        this.listeners();

        hideLoader();
    }

    view() {

        document.querySelector('body').innerHTML = `
            <navigation-header></navigation-header>
            <div class="container p-edit app-list">
                <div class="app-warnings">
    
                </div>
                <div class="d-flex justify-content-between bd-highlight mb-3">
                    <nav class="bc" aria-label="breadcrumb"></nav>
                    <div class="d-flex align-items-center">
                        <a style="margin-right:16px;" class="preview-link nounderline d-none cluster-list" target="_blank" href="#">${__html('Clusters')}<i class="mdi mdi-monitor"></i></a>
                        <button class="btn btn-primary d-flex align-items-center mt-md-0 mt-2 app-create" type="button">
                            <span class="d-flex" role="status" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle me-2" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                                    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                                </svg>
                            </span>
                            ${__html('Add app')}
                        </button>
                    </div>
                </div>
                <div class="" >
                    <div class="col-lg-12- grid-margin- stretch-card-">
                        <div class="card- border-white- shadow-sm- ">
                            <div class="card-body- p-0">
                                <div class="px-2- mt-2">
                                    <h4 class="card-title d-flex align-items-center justify-content-between bd-highlight">
                                        <select class="form-select project-select form-select-lg mb-0 border-0 ps-0 pt-0 pb-0 bg-transparent text-accent" aria-label="Select project filter" style="width:auto;">
                                            ${this.settings.projects.map((p, i) => {

            return `<option ${p.current ? 'selected' : ''} value="${attr(p.id)}">${html(p.project)}</option>`

        }).join('')
            }
                                        </select>
                                        <div class="d-flex ms-2 po " role="status" aria-hidden="true">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-plus-circle add-project " data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16">
                                            <path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/>
                                            </svg>
                                        </div>
                                    </h4>
                                    <p class="form-text">
                                        <pre id="console-output" class="console-output form-text">${global.state.console ? global.state.console : __html('Choose an <a href="#">app</a> to debug via Cloud.')}</pre>
                                    </p>
                                </div>
                                <div class="row app-cont">
                                    <div class="col-sm-12">
                                        <div class="table-responsive">
                                            <table class="table table-hover table-borderless align-middle table-striped- table-p-list mb-0 " style="min-width: 800px;">
                                                <thead class="d-none">
                                                    <tr>
                                                        <th>
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#212529" class="bi justify-content-end bi-search mb-1" viewBox="0 0 16 16">
                                                                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"></path>
                                                            </svg>
                                                        </th>
                                                        <th>
                                                            <div class="search-cont input-group input-group-sm mb-0 justify-content-start">     
                                                                <input type="text" placeholder="Search products" class="form-control border-top-0 border-start-0 border-end-0 rounded-0" aria-label="Search products" aria-describedby="inputGroup-sizing-sm" style="max-width: 200px;">
                                                            </div>
                                                            <span>${__html('Title')}</span>
                                                        </th>
                                                        <th>${__html('Dev')}</th>
                                                        <th>${__html('Status')}</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody class="app-list">

                                                ${this.apps.map(app => {

                if (!app.registry) app.registry = { domain: "" };
                if (!global.state.dev[app.id]) global.state.dev[app.id] = { status: "stop", edgeStatus: "d-none" }

                let setting = getSetting(app.id);

                let ea = app.endpoints ? Object.keys(app.endpoints) : [];

                let host = ea.length ? app.endpoints[ea[0]] ? (app.endpoints[ea[0]].host + ":" + app.endpoints[ea[0]].port) : "" : "";

                if (this.project != "") if (setting.project != this.project) return "";

                // read endpoints
                if (fs.existsSync(setting.path + require('path').sep + 'endpoints.yaml')) {

                    try {

                        const endpoints = yaml.loadAll(fs.readFileSync(setting.path + require('path').sep + 'endpoints.yaml'), 'utf8');
                        if (endpoints[0].spec.rules) if (endpoints[0].spec.rules.length) host = "https://" + endpoints[0].spec.rules[0].host;

                    } catch (e) {

                        // console.log(e);
                    }
                }

                return `
                                                            <tr>
                                                                <td style="width:46px;">   
                                                                    <div class="edge-status ${attr(global.state.dev[app.id].edgeStatus)}" data-id="${attr(app.id)}"></div>
                                                                    <div class="timgc app-settings" data-id="${attr(app.id)}">
                                                                        <a href="#" class="align-items-center justify-content-between">
                                                                        ${app.app ? app.app.logo ?

                        `<img src="${attr(app.app.logo)}" class="img-fluid rounded" alt="Events placeholder" srcset="${attr(app.app.logo)}">`
                        :
                        `<img src="https://cdn.kenzap.com/loading.png" data-srcset="https://cdn.kenzap.com/loading.png" class="img-fluid rounded" alt="Events placeholder" srcset="https://cdn.kenzap.com/loading.png">`
                        :
                        `<img src="https://cdn.kenzap.com/loading.png" data-srcset="https://cdn.kenzap.com/loading.png" class="img-fluid rounded" alt="Events placeholder" srcset="https://cdn.kenzap.com/loading.png">`
                    }
                                                                        </a>
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <span class="app-title-cont po d-flex align-items-center" data-id="${attr(app.id)}">
                                                                        <div style="font-weight:500" class="app-settings po text-accent fw-bolder- text-decoration-underline-" data-id="${attr(app.id)}" >${__html(app.title)}</div>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-exclamation-triangle ms-2 color-danger ${global.state.dev[app.id].edgeStatus != "offline" ? "d-none" : ""}" data-id="${attr(app.id)}" viewBox="0 0 16 16">
                                                                            <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z"/>
                                                                            <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/>
                                                                        </svg>
                                                                    </span>
                                                                    <div class="form-text p-0 m-0" style="font-size:12px;">${html(host ? host : "")} <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" data-record="${attr(host ? host : "")}" class="bi bi-copy po mb-1 ms-1 copy-record ${attr(host ? "" : "d-none")}" viewBox="0 0 16 16"> <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg></div>
                                                                </td>
                                                                <td>
                                                                    <div class="${app.status == "unpublished" ? "d-none" : ""}">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="currentColor" title="${__html("Stop development mode")}" class="bi bi-stop-circle text-danger m-0 po stop-dev-app ${global.state.dev[app.id].status == "sync" ? "" : "d-none"}" viewBox="0 0 16 16" data-id="${attr(app.id)}">
                                                                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                                                            <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h3A1.5 1.5 0 0 1 11 6.5v3A1.5 1.5 0 0 1 9.5 11h-3A1.5 1.5 0 0 1 5 9.5v-3z"/>
                                                                        </svg>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="currentColor" title="${__html("Start development mode")}" class="bi bi-play-circle form-text m-0 po start-dev-app ${global.state.dev[app.id].status == "stop" ? "" : "d-none"}" viewBox="0 0 16 16" data-id="${attr(app.id)}">
                                                                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                                                            <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                                                                        </svg>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="currentColor" class="bi bi-terminal form-text m-0 ms-2 po start-terminal" viewBox="0 0 16 16" data-id="${attr(app.id)}">
                                                                            <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm9.5 5.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1m-6.354-.354a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2a.5.5 0 1 0-.708.708L4.793 6.5z"/>
                                                                        </svg>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="currentColor" title="${__html("Open terminal console")}" class="bi bi-terminal form-text m-0 ms-3 po start-terminal d-none" viewBox="0 0 16 16" data-id="${attr(app.id)}">
                                                                            <path d="M6 9a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3A.5.5 0 0 1 6 9M3.854 4.146a.5.5 0 1 0-.708.708L4.793 6.5 3.146 8.146a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2z"/>
                                                                            <path d="M2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm12 1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
                                                                        </svg>
                                                                    </div>
                                                                </td>
                                                                <td class="text-start" style="min-width:100px;">
                                                                    <span class="app-publish" data-id="${attr(app.id)}">${formatStatus(app, global.state.dev[app.id].status)}</span>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" class="bi bi-cloud-arrow-up form-text m-0 ms-3 po d-none app-publish" data-id="${attr(app.id)}" viewBox="0 0 16 16">
                                                                        <path fill-rule="evenodd" d="M7.646 5.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 6.707V10.5a.5.5 0 0 1-1 0V6.707L6.354 7.854a.5.5 0 1 1-.708-.708z"/>
                                                                        <path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z"/>
                                                                    </svg>
                                                                </td>
                                                                <td class="text-end">
                                                                    <div class="dropdown applicationsActionsCont">
                                                                        <svg id="applicationsActions0" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" class="bi bi-three-dots-vertical dropdown-toggle po" viewBox="0 0 16 16">
                                                                            <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                                                                        </svg>
                                                                        <ul class="dropdown-menu" aria-labelledby="applicationsActions0" style="">
                                                                            <li>
                                                                                <a class="dropdown-item po app-publish d-flex align-items-center" href="#" data-id="${attr(app.id)}" >
                                                                                    <div class="d-flex"><svg xmlns="http://www.w3.org/2000/svg" width="23" height="18" fill="currentColor" class="bi bi-cloud-arrow-up p-0 form-text m-0 me-2" data-id="${attr(app.id)}" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M7.646 5.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 6.707V10.5a.5.5 0 0 1-1 0V6.707L6.354 7.854a.5.5 0 1 1-.708-.708z"/><path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z"/></svg></div>
                                                                                    ${__html('Publish')}
                                                                                </a>
                                                                            </li>
                                                                            <li>
                                                                                <a class="dropdown-item po app-settings d-flex align-items-center" href="#" data-id="${attr(app.id)}" >
                                                                                    <div class="d-flex"><svg xmlns="http://www.w3.org/2000/svg" width="23" height="18" fill="currentColor" class="bi bi-gear p-0 form-text m-0 me-2" viewBox="0 0 16 16"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/></svg></div>
                                                                                    ${__html('Settings')}
                                                                                </a>
                                                                            </li>
                                                                            <li>
                                                                                <a class="dropdown-item po open-folder d-flex align-items-center" href="#" data-id="${attr(app.id)}" >
                                                                                    <div class="d-flex"><svg xmlns="http://www.w3.org/2000/svg" width="23" height="18" fill="currentColor" title="${__html("Open folder")}" class="bi bi-play-circle form-text p-0 form-text m-0 me-2" viewBox="0 0 16 16" data-id="${attr(app.id)}"><path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a2 2 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139q.323-.119.684-.12h5.396z"/></svg></div>
                                                                                    ${__html('Open folder')}
                                                                                </a>
                                                                            </li>
                                                                            <li>
                                                                                <a class="dropdown-item po app-template d-flex align-items-center" href="#" data-id="${attr(app.id)}" >
                                                                                    <div class="d-flex"><svg xmlns="http://www.w3.org/2000/svg" width="23" height="18" fill="currentColor" class="bi bi-download p-0 form-text m-0 me-2" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/></svg></div>
                                                                                    ${__html('Get template')}
                                                                                </a>
                                                                            </li>
                                                                            <li><hr class="dropdown-divider "></li>
                                                                            <li>
                                                                                <a class="dropdown-item po app-delete d-flex align-items-center" href="#" data-type="remove" data-id="${attr(app.id)}" >
                                                                                    <div class="d-flex"><svg xmlns="http://www.w3.org/2000/svg" width="23" height="18" fill="currentColor" class="bi bi-trash p-0 form-text text-danger m-0 me-2" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg></div>
                                                                                    ${__html('Destroy')}
                                                                                </a>
                                                                            </li>
                                                                        </ul>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        `;

            }).join('')
            }
    
                                                </tbody>
                                            </table>
                                        </div>
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

        // app settings
        onClick(".app-settings", e => {

            e.preventDefault();

            global.settings = new Settings(e.currentTarget.dataset.id);
        });

        // get app template
        onClick(".app-template", e => {

            e.preventDefault();

            showLoader();

            global.state.msg = __html('Template downloaded');
        });

        // delete app
        onClick(".app-delete", e => {

            e.preventDefault();

            if (!confirm(__html('Delete this application?'))) return

            global.state.msg = __html('Application removed');

            showLoader();

            deleteApp(e.currentTarget.dataset.id, () => this.init());
        });

        // create app
        onClick(".app-create", e => {

            e.preventDefault();

            new AppCreate();
        });

        // cluster list
        onClick(".cluster-list", e => {

            e.preventDefault();

            new ClusterList(global);
        });

        // copy to clipboard
        onClick(".app-cont .copy-record", e => {

            e.preventDefault();

            clipboard.writeText(e.currentTarget.dataset.record, 'selection');

            toast(__html('Copied'));
        });
    }
}
