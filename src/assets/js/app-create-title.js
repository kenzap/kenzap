
import global from "./global.js"
import { __html, attr, onClick, simulateClick, log } from './helpers.js'
import { AppCreateTemplate } from './app-create-template.js'
import { AppCreateImage } from './app-create-image.js'
import slugify from 'slugify'

/**
 * Class representing an App Create Dialog where user proivdes app name.
 */
export class AppCreateTitle {

    constructor(app) {

        this.app = app;

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

        document.querySelector(".modal-title").innerHTML = __html("App Name");

        this.modal.querySelector(".modal-body").innerHTML = `
            <div class="form-group my-5 py-5 text-center-">
                <div class="m-auto" style="max-width: 500px;">
                    <label for="app-title" class="form-label h5 d-none">${__html('App Name')}</label>
                    <input id="app-title" type="text" class="form-control form-control-lg mx-auto" placeholder="${__html('Enter app name')}" value="${attr(this.app.title ? this.app.title : "")}" />
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

            this.app.title = document.querySelector("#app-title").value;
            this.app.namespace = slugify(this.app.title.toLowerCase(), { remove: /[.,/#!$%^&*;:{}=\_`~()]/g });
            this.app.slug = slugify(this.app.title.toLowerCase(), { remove: /[.,/#!$%^&*;:{}=\_`~()]/g });

            if (this.app.title.length < 2 || this.app.namespace < 2) {
                document.querySelector("#app-title").classList.add("is-invalid");
                return;
            }

            if (!/^[a-zA-Z0-9\s]+$/.test(this.app.title)) {
                document.querySelector("#app-title").classList.add("is-invalid");
                document.querySelector("#app-title").nextElementSibling.innerHTML = __html('Only letters, digits, and spaces are allowed.');
                return;
            }

            new AppCreateImage(this.app);
        });

        // previous action listener
        onClick(".app-picker-back", e => {

            new AppCreateTemplate(this.app);
        });
    }
}