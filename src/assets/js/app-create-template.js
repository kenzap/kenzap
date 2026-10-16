
import global from "./global.js"
import { __html, attr, html, onClick, getKenzapSettings, onKeyUp } from './helpers.js'
import { getBundledIcon } from './app-list-helpers.js'
import '../scss/app-picker.css'
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

        this.search = "";

        this.init();
    }

    init() {

        this.view();
    }

    view() {

        // get modal html
        this.modal = document.querySelector(".modal");

        // set wide screen
        document.querySelector(".modal-dialog").classList.remove('modal-wide');
        document.querySelector(".modal-dialog").classList.add("modal-lg");

        // set product modal title
        document.querySelector(".modal-title").textContent = __html("Add app");

        // set product modal body
        this.modal.querySelector(".modal-body").innerHTML = `
            <div class="form-cont">
                <div class="form-group- mt-3">
                    <div class="form-group- mt-1">
                        <div class="name-cont form-group d-none-">
                            <label for="env-name" class="d-none">${__html('Search..')}</label>
                            <div class="input-name mb-0">
                                <div class="card-title d-flex align-items-center justify-content-between bd-highlight">
                                    <input id="template-search" type="search" class="template-search form-control" placeholder="${__html('Search templates')}" aria-label="${__html('Search templates')}">
                                    <div class="d-flex ms-2 po d-none" role="status" aria-hidden="true">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-plus-circle po add-project-btn ms-2 form-text" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16">
                                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                                        </svg>
                                    </div>
                                </div>
                                <div class="invalid-feedback env-name-notice"></div>
                                <p class="form-text d-none">${__html("Search app template by name.")}</p>
                            </div>
                        </div>
                        <div class="apps-cont mb-3">
                            <app-picker-list class="app-picker-list" ></app-picker-list>
                        </div>
                    </div>
                </div>
            </div>
            `;

        // bg gradient
        document.querySelector(".modal-content").classList.remove("bg-gradient");
        document.querySelector(".modal-content").classList.add("bg-light");

        // footer buttons
        document.querySelector(".modal-footer").innerHTML = `
        <div class="btn-group" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Cancel")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary btn-continue">${__html("Custom app")}</button>
        </div>
        `;

        this.modal.querySelector("#template-search").focus();

        // render app picker list
        this.selectAppTable();

        // next action listener
        onClick(".btn-continue", e => {

            let title = this.app.title;
            let ui = this.app.ui;

            this.app.image = "custom";
            this.app.image_id = "1";
            this.app.title = title;
            this.app.ui = ui;

            new AppCreateTitle(this.app);
        });

        onKeyUp("#template-search", e => {

            this.search = e.currentTarget.value;

            this.selectAppTable();

        });
    }

    selectAppTable() {
        this.modal.querySelector("app-picker-list").innerHTML = appList.map((app, i) => {

            if (this.search.length > 0) {
                if (!app.name.toLowerCase().includes(this.search.toLowerCase())) {
                    return '';
                }
            }

            return `
                <button type="button" class="app-template-choice" data-i="${i}">
                    <span class="app-template-icon"><img src="${attr(getBundledIcon(app.icon) || app.icon)}" alt="" width="52" height="52"></span>
                    <span class="app-template-name">${html(app.name)}</span>
                </button>
            `;
        }).join('');

        // next action listener
        if (!this.modal.querySelector('app-picker-list').children.length) this.modal.querySelector('app-picker-list').innerHTML = `<p class="form-text app-template-empty">${__html('No matching templates.')}</p>`;
        onClick(".app-template-choice", e => {

            e.preventDefault();

            let i = e.currentTarget.dataset.i;

            let title = this.app.title;
            let ui = this.app.ui;

            this.app = { ...appList[i] };

            this.app.title = title;
            this.app.ui = ui;

            new AppCreateTitle(this.app);
        });
    }
}
