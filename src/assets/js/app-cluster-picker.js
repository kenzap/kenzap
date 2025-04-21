
import global from "./global.js"
import { clipboard } from 'electron'
import { __html, html, attr, onClick, toast, getKenzapSettings, log } from './helpers.js'
import "../scss/app-cluster-picker.css"

export class AppClusterPicker {

    constructor(app) {

        this.selector = "app-cluster-picker";
        this.app = app || global.state.app || {};

        if (!this.app) this.app = { clusters: [] };
        if (!this.app.clusters) this.app.clusters = [];
    }

    view() {

        if (!this.app.clusters.length) this.app.clusters = [this.clusters[0].id];

        return `
            <div class="${this.app.ui == "dialog" ? '' : 'col-sm-7'} pt-3">
                <h5 class="card-title ${this.app.ui == "dialog" ? 'd-none' : ''}">${__html('Clusters')}</h5>
                <p class="form-text">${__html('Deploy and run your app across one or multiple clusters.')}</p>
                <div class="map-regions-">
                    <ul class="${this.app.ui == "dialog" ? 'small-block-grid-2' : 'small-block-grid-3'}">

                        ${this.clusters.map(cluster => {

            return `
                                <li>
                                    <div id="${attr(cluster.id)}" class="cluster-picker ember-view ${this.app.clusters.includes(cluster.id) ? 'selected' : ''}" data-region="${cluster.id}"> 
                                        <span role="button" class="name my-2" >
                                            ${html(cluster.name.replace(/&nbsp;/g, ' '))} 
                                            <div class="ms-0 mt-0 form-text"><span class="ip-picker" style="font-size: 10px;">${cluster.servers[0].server} <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" data-record="${attr(cluster.servers[0].server)}" class="bi bi-copy po mb-1 ms-1 ip-picker copy-record" viewBox="0 0 16 16"> <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg> </span></div>
                                        </span>
                                    </div>
                                </li>`;

        }).join('')}

                    </ul>
                </div>
                <div class="clearfix"></div>
            </div>`;
    }

    listeners() {

        // data center picker
        onClick(this.selector + " .cluster-picker", e => {

            e.preventDefault();

            setTimeout((el) => {

                if (this.skip) { this.skip = false; return; }

                if (el.classList.contains("grayed")) { alert('Region is disabled'); return; }

                log("block .cluster-picker");

                // remove selected class from all data centers
                [...document.querySelectorAll('.cluster-picker.selected')].forEach(dtc => {
                    if (dtc.classList.contains("selected")) dtc.classList.remove("selected");
                });

                global.state.dtc_update = true;

                if (el.classList.contains("selected")) {

                    el.classList.remove("selected");
                } else {

                    // check if more than one data center is selected. Allow to pick only one during creation
                    if (!this.app.title && [...document.querySelectorAll('.region-picker.selected')].length) {

                        alert('You can select only one region during app creation.');
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

        let dtcArr = [];

        // get data centers
        [...document.querySelectorAll('.cluster-picker')].forEach(dtc => {

            if (dtc.classList.contains("selected")) dtcArr.push(dtc.dataset.region);
        });

        console.log("get data centers", dtcArr);

        return dtcArr;
    }

    init() {

        this.settings = getKenzapSettings();

        // log("AppClusterPicker", this.settings);

        this.clusters = this.settings.clusters || [];

        document.querySelector(this.selector).innerHTML = this.view();

        this.listeners();
    }
}