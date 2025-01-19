import global from "./global.js"
import { ipcRenderer } from 'electron'
import { __html, attr, onClick, toast, simulateClick, getToken, getKenzapSettings, saveKenzapSettings } from './helpers.js'
import ServerDown from "../../assets/img/undraw_server_down_s-4-lk.svg"
import { downloadKubeconfig, retrieveAllClusterNodes } from './cluster-kubernetes-helpers.js'
import slugify from 'slugify'

/**
 * Class representing the ClusterAdd functionality.
 */
export class ClusterAdd {

    /**
     * Create a ClusterAdd instance.
     * @param {Object} global - The global object containing state and settings.
     */
    constructor(global) {

        this.selector = "edge-clusters-add";
        this.global = global;
        this.clusterEditId = global.state.clusterEditId ? global.state.clusterEditId : null;
        this.settings = getKenzapSettings();
        this.servers = [];
        this.cluster = {};

        if (this.clusterEditId) {

            this.cluster = this.settings.clusters.find(c => c.id === this.clusterEditId);

            if (this.cluster) { this.servers = this.cluster.servers; }
        }

        this.init();
    }

    /**
     * Generate the HTML view for the cluster add form.
     * @returns {string} The HTML string for the cluster add form.
     */
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
                                                <input type="text" class="form-control inp-key key-path" placeholder="SSH Key" aria-describedby="ssh-key" value="" readonly>
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
                                    </tr>

                                </tbody>
                            </table>
                        </div>

                        <div class="name-cont no-servers-cnt form-group ${this.servers.length ? 'd-none' : ''}">
                            <div class="my-4 d-flex">
                                <img src="${ServerDown}" class="img-fluid m-auto" style="max-width: 300px;">
                            </div>
                            <p class="form-text">${__html('No clusters available. Please create one.')}</p>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Render the table view of the servers.
     */
    tableView() {

        // remove all existing server rows
        document.querySelectorAll(".server-row").forEach(row => row.remove());

        // render all server records
        this.servers.forEach((server, i) => {

            let serverList = document.querySelector(".server-list");

            let row = document.createElement("tr");
            row.classList.add("server-row");
            row.innerHTML = `
                <td class="fw-normal d-flex align-items-center px-1">
                    <div class="endpoint-status ${server.status}" data-id="${attr(server.id)}"></div>
                    <div class="d-flex ms-2 align-items-center">
                        ${server.server}
                    </div>  
                </td>
                <td class="fw-normal px-2 ">
                    ${server.port}
                </td>
                <td class="fw-normal px-2 form-text">
                    ${server.username}
                </td>
                <td class="fw-normal px-2 elipsized form-text" style="max-width:260px;">
                    ${server.key.split(/[\\/]/).pop()}
                </td>
                <td class="text-end">
                    <div class="dropdown serversActionsCont">
                        <svg id="serversActions${i}" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-three-dots-vertical dropdown-toggle po" viewBox="0 0 16 16">
                            <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                        </svg>
                        <ul class="dropdown-menu" aria-labelledby="serversActions${i}" style="">
                            <li><a class="dropdown-item po server-edit add-endpoint" href="#" data-action="edit" data-i="${attr(i)}" data-id="${attr(server.id)}" data-bs-toggle="modal" data-bs-target=".modal">${__html('Edit')}</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item po server-delete" href="#" data-i="${attr(i)}" >${__html('Remove')}</a></li>
                        </ul>
                    </div>
                </td>
            `;

            serverList.appendChild(row);
        });

        // delete server record
        onClick('.server-delete', e => {

            e.preventDefault();

            if (!confirm(__html('Are you sure you want to delete this server?'))) return;

            let i = parseInt(e.currentTarget.dataset.i);

            this.servers.splice(i, 1);

            this.tableView();
        });

        // edit server record
        onClick('.server-edit', e => {

            e.preventDefault();

            let i = parseInt(e.currentTarget.dataset.i);

            let server = this.servers[i];

            console.log(server);

            document.querySelector(".server-list .inp-server").value = server.server;
            document.querySelector(".server-list .inp-port").value = server.port;
            document.querySelector(".server-list .inp-username").value = server.username;
            document.querySelector(".server-list .inp-key").value = server.key;

            this.servers.splice(i, 1);

            this.tableView();

            document.querySelector(".no-servers-cnt").classList.add("d-none");
        });
    }

    /**
     * Set up event listeners for the cluster add form.
     */
    listeners() {

        // path picker
        document.querySelector('.key-path').addEventListener('click', e => {

            e.preventDefault();

            ipcRenderer.invoke("pick-file", []).then(returnValue => {

                if (!returnValue.filePaths.length) return;

                let keyPathInput = document.querySelector(".key-path");
                keyPathInput.value = returnValue.filePaths[0];
                keyPathInput.scrollLeft = keyPathInput.scrollWidth;
            });
        });

        // add server
        onClick('.add-server', e => {

            e.preventDefault();

            const serverInput = document.querySelector(".server-list .inp-server");
            const portInput = document.querySelector(".server-list .inp-port");
            const usernameInput = document.querySelector(".server-list .inp-username");
            const keyInput = document.querySelector(".server-list .inp-key");

            const server = serverInput.value.trim();
            const port = portInput.value.trim();
            const username = usernameInput.value.trim();
            const key = keyInput.value.trim();

            // Validate server (IP address)
            const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (!ipRegex.test(server)) {
                serverInput.classList.add('is-invalid');
                return;
            } else {
                serverInput.classList.remove('is-invalid');
            }

            // Validate port (1-65535)
            const portNumber = parseInt(port, 10);
            if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
                portInput.classList.add('is-invalid');
                return;
            } else {
                portInput.classList.remove('is-invalid');
            }

            // Validate username (non-empty)
            if (username.length === 0) {
                usernameInput.classList.add('is-invalid');
                return;
            } else {
                usernameInput.classList.remove('is-invalid');
            }

            this.servers.push(
                { "id": getToken(6), "status": "not-active", "server": server, "port": port, "username": username, "key": key }
            );

            this.tableView();

            document.querySelector(".no-servers-cnt").classList.add("d-none");

            serverInput.value = "";
            portInput.value = "";
            usernameInput.value = "";
            keyInput.value = "";
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

    /**
     * Get the selected clusters.
     * @returns {Array} An array of selected cluster regions.
     */
    get() {

        let clusterArr = [];

        // get data centers
        [...document.querySelectorAll('.cluster-picker')].forEach(cluster => {

            if (cluster.classList.contains("selected")) clusterArr.push(cluster.dataset.region);
        });

        return clusterArr;
    }

    /**
     * Initialize the cluster add form.
     */
    init() {

        // console.log("ClusterAdd" + this.global.state.clusterEditId);

        // add or edit
        let action = 'new';

        // get modal html
        this.modal = document.querySelector(".modal");

        // set wide screen
        document.querySelector(".modal-dialog").classList.add("modal-lg");

        // header
        document.querySelector(".modal-header").innerHTML = `
            <h5 class="modal-title cluster-name px-1" contenteditable="true">${this.cluster.name ? this.cluster.name : __html("My Cluster")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        `;

        // buttons
        document.querySelector(".modal-footer").innerHTML =
            `
        <div class="btn-group" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Cancel")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary create-cluster-btn" data-i=${0} data-action="${action}">${this.clusterEditId ? __html("Update cluster") : __html("Create cluster")}</button>
        </div>
        `;

        this.modal.querySelector(".modal-body").innerHTML = this.view();
        this.modal.querySelector(".inp-server").focus();

        onClick(".create-cluster-btn", e => {

            let cluster_id;

            // validate
            let name = this.modal.querySelector(".cluster-name").innerHTML.trim();
            if (name.length < 2) { alert("Cluster name is too short") }

            let regex = /[^a-z_]/g;
            if (!regex.test(name)) { alert("Please provide valid cluster name"); }

            if (!this.settings.clusters) this.settings.clusters = [];

            // update
            if (this.clusterEditId) {

                cluster_id = this.clusterEditId;

                this.settings.clusters = this.settings.clusters.map(c => c.id === this.clusterEditId ? { ...c, name: name, slug: slugify(name.toLowerCase()), status: "creating", servers: this.servers } : c);

                setTimeout(() => toast(__html("Cluster updated")), 1000);

                // console.log("Cluster updated", this.settings.clusters);
            }

            // create
            if (!this.clusterEditId) {

                cluster_id = getToken(6);

                this.settings.clusters.push({ "id": cluster_id, "name": name, "slug": slugify(name.toLowerCase()), "status": "creating", "servers": this.servers, "created": new Date().getTime(), "updated": new Date().getTime() });

                setTimeout(() => toast(__html("Cluster created")), 1000);
            }

            retrieveAllClusterNodes(this.settings.clusters.find(c => c.id === cluster_id), global.state.cb);

            // close modal
            simulateClick(document.querySelector(".close-modal"));

            // save settings
            saveKenzapSettings(this.settings);

            // save kubeconfig file
            downloadKubeconfig(cluster_id);

            // callback
            if (typeof global.state.cb === 'function') global.state.cb(global);
        });

        if (this.clusterEditId) this.tableView();

        this.listeners();
    }
}