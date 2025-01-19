
import global from "./global.js"
import { clipboard } from 'electron'
import { __html, html, attr, onClick, toast, onKeyUp, onChange, showLoader, hideLoader, parseError } from './helpers.js'
import { EdgeClustersAdd } from './edge-clusters-add.js'
import ServerDown from "../../assets/img/undraw_server_down_s-4-lk.svg"


export class EdgeClustersManage {

    constructor(global) {

        this.selector = "edge-clusters-manage";
        this.global = global;
        this.app = this.global.state.app;

        if (!this.app.clusters) this.app.clusters = [];

        this.init();
    }

    view() {

        let action = 'add', active_private = 1, active_public = 0, name = "", portNew = 80, host = "." + this.app.slug + ".app.kenzap.cloud";

        return `
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
            </div>`;
    }

    viewEmpty() {

        return `
            <div class="form-cont">
                <div class="form-group- mt-3">
                    <div class="form-group- mt-1">
                        <div class="name-cont private-cnt form-group">
                            <div class="mb-1 d-flex">
                                <img src="${ServerDown}" class="img-fluid m-auto" style="max-width: 300px;">
                            </div>
                            <p>${__html('No clusters available. Please create one.')}</p>
                        </div>
                    </div>
                </div>
            </div>`;
    }

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

        // copy to clipboard
        onClick(this.selector + " .copy-record", e => {

            e.preventDefault();

            clipboard.writeText(e.currentTarget.dataset.record, 'selection');

            toast(__html('Copied'));
        });

        // prevent data center select if users copies IP
        onClick(this.selector + " .ip-picker", e => {

            e.preventDefault();

            console.log("block .ip-picker");

            this.skip = true;
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
        document.querySelector(".modal-dialog").classList.add("modal-wide");

        // set product modal title
        document.querySelector(".modal-title").innerHTML = action == 'edit' ? __html("Edit Cluster") : __html("Available Clusters");

        // buttons
        document.querySelector(".modal-footer").innerHTML =
            `
        <div class="btn-group" role="group" aria-label="Basic example">
            <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Close")}</button>
            <button id="btn-primary" type="button" class="btn btn-outline-primary add-cluster-btn" data-i=${0} data-action="${action}">${action == 'edit' ? __html("Edit endpoint") : __html("Add cluster")}</button>
        </div>
        `;

        // vars
        let portNew = 80, name = "", service = "", host = "." + this.app.slug + ".app.kenzap.cloud", active_public = 0, active_private = 1;


        if (!this.app.clusters.length) this.modal.querySelector(".modal-body").innerHTML = this.viewEmpty();

        if (this.app.clusters.length) { this.modal.querySelector(".modal-body").innerHTML = this.view(); this.modal.querySelector("#cluster-name").focus(); }

        let nameType = (e) => {

            e.preventDefault();

            document.querySelector("#public-name").value = e.currentTarget.value.trim() + "." + this.app.slug + ".app.kenzap.cloud";
        }

        onKeyUp("#cluster-name", e => { if (action != 'edit') nameType(e); });
        onChange("#cluster-name", e => { if (action != 'edit') nameType(e); });

        onChange("#active_private", e => { if (!e.currentTarget.checked) { document.querySelector("#active_public").checked = false; document.querySelector(".public-cnt").style = "opacity:0.4;"; document.querySelector("#active_public").setAttribute('disabled', true); } else { document.querySelector("#active_public").removeAttribute('disabled'); document.querySelector(".public-cnt").style = "opacity:1;"; } });

        onClick(".add-cluster-btn", e => {

            this.app.edgeClustersAdd = new EdgeClustersAdd(this.global);
        });
    }
}