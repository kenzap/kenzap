
import { __html, html, onClick, simulateClick, getToken } from './helpers.js'

/**
 * Environmental variables.
 * 
 * @class EnvVars
 * @param {object} global - The global state object.
 * 
 **/
export class EnvVars {

    constructor(global) {

        this.global = global;
        this.app = this.global.state.app;
        this.vars = [];

        if (!this.app) this.app = { env: [] };
    }

    html() {

        return `
            <div class="col-sm-7 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Variables')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary add-env-var" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                </div>
                <p class="form-text">${__html('Hardcode environmental variable into docker image.')}</p>
                <div class="env-vars-cont mb-3">
                    <div class="table-responsive">
                        <table class="table table-hover table-borderless align-middle table-striped table-p-list mb-0" style="min-width: 600px;">
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
                            <tbody class="env-vars-list">

                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="clearfix"></div>
            </div>`;
    }

    render() {

        // no records found
        if (!this.vars.length) { document.querySelector('.env-vars-list').innerHTML = `<tr><td colspan="3">${__html("No variables to display.")}</td></tr>`; }

        // render HTML
        document.querySelector('.env-vars-list').innerHTML = this.vars.map((v, i) => {

            return `
                <tr>
                    <td class="text-start" style="min-width:50px;">
                        <span class="env-name-td" data-i="${i}">${html(v.name)}</span>
                    </td>
                    <td class="text-start" style="min-width:50px;">
                        <span class="env-value-td" data-i="${i}">${[...Array(v.value.length > 12 ? 12 : v.value.length)].map(e => { return '&#x2022;' }).join('')}</span>
                    </td>
                    <td class="text-end">
                        <div class="dropdown">
                            <svg id="envActions${i}" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" class="bi bi-three-dots-vertical dropdown-toggle po" viewBox="0 0 16 16">
                                <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                            </svg>
                            <ul class="dropdown-menu" aria-labelledby="envActions${i}" style="">
                                <li><a class="dropdown-item po add-env-var" href="#" data-bs-toggle="modal" data-bs-target=".modal" data-action="edit" data-id="${v.id}" >${__html('Edit')}</a></li>
                                <li><hr class="dropdown-divider "></li>
                                <li><a class="dropdown-item po env-var-remove" href="#" data-type="remove" data-id="${v.id}" >${__html('Remove')}</a></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            `;

        }).join('');
    }

    listeners() {

        // add variable
        onClick('.add-env-var', e => {

            e.preventDefault();

            // add or edit
            let action = e.currentTarget.dataset.action;

            // get modal html
            this.modal = document.querySelector(".modal");

            // set wide screen
            document.querySelector(".modal-dialog").classList.add("modal-wide");

            // set product modal title
            document.querySelector(".modal-title").innerHTML = action == 'edit' ? __html("Edit Variable") : __html("Add Variable");

            // buttons
            document.querySelector(".modal-footer").innerHTML =
                `
                <button id="btn-middle" type="button" class="btn btn-secondary close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Close")}</button>
                <button id="btn-primary" type="button" class="btn btn-primary add-variable" data-action="${action}">${action == 'edit' ? __html("Edit variable") : __html("Add variable")}</button>
            `;

            // vars
            let record = { id: "", name: "", value: "" };

            // prepare for editing
            if (action == 'edit') {

                record = this.vars.filter(v => v.id == e.currentTarget.dataset.id)[0];
            }

            let html = `
            <div class="form-cont">
                <div class="form-group- mt-3">
                    <div class="form-group- mt-1">
                        <div class="name-cont form-group">
                            <label for="env-name">${__html('Name')}</label>
                            <div class="input-name mb-3">
                                <input id="env-name" type="text" class="env-name form-control input-qty" value="${record.name}" style="text-transform: uppercase;">
                                <div class="invalid-feedback env-name-notice"></div>
                                <p class="form-text">${__html("Name of the environmental variable.")}</p>
                            </div>
                        </div>
                        <div class="value-cont" form-group>
                            <label for="env-value">${__html('Value')}</label>
                            <div class="input-value mb-3">
                                <textarea id="env-value" type="text" class="env-value form-control input-note monospace" rows="3" >${record.value}</textarea>
                                <div class="invalid-feedback env-value-notice"></div>
                                <p class="form-text">${__html("Value of the environmental variable.")}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;

            this.modal.querySelector(".modal-body").innerHTML = html;
            this.modal.querySelector("#env-name").focus();

            onClick(".add-variable", e => {

                let allow = true;

                // reset
                this.modal.querySelector("#env-name").setCustomValidity(""); this.modal.querySelector(".env-name-notice").innerHTML = "";
                this.modal.querySelector("#env-value").setCustomValidity(""); this.modal.querySelector(".env-value-notice").innerHTML = "";

                // validate
                let name = this.modal.querySelector("#env-name").value.toUpperCase();
                let value = this.modal.querySelector("#env-value").value;

                if (name.length < 2) { allow = false; this.modal.querySelector("#env-name").setCustomValidity(__html("Name too short")); this.modal.querySelector(".env-name-notice").innerHTML = __html("Name too short"); }
                this.modal.querySelector("#env-name").parentElement.classList.add('was-validated');

                let regex = /[^A-Z_]/g;
                if (regex.test(name)) { allow = false; this.modal.querySelector("#env-name").setCustomValidity(__html("Wrong characters")); this.modal.querySelector(".env-name-notice").innerHTML = __html("Wrong characters found"); }
                this.modal.querySelector("#env-name").parentElement.classList.add('was-validated');

                if (value.length < 2) { allow = false; this.modal.querySelector("#env-value").setCustomValidity(__html("Value too short")); this.modal.querySelector(".env-value-notice").innerHTML = __html("Value too short"); }
                this.modal.querySelector("#env-value").parentElement.classList.add('was-validated');

                if (!allow) return false;

                if (action == 'edit') {

                    this.vars.forEach(v => {

                        if (v.id == record.id) { v.name = name; v.value = value; }
                    });
                } else {

                    this.vars.push({ id: getToken(12), name: name, value: value });
                }

                simulateClick(document.querySelector(".close-modal"));

                this.render();

                this.listeners();
            });
        });

        // edit variable
        onClick(".env-var-remove", e => {

            e.preventDefault();

            if (!confirm(__html("Remove this variable?"))) return;

            this.vars = this.vars.filter(v => v.id != e.currentTarget.dataset.id);

            this.render();

            this.listeners();
        });
    }

    get() {

        return this.vars;
    }

    init() {

        document.querySelector('env-vars').innerHTML = this.html();

        this.render();

        this.listeners();
    }
}