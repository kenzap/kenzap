import global from "./global.js"
import { ipcRenderer } from 'electron'
import { __html, attr, onClick, toast, simulateClick, getToken, getKenzapSettings, saveKenzapSettings } from './helpers.js'
import ServerNew from "../../assets/img/undraw_code-thinking_0vf2.svg"
import { downloadKubeconfig, retrieveAllClusterNodes } from './cluster-kubernetes-helpers.js'
import { installLocalCluster } from './cluster-create-helpers.js'
import slugify from 'slugify'

/**
 * Class representing the ClusterAdd functionality.
 */
export class ClusterLocalAdd {

    /**
     * Create a ClusterAdd instance.
     * @param {Object} global - The global object containing state and settings.
     */
    constructor(global) {

        this.selector = "edge-clusters-add";
        this.global = global;
        this.clusterEditId = global.state.clusterEditId ? global.state.clusterEditId : null;
        this.loading = false;
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
                <div class="form-group- main-body mt-3">
                    <div class="form-group- mt-1">
                        <div class="name-cont no-servers-cnt form-group ${this.servers.length ? 'd-none' : ''}">
                            <div class="my-4 d-flex">
                                <img src="${ServerNew}" class="img-fluid m-auto" style="max-width: 400px;">
                            </div>
                            <p class="form-text">${__html('Click on Create Cluster to continue with the installation process.')}</p>
                        </div>
                    </div>
                </div>
                <div class="form-group log-body d-none my-5 py-5 text-center-">
                    <div class="m-auto" style="max-width: 500px;">
                        <console-output-modal class="form-text text-start"> </console-output-modal>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Set up event listeners for the cluster add form.
     */
    listeners() {

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
            <h5 class="modal-title cluster-name px-1" contenteditable="true">${this.cluster.name ? this.cluster.name : __html("My Local Cluster")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        `;

        // Prevent custom HTML code from being entered in the contenteditable element
        document.querySelector(".cluster-name").addEventListener("paste", (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData("text");
            document.execCommand("insertText", false, text);
        });

        // buttons
        document.querySelector(".modal-footer").innerHTML = `
        <button id="btn-close" type="button" class="btn btn-outline-dark d-none close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Close")}</button>
        <div class="btn-group" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" tabindex="-1">${__html("Cancel")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary btn-cluster-create" data-action="${action}">${this.clusterEditId ? __html("Update cluster") : __html("Create cluster")}</button>
        </div>
        `;

        this.modal.querySelector(".modal-body").innerHTML = this.view();

        onClick(".btn-cluster-create", e => {

            e.preventDefault();

            if (this.loading) return;

            this.setLoading(true);

            installLocalCluster(
                (status) => {

                    this.setLoading(false);

                    if (status) {

                        // close modal
                        simulateClick(document.querySelector(".close-modal"));

                        // save settings
                        // saveKenzapSettings(this.settings);

                        // callback
                        // if (typeof global.state.cb === 'function') global.state.cb(global);
                    }

                },
            );

            // let cluster_id;

            // // validate
            // let name = this.modal.querySelector(".cluster-name").innerHTML.trim();
            // if (name.length < 2) { alert("Cluster name is too short"); return; }

            // let regex = /[^a-z_]/g;
            // if (!regex.test(name)) { alert("Please provide valid cluster name"); return; }

            // if (!this.settings.clusters) this.settings.clusters = [];

            // // update
            // if (this.clusterEditId) {

            //     cluster_id = this.clusterEditId;

            //     this.settings.clusters = this.settings.clusters.map(c => c.id === this.clusterEditId ? { ...c, name: name, slug: slugify(name.toLowerCase()), status: "creating", servers: this.servers } : c);

            //     setTimeout(() => toast(__html("Cluster updated")), 1000);

            //     // console.log("Cluster updated", this.settings.clusters);
            // }

            // // create
            // if (!this.clusterEditId) {

            //     cluster_id = getToken(6);

            //     if (!this.servers.length) { toast(__html("Click on plus sign to add server to the list")); return; }

            //     this.settings.clusters.push({ "id": cluster_id, "name": name, "slug": slugify(name.toLowerCase()), "status": "creating", "servers": this.servers, "created": new Date().getTime(), "updated": new Date().getTime() });

            //     setTimeout(() => toast(__html("Cluster created")), 1000);
            // }

            // // retrieveAllClusterNodes(this.settings.clusters.find(c => c.id === cluster_id), global.state.cb);

            // // close modal
            // simulateClick(document.querySelector(".close-modal"));

            // // save settings
            // saveKenzapSettings(this.settings);

            // // save kubeconfig file
            // downloadKubeconfig(cluster_id);

            // // callback
            // if (typeof global.state.cb === 'function') global.state.cb(global);
        });

        // previous action listener
        onClick(".app-picker-back", e => {

            if (this.loading) return;

            simulateClick(document.querySelector(".close-modal"));

            // new AppCreateImage(this.app);
        });

        // if (this.clusterEditId) this.tableView();

        this.listeners();
    }

    setLoading(state) {

        if (state) {

            document.querySelector('.btn-cluster-create').innerHTML = `
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                ${__html('Creating...')}
            `;

            document.querySelector('.log-body').classList.remove('d-none');
            document.querySelector('.main-body').classList.add('d-none');

            this.loading = true;

        } else {

            setTimeout(() => {

                if (document.querySelector('.btn-cluster-create')) document.querySelector('.btn-cluster-create').innerHTML = `
                    <span class="d-flex d-none" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle me-2" viewBox="0 0 16 16">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>  
                    </span>
                    ${__html('Create')}
                    `;
            }, 3000);

            this.loading = false;

            document.querySelector('.log-body').classList.add('d-none');
            document.querySelector('.main-body').classList.remove('d-none');

            // hideLoader();
        }
    }
}