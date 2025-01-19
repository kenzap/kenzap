
import global from "./global.js"
import { clipboard } from 'electron'
import { __html, onClick, toast } from './helpers.js'
import { EdgeClustersManage } from './edge-clusters-manage.js'
import { EdgeClustersAdd } from './edge-clusters-add.js'

export class EdgeClusters {

    constructor(global) {

        this.selector = "edge-clusters";
        this.global = global;
        this.app = this.global.state.app;

        if (!this.app) this.app = { clusters: [] };
    }

    view() {

        return `
            <div class="col-sm-7 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Clusters')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-sliders2 ms-3 me-1 po text-primary manage-cluster d-none-" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M10.5 1a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V4H1.5a.5.5 0 0 1 0-1H10V1.5a.5.5 0 0 1 .5-.5M12 3.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m-6.5 2A.5.5 0 0 1 6 6v1.5h8.5a.5.5 0 0 1 0 1H6V10a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5M1 8a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2A.5.5 0 0 1 1 8m9.5 2a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V13H1.5a.5.5 0 0 1 0-1H10v-1.5a.5.5 0 0 1 .5-.5m1.5 2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5"/>
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary add-cluster" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                </div>
                <p class="form-text">${__html('Host this app in one or more clusters.')}</p>
                <div class="map-regions-">
                    <ul class="small-block-grid-3">
                       
                    </ul>
                </div>
                <div class="clearfix"></div>
            </div>`;
    }

    listeners() {

        // add variable
        onClick('.manage-cluster', e => {

            e.preventDefault();

            this.app.edgeClustersManage = new EdgeClustersManage(this.global);
        });

        // add variable
        onClick('.add-cluster', e => {

            e.preventDefault();

            this.app.edgeClustersAdd = new EdgeClustersAdd(this.global);
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

        document.querySelector('data-centers').innerHTML = this.view();

        this.listeners();
    }
}