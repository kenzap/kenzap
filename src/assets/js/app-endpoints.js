
import { clipboard } from 'electron'
import { __html, html, attr, onClick, simulateClick, toast, getSetting, parseError, onChange, onKeyUp, getKenzapSettings, saveKenzapSettings, API, log } from './helpers.js'
import yaml from 'js-yaml';
import fs from "fs"
import { run_script } from './dev-tools.js'
import * as path from 'path';

export class Endpoints {

    constructor(app) {

        this.selector = "app-endpoints";
        this.app = app;
        this.usedPorts = [];

        // console.log("Endpoints", this.app);

        if (!this.app) this.app = { env: [] };
        if (!this.annotations) this.annotations = this.app.annotations;
    }

    view() {

        return `
            <div class="col-sm-7 pt-3 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Endpoints')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-sliders2 ms-3 me-1 po text-primary ingress-settings d-none" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M10.5 1a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V4H1.5a.5.5 0 0 1 0-1H10V1.5a.5.5 0 0 1 .5-.5M12 3.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m-6.5 2A.5.5 0 0 1 6 6v1.5h8.5a.5.5 0 0 1 0 1H6V10a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5M1 8a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2A.5.5 0 0 1 1 8m9.5 2a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V13H1.5a.5.5 0 0 1 0-1H10v-1.5a.5.5 0 0 1 .5-.5m1.5 2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5"/>
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary add-endpoint" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-arrow-clockwise po sync-endpoints d-none" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                    </svg>
                </div>
                <p class="form-text">${__html('A list of public endpoints and services.')}</p>
                <div class="mb-3 row">
                    <label for="registryDomain" class="col-sm-2 col-form-label">${__html('Active')}</label>
                    <div class="col-sm-10">
                        <div class="table-responsive">
                            <table class="table table-hover table-borderless align-middle table-striped- table-p-list mb-0" style="min-width:300px;">
                                <thead>
                                    <tr class="d-none">
                                        <th class="fw-normal">${__html('Endpoint')}</th>
                                        <th class="fw-normal">${__html('Status')}</th>
                                        <th class="fw-normal">${__html('Action')}</th>
                                    </tr>
                                </thead>
                                <tbody class="endpoint-list">

                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            `;
    }

    render() {

        // log("render endpoints");

        let cache = getSetting(this.app.id);

        // render newly added endpoints (after ui is rendered)
        if (typeof this.services !== "undefined") {

            // no records found
            if (!this.services.length) { if (document.querySelector('.endpoint-list')) document.querySelector('.endpoint-list').innerHTML = `<tr><td colspan="2">${__html("No endpoints created.")}</td></tr>`; }

            if (document.querySelector(this.selector + ' .endpoint-list')) document.querySelector(this.selector + ' .endpoint-list').innerHTML = this.services.map((service, i) => {

                this.usedPorts.push(service.port);

                return this.struct(i, service);

            }).join('');
        }

        // render from YAML (first time loading)
        if (typeof this.services === "undefined") {

            // console.log("render endpoints from YAML: ", this.app.id, cache.path);

            // read endpoints
            if (cache.path) if (fs.existsSync(path.join(cache.path, 'endpoints.yaml'))) {

                try {

                    this.endpoints = [];
                    this.services = [];

                    const endpoints = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'endpoints.yaml'), 'utf8'));

                    // log("render endpoints", endpoints);

                    // no records found
                    if (!endpoints.length) { if (document.querySelector('.endpoint-list').innerHTML) document.querySelector('.endpoint-list').innerHTML = `<tr><td colspan="2">${__html("No endpoints created.")}</td></tr>`; }

                    endpoints.forEach(endpoint => {

                        this.annotations = endpoint.metadata.annotations;

                        if (endpoint.kind == "Ingress") {

                            endpoint.spec.rules.map((rule, i) => {

                                this.usedPorts.push(rule.http.paths[0].backend.service.port.number);

                                let e = { "host": rule.host, "port": rule.http.paths[0].backend.service.port.number, "name": rule.http.paths[0].backend.service.name, "slug": this.app.slug, "private": rule.http.paths[0].backend.service.name + "." + endpoint.metadata.namespace, "active_public": 1, "active_private": 1 };

                                this.endpoints.push(e);
                            });
                        }

                        if (endpoint.kind == "Service") {

                            let service = { "host": "", "port": endpoint.spec.ports[0].port, "name": endpoint.metadata.name, "slug": this.app.slug, "private": endpoint.metadata.name + "." + endpoint.metadata.namespace, "selector_app": endpoint.spec.selector.app, "active_public": 0, "active_private": 1 };

                            this.services.push(service);
                        }
                    });

                    // map endpoints and services
                    this.services.map((service, j) => {
                        this.endpoints.map((endpoint, i) => {
                            if (endpoint.name == service.name) {

                                this.services[j].host = endpoint.host;
                                this.services[j].active_public = 1;
                            }
                        });
                    });

                    // render services
                    if (document.querySelector(this.selector + ' .endpoint-list')) document.querySelector(this.selector + ' .endpoint-list').innerHTML = this.services.map((service, i) => {

                        // this.usedPorts.push(rule.http.paths[0].backend.service.port.number);

                        let s = { "host": service.host ? service.host : "", "port": service.port, "name": service.name, "slug": service.slug, "private": service.private, "active_public": service.host ? 1 : 0, "active_private": 1 };

                        return this.struct(i, s);

                    }).join('');

                    // log("services", this.services);
                    // log("endpoints", this.endpoints);

                    this.servicesOriginal = JSON.parse(JSON.stringify(this.services));
                    this.endpointsOriginal = JSON.parse(JSON.stringify(this.endpoints));

                } catch (err) {

                    parseError(err);
                }
            }
        }
    }

    struct(i, endpoint) {

        return `
            <tr>
                <td style="min-width:200px;">
                    <div class="my-0 d-flex align-items-center ">
                        <div class="endpoint-status ${endpoint.active_public ? "online" : endpoint.active_private ? "online" : "not-active"}" data-id="${attr(this.app.id)}"></div>
                        <div class="ms-2">
                            ${html(endpoint.name + "." + endpoint.slug + ":" + endpoint.port)} 
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" data-record="${attr(endpoint.name + "." + endpoint.slug + ":" + endpoint.port)}" class="bi bi-copy po mb-1 ms-1 copy-record" viewBox="0 0 16 16"> <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg>
                        </div>
                    </div>
                    <div class="form-text my-0 d-flex align-items-center ${endpoint.active_public ? "" : "d-none"}">
                        <div class="endpoint-status ${endpoint.active_public ? "invisible" : endpoint.active_private ? "online" : "not-active"}" data-id="${attr(this.app.id)}"></div>
                        <div class="ms-2">
                        ${endpoint.active_public ?
                `
                            ${attr(endpoint.host) ? "https://" + attr(endpoint.host) : ""}
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" data-record="${attr(endpoint.host) ? "https://" + attr(endpoint.host) : ""}" class="bi bi-copy po mb-1 ms-1 copy-record" viewBox="0 0 16 16"> <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg>
                            
                            `
                :
                `
                            ${html(endpoint.name + "." + endpoint.slug + ":" + endpoint.port)} 
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" data-record="${attr(endpoint.name + "." + endpoint.slug + ":" + endpoint.port)}" class="bi bi-copy po mb-1 ms-1 copy-record" viewBox="0 0 16 16"> <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg>
                            
                            `
            }
                        </div>
                    </div>
                </td>
                <td class="form-text d-flex d-none align-items-center">
                    <div class="badge bg-primary fw-light" data-id="${attr(this.app.id)}">
                        <div class="d-flex align-items-center">${__html('Active')}</div>
                    </div>
                </td>
                <td class="text-end">
                    <div class="dropdown endpointsActionsCont">
                        <svg id="endpointsActions${i}" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-three-dots-vertical dropdown-toggle po" viewBox="0 0 16 16">
                            <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                        </svg>
                        <ul class="dropdown-menu" aria-labelledby="endpointsActions${i}" style="">
                            <li><a class="dropdown-item po endpoint-edit add-endpoint" href="#" data-action="edit" data-i="${attr(i)}" data-id="${attr(endpoint.id)}" data-bs-toggle="modal" data-bs-target=".modal">${__html('Edit')}</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item po endpoint-delete" href="#" data-i="${attr(i)}" data-id="${attr(this.app.id)}" >${__html('Remove')}</a></li>
                        </ul>
                    </div>
                    <a href="#" data-id="${attr(this.app.id)}" class="remove-product text-danger d-none me-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"></path>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"></path>
                        </svg>
                    </a>
                </td>
            </tr>
        `
    }

    listeners() {

        // add variable
        onClick('.add-endpoint', e => {

            e.preventDefault();

            // add or edit
            let action = e.currentTarget.dataset.action;

            // get modal html
            this.modal = document.querySelector(".modal");

            // set wide screen
            document.querySelector(".modal-dialog").classList.add("modal-wide");

            // set product modal title
            document.querySelector(".modal-title").innerHTML = action == 'edit' ? __html("Edit Endpoint") : __html("Add Endpoint");

            // buttons
            document.querySelector(".modal-footer").innerHTML =
                `
            <div class="btn-group" role="group" aria-label="Basic example">
                <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Close")}</button>
                <button id="btn-primary" type="button" class="btn btn-outline-primary add-endpoint-btn" data-i=${e.currentTarget.dataset.i ? e.currentTarget.dataset.i : ""} data-action="${action}">${action == 'edit' ? __html("Edit endpoint") : __html("Add endpoint")}</button>
            </div>
            `;

            // vars
            let portNew = 80, name = "", service = "", host = "." + this.app.slug + this.endpoint(), active_public = 0, active_private = 1;

            // prepare for editing
            if (action == 'edit') {

                let index = parseInt(e.currentTarget.dataset.i);

                host = this.services[index].host;
                name = this.services[index].name;
                portNew = this.services[index].port;
                active_public = this.services[index].active_public;
                active_private = this.services[index].active_private;

            } else {

                // generate unique port
                this.usedPorts.forEach(port => {

                    if (!this.usedPorts.includes(parseInt(port) + 1)) {
                        portNew = parseInt(port) + 1;
                    }
                });
            }

            let html = `
            <div class="form-cont">
                <div class="form-group- mt-3">
                    <div class="form-group- mt-1">
                        <div class="name-cont private-cnt form-group">
                            <label for="cluster-name" class="form-label">${__html('Cluster Endpoint')}</label>
                            <div class="d-flex align-items-center justify-content-between">
                                <div class="input-group flex-grow-1 bd-highlight me-3">
                                    <input type="text" class="form-control" id="cluster-name" value="${attr(name)}" ${action == 'edit' ? "disabled" : ""} placeholder="api" aria-describedby="cluster-name">
                                    <span class="input-group-text">.</span>
                                    <span class="input-group-text">${this.app.slug}</span>
                                    <span class="input-group-text">:</span>
                                    <input type="text" class="form-control" id="cluster-port" placeholder="80" length="3" value="${attr(portNew)}" aria-describedby="port" style="max-width:80px;">
                                </div>
                                <div class="ms-3 form-check form-switch text-end">
                                    <input class="form-check-input form-check-input-lg" type="checkbox" role="switch" style="transform:scale(1.4)" id="active_private" ${active_private ? "checked" : ""}>
                                </div>
                            </div>
                            <div class="invalid-feedback cluster-name-notice"></div>
                            <div class="invalid-feedback cluster-port-notice"></div>
                            <p class="form-text">${__html("Endpoint for microservice communication.")}</p>
                        </div>
                        <div class="value-cont public-cnt form-group" style="${!active_private ? "opacity:0.4;" : ""}" >
                            <label for="public-value">${__html('Public Endpoint')}</label>
                            <div class="input-value mb-3">
                                <div class="d-flex align-items-center justify-content-between">
                                    <input id="public-name" type="text" class="flex-grow-1 bd-highlight me-3 public-name form-control input-note monospace" value="${attr(host)}" >
                                    <div class="ms-3 form-check form-switch text-end">
                                        <input class="form-check-input form-check-input-lg" type="checkbox" role="switch" style="transform:scale(1.4)" id="active_public" ${!active_private ? "disabled" : ""} ${active_public ? "checked" : ""} >
                                    </div>
                                </div>
                                <div class="invalid-feedback public-name-notice"></div>
                                <p class="form-text">${__html("Endpoint accessible from the Internet.")}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;

            this.modal.querySelector(".modal-body").innerHTML = html;
            this.modal.querySelector("#cluster-name").focus();

            let nameType = (e) => {

                e.preventDefault();

                document.querySelector("#public-name").value = e.currentTarget.value.trim() + "." + this.app.slug + this.endpoint();
            }

            onKeyUp("#cluster-name", e => { if (action != 'edit') nameType(e); });
            onChange("#cluster-name", e => { if (action != 'edit') nameType(e); });
            onChange("#active_private", e => { if (!e.currentTarget.checked) { document.querySelector("#active_public").checked = false; document.querySelector(".public-cnt").style = "opacity:0.4;"; document.querySelector("#active_public").setAttribute('disabled', true); } else { document.querySelector("#active_public").removeAttribute('disabled'); document.querySelector(".public-cnt").style = "opacity:1;"; } });
            onClick(".add-endpoint-btn", e => {

                let allow = true;

                // reset
                this.modal.querySelector("#cluster-name").setCustomValidity(""); this.modal.querySelector(".cluster-name-notice").innerHTML = "";
                this.modal.querySelector("#cluster-port").setCustomValidity(""); this.modal.querySelector(".cluster-port-notice").innerHTML = "";
                this.modal.querySelector("#cluster-name").parentElement.classList.remove('is-invalid');

                // validate
                let name = this.modal.querySelector("#cluster-name").value.trim().toLowerCase();
                let host = document.querySelector("#public-name").value.trim().toLowerCase();
                let port = this.modal.querySelector("#cluster-port").value.trim();
                let active_private = this.modal.querySelector("#active_private").checked ? 1 : 0;
                let active_public = this.modal.querySelector("#active_public").checked ? 1 : 0;

                if (name.length < 2) { allow = false; this.modal.querySelector("#cluster-name").setCustomValidity(__html("Endpoint too short")); this.modal.querySelector(".cluster-name-notice").innerHTML = __html("Name too short"); this.modal.querySelector("#cluster-name").parentElement.classList.add('is-invalid'); }
                this.modal.querySelector("#cluster-name").parentElement.parentElement.classList.add('was-validated');

                let regex = /[^a-z_]/g;
                if (regex.test(name)) { allow = false; this.modal.querySelector("#cluster-name").setCustomValidity(__html("Wrong characters")); this.modal.querySelector(".cluster-name-notice").innerHTML = __html("Wrong characters found"); this.modal.querySelector("#cluster-name").parentElement.classList.add('is-invalid'); }
                this.modal.querySelector("#cluster-name").parentElement.parentElement.classList.add('was-validated');

                if (port.length < 2 || port.length > 4) { allow = false; this.modal.querySelector("#cluster-port").setCustomValidity(__html("Wrong port number")); this.modal.querySelector(".cluster-port-notice").innerHTML = __html("Wrong port number"); }
                this.modal.querySelector("#cluster-port").parentElement.parentElement.classList.add('was-validated');

                regex = /[^\d+$]/g;
                if (regex.test(port)) { allow = false; this.modal.querySelector("#cluster-port").setCustomValidity(__html("Wrong characters")); this.modal.querySelector(".cluster-port-notice").innerHTML = __html("Port number should be numeric"); }
                this.modal.querySelector("#cluster-port").parentElement.parentElement.classList.add('was-validated');

                if (!allow) return false;

                if (action == 'edit') {

                    let index = parseInt(e.currentTarget.dataset.i);

                    this.services[index].host = host;
                    this.services[index].name = name;
                    this.services[index].port = port;
                    this.services[index].active_public = active_public;
                    this.services[index].active_private = active_private;

                    toast(__html("Endpoint updated"));
                } else {

                    let endpoint = { "host": host, "port": port, "name": name, "slug": this.app.slug, "private": name + "." + this.app.slug, "active_public": active_public, "active_private": active_private };

                    this.services.push(endpoint);

                    toast(__html("Endpoint created"));
                }

                // close modal
                simulateClick(document.querySelector(".close-modal"));

                this.render();

                this.listeners();
            });
        });

        // copy to clipboard
        onClick(this.selector + " .copy-record", e => {

            e.preventDefault();

            clipboard.writeText(e.currentTarget.dataset.record, 'selection');

            toast(__html('Copied'));
        });

        // sync endpoints
        onClick(this.selector + " .sync-endpoints", e => {

            let cb = () => { }
            run_script('cd ' + cache.path + ' && kubectl apply -f endpoints.yaml --kubeconfig=kubeconfig-sg.yaml', [], cb);

            toast(__html('Changes applied'));
        });

        // edit variable
        onClick(this.selector + " .endpoint-delete", e => {

            e.preventDefault();

            if (!confirm(__html("Remove this endpoint?"))) return;

            let index = parseInt(e.currentTarget.dataset.i);

            this.services.splice(index, 1);

            this.render();

            this.listeners();
        });
    }

    init() {

        if (document.querySelector(this.selector)) document.querySelector(this.selector).innerHTML = this.view();

        this.render();

        this.listeners();
    }

    get() {

        return this.services;
    }

    getAnnotations(cache) {

        // read endpoints
        if (cache.path) if (fs.existsSync(path.join(cache.path, 'endpoints.yaml'))) {

            try {

                const endpoints = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'endpoints.yaml'), 'utf8'));

                endpoints.forEach(endpoint => {

                    if (endpoint.kind == "Ingress") {

                        this.annotations = endpoint.metadata.annotations;
                    }
                });
            } catch (e) {

                console.log(e);

                parseError(e);
            }
        }

        if (!this.annotations) this.annotations = {
            "nginx.ingress.kubernetes.io/rewrite-target": "/",
            "ingress.kubernetes.io/force-ssl-redirect": 'false',
            "kubernetes.io/ingress.class": "nginx",
            "cert-manager.io/cluster-issuer": "letsencrypt",
            "nginx.ingress.kubernetes.io/proxy-body-size": "20m",
            "nginx.org/proxy-connect-timeout": "45s",
            "nginx.org/proxy-read-timeout": "45s",
            "nginx.org/client-max-body-size": "20m"
        }

        return this.annotations;
    }

    save() {

        let cache = getSetting(this.app.id);

        let annotations = this.getAnnotations(cache);

        // skip save if can not read annotations
        if (!annotations) return;

        // skip save if no changes
        // if (JSON.stringify(this.servicesOriginal) === JSON.stringify(this.services)) { log("no change"); return; }

        this.createEndpoints();

        // handle ingress
        let ingress = {
            apiVersion: "networking.k8s.io/v1",
            kind: "Ingress",
            metadata: {
                name: this.app.slug + "-ingress",
                namespace: this.app.slug,
                annotations: annotations
            },
            spec: {
                ingressClassName: "nginx",
                tls: [{ hosts: [], secretName: "letsencrypt-prod" }],
                rules: []
            }
        };

        let services = [];

        if (typeof this.services === "undefined") return;

        this.services.forEach(service => {

            if (!service.active_private) return;

            // generate services
            services.push({
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: service.name,
                    namespace: service.slug
                },
                spec: {
                    type: "ClusterIP",
                    selector: {
                        app: service.selector_app ? service.selector_app : this.app.slug + "-" + service.name
                    },
                    ports: [
                        {
                            port: parseInt(service.port),
                            name: "http"
                        }
                    ]
                }
            });

            if (!service.active_public) return;

            // generate ingress hosts
            ingress.spec.tls[0].hosts.push(service.host);
            ingress.spec.rules.push({
                host: service.host,
                http: {
                    paths: [
                        {
                            path: "/",
                            pathType: "Prefix",
                            backend: {
                                service: {
                                    name: service.name,
                                    port: {
                                        number: parseInt(service.port)
                                    }
                                }
                            }
                        }
                    ]
                }
            });
        });

        if (ingress.spec.rules.length) services.unshift(ingress);

        // no open hosts, delete ingress
        if (!ingress.spec.rules.length) { this.app.clusters.forEach(cluster => { run_script('cd ' + cache.path + ' && kubectl delete ingress ' + this.app.slug + '-ingress --kubeconfig=kubeconfig-' + cluster + '.yaml', [], () => { }); }) }

        // convert json to final endpoints.yaml file
        let endpointFile = services.map(ef => { return yaml.dump(ef, {}); }).join("---\n");

        // store to file
        try { fs.writeFileSync(path.join(cache.path, 'endpoints.yaml'), endpointFile, 'utf-8'); } catch (e) { console.log(e); }

        let cb = () => { }

        // apply changes to cluster
        this.app.clusters.forEach(cluster => { run_script('cd ' + cache.path + ' && kubectl apply -f endpoints.yaml --kubeconfig=kubeconfig-' + cluster + '.yaml', [], cb); });
    }

    endpoint() {

        let settings = getKenzapSettings();

        return ".endpoint-" + settings.id + ".kenzap.cloud";
    }

    createEndpoints() {

        let settings = getKenzapSettings();

        if (!settings.id) settings.id = getToken(12);

        // let cluster = this.app.clusters[0];

        if (!this.services) return;

        this.services.forEach(endpoint => {

            let ips = [];

            settings.clusters.forEach(cluster => {

                if (this.app.clusters.includes(cluster.id)) ips.push(cluster.servers[0].server);
            });

            // let cluster = settings.clusters.find(cluster => cluster.id == this.app.clusters[0]);

            endpoint.ips = { "routing": "default", ips: ips };
        });

        // log(settings.id);
        // log(this.services);

        // get free registry https://api.kenzap-apps.app.kenzap.cloud/v2/?cmd=create_endpoints&kenzap_id=Y4uR3s&app_slug=app-39987
        fetch(API() + "?cmd=create_endpoints&kenzap_id=" + settings.id + "&app_id=" + this.app.id + "&endpoints=" + JSON.stringify(this.services), {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Kenzap-Locale': "en",
                'Kenzap-Token': localStorage.getItem("kenzap_token")
            }
        })
            .then(response => response.json())
            .then(response => {

                if (response.success) {

                    saveKenzapSettings({ id: settings.id });

                } else {

                    hideLoader();

                    switch (response.code) {

                        case 411:

                            alert(__html('Endpoint already exists'))
                            break;
                        default:
                            parseError(response);
                            break;
                    }
                }
            })
            .catch(error => {

                parseError(error);
            });
    }
}