import global from "./global.js"
import { ipcRenderer } from 'electron'
import { __html, attr, onClick, getToken } from './helpers.js'
import ServerDown from "../../assets/img/undraw_server_down_s-4-lk.svg"

export class EdgeClustersAdd {

    constructor(global) {

        this.selector = "edge-clusters-add";
        this.global = global;
        this.app = this.global.state.app;
        this.servers = [];

        if (!this.app.clusters) this.app.clusters = [];

        this.init();
    }

    view() {

        return `
            <div class="form-cont">
                <div class="form-group- mt-3">
                    <div class="form-group- mt-1">
                        <div class="table-responsive">
                            <table class="table table-borderless align-middle table-striped- mb-0" style="min-width:300px;">
                                <thead>
                                    <tr class="d-none-">
                                        <th class="fw-normal">${__html('Server')}</th>
                                        <th class="fw-normal">${__html('Port')}</th>
                                        <th class="fw-normal">${__html('Username')}</th>
                                        <th class="fw-normal">${__html('SSH Key')}</th>
                                        <th class="fw-normal"></th>
                                    </tr>
                                </thead>
                                <tbody class="server-list">
                                    <tr>
                                        <td class="fw-normal">
                                            <div class="d-flex align-items-center">
                                                <input type="text" class="form-control inp-server" placeholder="198.108.100.100" aria-describedby="server-port">
                                            </div>
                                        </td>
                                        <td class="fw-normal">
                                            <div class="d-flex align-items-center">
                                                <input type="text" class="form-control inp-port" placeholder="22" aria-describedby="port" style="max-width:72px;">
                                            </div>
                                        </td>
                                        <td class="fw-normal">
                                            <div class="d-flex align-items-center">
                                                <input type="text" class="form-control inp-username" placeholder="root" aria-describedby="username">
                                            </div>
                                        </td>
                                        <td class="fw-normal">
                                            <div class="d-flex align-items-center">
                                                <input type="text" class="form-control inp-key key-path" placeholder="SSH Key" aria-describedby="ssh-key" value="${attr(global.state.app.path || getDefaultAppPath() + require('path').sep)}">
                                            </div>
                                        </td>
                                        <td class="fw-normal">
                                            <div class="d-flex align-items-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-plus-circle card-title ms-0 me-0 mb-0 po text-primary add-server" viewBox="0 0 16 16" data-action="add" >
                                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                                                    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                                                </svg>
                                            </div>
                                        </td>
                                </tbody>
                            </table>
                        </div>

                        <div class="name-cont no-servers-cnt form-group">
                            <div class="my-2 d-flex">
                                <img src="${ServerDown}" class="img-fluid m-auto" style="max-width: 300px;">
                            </div>
                            <p>${__html('No clusters available. Please create one.')}</p>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    tableView() {

        // render all server records
        this.servers.forEach((server, i) => {

            let serverList = document.querySelector(".server-list");

            let row = document.createElement("tr");
            row.innerHTML = `
                <td class="fw-normal d-flex align-items-center px-1">
                    <div class="endpoint-status ${server.status}" data-id="${attr(this.app.id)}"></div>
                    <div class="d-flex ms-2 align-items-center">
                        ${server.server}
                    </div>  
                </td>
                <td class="fw-normal px-2">
                    ${server.port}
                </td>
                <td class="fw-normal px-2">
                    ${server.username}
                </td>
                <td class="fw-normal px-2">
                    ${server.key}
                </td>
                <td class="text-end">
                    <div class="dropdown serversActionsCont">
                        <svg id="serversActions${i}" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-three-dots-vertical dropdown-toggle po" viewBox="0 0 16 16">
                            <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                        </svg>
                        <ul class="dropdown-menu" aria-labelledby="serversActions${i}" style="">
                            <li><a class="dropdown-item po server-edit add-endpoint" href="#" data-action="edit" data-i="${attr(i)}" data-id="${attr(server.id)}" data-bs-toggle="modal" data-bs-target=".modal">${__html('Edit')}</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item po server-delete" href="#" data-i="${attr(i)}"  >${__html('Remove')}</a></li>
                        </ul>
                    </div>
                </td>
            `;

            serverList.appendChild(row);
        });

        // delete server record
        onClick('.server-delete', e => {

            e.preventDefault();

            let i = parseInt(e.currentTarget.dataset.i);

            this.servers.splice(i, 1);

            this.tableView();
        });

        // edit server record
        onClick('.server-edit', e => {

            e.preventDefault();

            let i = parseInt(e.currentTarget.dataset.i);

            let server = this.servers[i];

            document.querySelector(".server-list .inp-server").value = server.server;
            document.querySelector(".server-list .inp-port").value = server.port;
            document.querySelector(".server-list .inp-username").value = server.username;
            document.querySelector(".server-list .inp-key").value = server.key;

            this.servers.splice(i, 1);

            this.tableView();

            document.querySelector(".no-servers-cnt").classList.add("d-none");
        });
    }

    listeners() {

        // path picker
        document.querySelector('.key-path').addEventListener('click', e => {

            e.preventDefault();

            ipcRenderer.invoke("pick-folder", []).then(returnValue => {

                if (!returnValue.filePath) return;

                let pathArr = returnValue.filePath.split('/');
                pathArr.pop();
                let path = pathArr.join('/');

                document.querySelector(".key-path").value = path;
            });
        });

        // add server
        onClick('.add-server', e => {

            e.preventDefault();

            this.servers.push(
                { "id": getToken(6), "status": "not-active", "server": document.querySelector(".server-list .inp-server").value, "port": document.querySelector(".server-list .inp-port").value, "username": document.querySelector(".server-list .inp-username").value, "key": document.querySelector(".server-list .inp-key").value }
            );

            this.tableView();

            document.querySelector(".no-servers-cnt").classList.add("d-none");

            document.querySelector(".server-list .inp-server").value = "";
            document.querySelector(".server-list .inp-port").value = "";
            document.querySelector(".server-list .inp-username").value = "";
            document.querySelector(".server-list .inp-key").value = "";
        });

        // data center picker
        onClick(this.selector + " .cluster-picker", e => {

            e.preventDefault();

            setTimeout((el) => {

                if (this.skip) { this.skip = false; return; }

                if (el.classList.contains("grayed")) { alert('Cluster is disabled'); return; }

                global.state.cluster_update = true;

                if (el.classList.contains("selected")) {

                    el.classList.remove("selected");
                } else {

                    // check if more than one data center is selected. Allow to pick only one during creation
                    if (!this.app.title && [...document.querySelectorAll('.cluster-picker.selected')].length) {

                        alert('Can only select one cluster during app creation.');
                        return;
                    }

                    el.classList.add("selected");
                }
            }, 100, e.currentTarget);
        });

    }

    get() {

        let clusterArr = [];

        // get data centers
        [...document.querySelectorAll('.cluster-picker')].forEach(cluster => {

            if (cluster.classList.contains("selected")) clusterArr.push(cluster.dataset.region);
        });

        return clusterArr;
    }

    init() {

        // add or edit
        let action = 'new';

        // get modal html
        this.modal = document.querySelector(".modal");

        // set wide screen
        document.querySelector(".modal-dialog").classList.add("modal-lg");

        // set product modal title
        document.querySelector(".modal-title").innerHTML = __html("My Cluster");
        document.querySelector(".modal-title").classList.add("px-1");
        document.querySelector(".modal-title").setAttribute("contenteditable", "true");

        // buttons
        document.querySelector(".modal-footer").innerHTML =
            `
        <div class="btn-group" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Cancel")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary create-cluster-btn" data-i=${0} data-action="${action}">${action == 'edit' ? __html("Edit endpoint") : __html("Create cluster")}</button>
        </div>
        `;

        this.modal.querySelector(".modal-body").innerHTML = this.view();
        this.modal.querySelector(".inp-server").focus();


        onClick(".create-cluster-btn", e => {

            // let allow = true;

            // // reset
            // this.modal.querySelector("#cluster-name").setCustomValidity(""); this.modal.querySelector(".cluster-name-notice").innerHTML = "";
            // this.modal.querySelector("#cluster-port").setCustomValidity(""); this.modal.querySelector(".cluster-port-notice").innerHTML = "";
            // this.modal.querySelector("#cluster-name").parentElement.classList.remove('is-invalid');

            // // validate
            // let name = this.modal.querySelector("#cluster-name").value.trim().toLowerCase();
            // let host = document.querySelector("#public-name").value.trim().toLowerCase();
            // let port = this.modal.querySelector("#cluster-port").value.trim();
            // let active_private = this.modal.querySelector("#active_private").checked ? 1 : 0;
            // let active_public = this.modal.querySelector("#active_public").checked ? 1 : 0;

            // if(name.length < 2){ allow = false; this.modal.querySelector("#cluster-name").setCustomValidity( __html("Endpoint too short") ); this.modal.querySelector(".cluster-name-notice").innerHTML = __html("Name too short"); this.modal.querySelector("#cluster-name").parentElement.classList.add('is-invalid'); }
            // this.modal.querySelector("#cluster-name").parentElement.parentElement.classList.add('was-validated');

            // let regex = /[^a-z_]/g;
            // if(regex.test(name)){ allow = false; this.modal.querySelector("#cluster-name").setCustomValidity( __html("Wrong characters") ); this.modal.querySelector(".cluster-name-notice").innerHTML = __html("Wrong characters found"); this.modal.querySelector("#cluster-name").parentElement.classList.add('is-invalid'); }
            // this.modal.querySelector("#cluster-name").parentElement.parentElement.classList.add('was-validated');

            // if(port.length < 2 || port.length > 4){ allow = false; this.modal.querySelector("#cluster-port").setCustomValidity( __html("Wrong port number") ); this.modal.querySelector(".cluster-port-notice").innerHTML = __html("Wrong port number"); }
            // this.modal.querySelector("#cluster-port").parentElement.parentElement.classList.add('was-validated');

            // regex = /[^\d+$]/g;
            // if(regex.test(port)){ allow = false; this.modal.querySelector("#cluster-port").setCustomValidity( __html("Wrong characters") ); this.modal.querySelector(".cluster-port-notice").innerHTML = __html("Port number should be numeric"); }
            // this.modal.querySelector("#cluster-port").parentElement.parentElement.classList.add('was-validated');

            // if(!allow) return false;

            // // console.log("active_public " + active_public);

            // if(action == 'edit'){

            //     let index = parseInt(e.currentTarget.dataset.i);

            //     this.servers[index].host = host;
            //     this.servers[index].name = name;
            //     this.servers[index].port = port;
            //     this.servers[index].active_public = active_public;
            //     this.servers[index].active_private = active_private;

            //     toast( __html("Endpoint updated") );
            // }else{

            //     let endpoint = { "host": host, "port": port, "name": name, "slug": this.app.slug, "private": name + "." + this.app.slug, "active_public": active_public, "active_private": active_private };

            //     this.servers.push(endpoint);

            //     toast( __html("Endpoint created") );
            // }

            // // close modal
            // simulateClick(document.querySelector(".close-modal"));

            // // this.render();

            // this.listeners();
        });

        this.listeners();
    }
}