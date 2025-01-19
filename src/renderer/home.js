'use strict';

import global from '../assets/js/global.js'
import { __html, html, attr, initBreadcrumbs, onClick, hideLoader, getKenzapSettings } from '../assets/js/helpers.js'
import { NavigationHeader } from '../assets/js/navigation-header.js'
import { AppList } from './app-list.js'
import { Footer } from '../assets/js/app-footer.js'
import { ClusterList } from './cluster-list.js'
import "../assets/libs/bootstrap.5.0.2.1.0.min.css"
import "../assets/scss/app.css"

/** 
 * Cluster class. Inits dashboard of app modules
 * Syncs data with local directory.
 *
 * @link 
 * @since 1.0.0
 *
 * @package Kenzap
 */
export class Home {

    constructor() {

        // defaults
        this.cards = [
            { title: __html("Clusters"), slug: "#clusters", description: __html("Create and manage your Kubernetes clusters."), links: [{ link: "#clusters", text: "Clusters" }], icon: "bi bi-server", value: 0, color: "bg-primary", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" style="width: 48px;" fill="currentColor" class="bi bi-ubuntu me-3 mr-md-0 mr-lg-4 text-primary" viewBox="0 0 16 16"><path d="M2.273 9.53a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.547Zm9.467-4.984a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546M7.4 13.108a5.54 5.54 0 0 1-3.775-2.88 3.27 3.27 0 0 1-1.944.24 7.4 7.4 0 0 0 5.328 4.465c.53.113 1.072.169 1.614.166a3.25 3.25 0 0 1-.666-1.9 6 6 0 0 1-.557-.091m3.828 2.285a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546m3.163-3.108a7.44 7.44 0 0 0 .373-8.726 3.3 3.3 0 0 1-1.278 1.498 5.57 5.57 0 0 1-.183 5.535 3.26 3.26 0 0 1 1.088 1.693M2.098 3.998a3.3 3.3 0 0 1 1.897.486 5.54 5.54 0 0 1 4.464-2.388c.037-.67.277-1.313.69-1.843a7.47 7.47 0 0 0-7.051 3.745"/></svg>' },
            { title: __html("Apps"), slug: "#apps", description: __html("Run any app as a microservice among your clusters."), links: [{ link: "#apps", text: "Apps" }], icon: "bi bi-monitor", value: 0, color: "bg-success", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" style="width: 48px;" fill="currentColor" class="bi bi-ui-radios-grid me-3 mr-md-0 mr-lg-4 text-primary" viewBox="0 0 16 16"><path d="M3.5 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5m9-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5m0 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5M16 3.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0m-9 9a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0m5.5 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m-9-11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m0 2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/></svg>' },
        ]

        // load this page
        this.init();
    }

    init() {

        // global.state.projects = [];
        this.settings = getKenzapSettings();

        // global.state.apps = [];
        this.view();

        // init
        global.state.nav = new NavigationHeader(global);
        global.state.nav.init();

        // init
        global.state.footer = new Footer(global);
        global.state.footer.init();

        // initiate breadcrumbs
        initBreadcrumbs(
            [
                { text: __html('Home') }
            ]
        );

        this.listeners();

        hideLoader();
    }

    view() {

        document.querySelector('body').innerHTML = `
            <navigation-header></navigation-header>
            <div class="container p-edit cluster-list">
                <div class="app-warnings">
    
                </div>
                <div class="d-flex justify-content-between bd-highlight mb-3">
                    <nav class="bc" aria-label="breadcrumb"></nav>
                    <div class="d-flex align-items-center d-none">
                        <a style="margin-right:16px;" class="preview-link nounderline d-none- app-list" target="_blank" href="#">${__html('Apps')}<i class="mdi mdi-monitor"></i></a>
                        <button class="btn btn-primary d-flex align-items-center mt-md-0 mt-2 cluster-create" data-bs-toggle="modal" data-bs-target=".modal" type="button">
                            <span class="d-flex" role="status" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle me-2"  viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                                    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                                </svg>
                            </span>
                            ${__html('Add cluster')}
                        </button>
                    </div>
                </div>
                <div class="">
                    <div class="col-lg-12- grid-margin- stretch-card-">
                        <div class="card- border-white- shadow-sm-">
                            <div class="card-body- p-0">
                                <div class="px-2- mt-2 d-none">
                                    <h4 class="card-title d-flex align-items-center justify-content-between bd-highlight">
                                        <select class="form-select project-select form-select-lg mb-0 border-0 ps-0 pt-0 pb-0 bg-transparent text-accent" aria-label="Select project filter" style="width:auto;">
                                            ${global.state.settings.projects.map((p, i) => {

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
                                        <pre id="console-output" class="console-output form-text">${global.state.console ? global.state.console : __html('List of <a href="#">available</a> services.')}</pre>
                                    </p>
                                </div>
                                <div class="row card-cont">
                           
                                    ${this.cards.map((card) => {

                return `
                                            
                                            <div class="col-lg-4 grid-margin stretch-card mb-4 ">
                                                <div class="card border-white shadow-sm p-sm-2 anm br ${card.danger ? 'bg-danger' : ''}" data-ext="${card.slug}">
                                                    <div class="card-body">
                                                        <div class="d-flex flex-row">
                                                            ${card.svg}
                                                            <div class="mr-4 mr-md-0 mr-lg-4 text-left text-lg-left ${card.danger ? 'text-light' : ''}">
                                                                <h5 class="card-title mb-0">${card.title} <button type="button" data-id="${card.slug}" class="d-none btn-close float-end fs-6 rm-ext" ></button></h5>
                                                                <p class="card-description mt-1 mb-0" >${card.description}</p>
                                                                <div class="link-group">
                                                                    ${card.links.map(link => {

                    return `<a href="${link.link}" class="mt-2 me-2 text-md-tight ">${link.text}</a>`

                }).join('')
                    }
                                                                </div>
                                                            </div>
                                                        </div>                  
                                                    </div>
                                                </div>
                                            </div>`;

            }).join('')}
                    
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

        // navigate
        onClick(".link-group a", e => {

            console.log("clicked");

            e.preventDefault();

            switch (e.currentTarget.getAttribute('href')) {

                case "#clusters":
                    new ClusterList(global);
                    break;
                case "#apps":
                    new AppList(global);
                    break;
            }
        });
    }
}
