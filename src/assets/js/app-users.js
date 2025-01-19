
import global from "./global.js"
import { __html, attr, onClick, simulateClick } from './helpers.js'

/**
 * @deprecated
 * Class representing a Users management system.
 * Consider implementing app sync with a database and user management system.
 */
export class Users {

    constructor(global) {

        this.global = global;
        this.app = this.global.state.app;
        this.users = this.global.state.app.users ? this.global.state.app.users : [];

        if (!this.app) this.app = { env: [] };
    }

    view() {

        return `
            <div class="col-sm-7 pt-3 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Users')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary add-user" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-arrow-clockwise po sync-endpoints d-none" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                    </svg>
                </div>
                <p class="form-text">${__html('A list of users that have access to this app. Your user ID %1$.', this.me.id)}</p>
                <div class="mb-3 row">
                    <label for="registryDomain" class="col-sm-3 col-form-label">${__html('Active')}</label>
                    <div class="col-sm-9">
                        <div class="table-responsive">
                            <table class="table table-hover table-borderless align-middle table-striped table-p-list mb-0" style="min-width:300px;">
                                <thead>
                                    <tr class="d-none">
                                        <th class="fw-normal">${__html('Endpoint')}</th>
                                        <th class="fw-normal">${__html('Status')}</th>
                                        <th class="fw-normal">${__html('Action')}</th>
                                    </tr>
                                </thead>
                                <tbody class="user-list">

                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            `;
    }

    render() {

        if (!this.users.length) { document.querySelector('.user-list').innerHTML = `<tr><td colspan="2">${__html("No users to display.")}</td></tr>`; }

        document.querySelector('.user-list').innerHTML = this.users.map((user, i) => {

            this.loadImage(user);

            return `
                <tr>
                    <td style="min-width:200px;">
                        <div class="d-flex">
                            <div class="timgc app-settings" data-id="${global.state.app.id}">
                                <a href="#"><img id="avatar-${attr(user)}" src="https://cdn.kenzap.com/loading.png" data-srcset="https://cdn.kenzap.com/loading.png" class="img-fluid rounded-circle" alt="Events placeholder" srcset="https://cdn.kenzap.com/loading.png" style="object-fit: cover;"></a>
                            </div>
                            <div class="d-flex align-items-center ms-3">
                                <div class="my-0">${attr(user)}</div>
                                <div class="form-text my-0 d-none">${attr(user)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="form-text"><div class="badge bg-danger fw-light" data-id="${attr(global.state.app.id)}"><div class="d-flex align-items-center">${__html('Admin')}</div></div></td>
                    <td class="text-end">
                        <div class="dropdown endpointsActionsCont">
                            <svg id="endpointsActions${i}" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-three-dots-vertical dropdown-toggle po" viewBox="0 0 16 16">
                                <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                            </svg>
                            <ul class="dropdown-menu" aria-labelledby="endpointsActions${i}" style="">
                                <li><a class="dropdown-item po endpoint-edit add-endpoint d-none" href="#" data-action="edit" data-i="${attr(i)}" data-id="${attr(global.state.app.id)}" data-bs-toggle="modal" data-bs-target=".modal">${__html('Edit')}</a></li>
                                <li><hr class="dropdown-divider d-none"></li>
                                <li><a class="dropdown-item po user-delete" href="#" data-i="${attr(i)}" data-id="${attr(user)}" >${__html('Remove')}</a></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            `

        }).join('');
    }

    listeners() {

        // add variable
        onClick('.add-user', e => {

            e.preventDefault();

            // add or edit
            let action = e.currentTarget.dataset.action;

            // get modal html
            this.modal = document.querySelector(".modal");

            // set wide screen
            document.querySelector(".modal-dialog").classList.add("modal-wide");

            // set product modal title
            document.querySelector(".modal-title").innerHTML = action == 'edit' ? __html("Edit User") : __html("Add User");

            // buttons
            document.querySelector(".modal-footer").innerHTML =
                `
            <div class="btn-group" role="group" aria-label="Basic example">
                <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Close")}</button>
                <button id="btn-primary" type="button" class="btn btn-outline-primary add-user-btn" data-i=${e.currentTarget.dataset.i ? e.currentTarget.dataset.i : ""} data-action="${action}">${action == 'edit' ? __html("Edit user") : __html("Add user")}</button>
            </div>
            `;


            let html = `
            <div class="form-cont">
                <div class="form-group- mt-3">
                    <div class="form-group- mt-1">
                        <div class="value-cont">
                            <label for="public-value">${__html('User ID')}</label>
                            <div class="input-value mb-3">
                                <input id="user-id" type="text" class="user-id form-control" placeholder="10000000043" value="" >
                                <div class="invalid-feedback user-id-notice"></div>
                                <p class="form-text">${__html("Add user to this application.")}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;

            this.modal.querySelector(".modal-body").innerHTML = html;
            this.modal.querySelector("#user-id").focus();

            onClick(".add-user-btn", e => {

                let allow = true;

                // reset
                this.modal.querySelector("#user-id").setCustomValidity(""); this.modal.querySelector(".user-id-notice").innerHTML = "";

                // validate
                let id = this.modal.querySelector("#user-id").value.trim().toLowerCase();

                if (id.length < 4) { allow = false; this.modal.querySelector("#user-id").setCustomValidity(__html("ID too short")); this.modal.querySelector(".user-id-notice").innerHTML = __html("Name too short"); this.modal.querySelector("#user-id").parentElement.classList.add('is-invalid'); }
                this.modal.querySelector("#user-id").parentElement.parentElement.classList.add('was-validated');

                let regex = /[^\d+$]/g;
                if (regex.test(id)) { allow = false; this.modal.querySelector("#user-id").setCustomValidity(__html("Wrong characters")); this.modal.querySelector(".user-id-notice").innerHTML = __html("User id should be numeric"); }
                this.modal.querySelector("#user-id").parentElement.parentElement.classList.add('was-validated');

                if (!allow) return false;

                this.users.push(id);

                // close modal
                simulateClick(document.querySelector(".close-modal"));

                // save changes
                this.save();

                this.render();

                this.listeners();
            });
        });


        // edit variable
        onClick(".user-delete", e => {

            e.preventDefault();

            if (!confirm(__html("Remove user?"))) return;

            let index = this.users.indexOf(e.currentTarget.dataset.id);
            if (index !== -1) {
                this.users.splice(index, 1);
            }

            this.save();

            this.render();

            this.listeners();
        });
    }

    init() {

        this.me = JSON.parse(localStorage.getItem('user'));

        document.querySelector('app-users').innerHTML = this.view();

        this.render();

        this.listeners();
    }

    get() {

        return this.users;
    }

    loadImage(user) {

        var img = new Image();

        img.onload = function () { document.querySelector("#avatar-" + user).setAttribute("src", img.src); document.querySelector("#avatar-" + user).setAttribute("srcset", img.src); };
        img.src = 'https://cdn.kenzap.com/600/a' + user + '_1.jpeg';
    }

    save() {

    }
}