
import global from "./global.js"
import { __html, attr, onClick, getDefaultAppPath, toast, getToken, getKenzapSettings } from './helpers.js'
import { appList } from './app-picker-list.js'
import { AppCreateTitle } from './app-create-title.js'

/**
 * Class representing an App Create Dialog where user selects app template.
 */
export class AppCreateTemplate {

    constructor(app) {

        this.apps = [];

        this.app = app || {};

        this.settings = getKenzapSettings();

        this.init();
    }

    init() {

        this.view();
    }

    view() {

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
                            <app-picker-list class="app-picker-list"></app-picker-list>
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

        // render app picker list
        this.selectAppTable();

        // next action listener
        onClick(".app-icon-container", e => {

            e.preventDefault();

            let i = e.currentTarget.dataset.i;

            let title = this.app.title;
            let ui = this.app.ui;

            this.app = appList[i];

            this.app.title = title;
            this.app.ui = ui;

            new AppCreateTitle(this.app);
        });
    }

    selectAppTable() {
        this.modal.querySelector("app-picker-list").innerHTML = appList.map((app, i) => {
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
}