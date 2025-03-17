
import { __html, attr, getKenzapSettings, saveKenzapSettings } from './helpers.js'
import { getAppRegistry, updateDevspace, deleteRegistryTag, updateApp } from './app-registry-helpers.js'

export class AppRegistry {

    constructor(global) {

        this.selector = "app-registry";
        this.registry = {
            domain: "",
            user: "",
            pass: ""
        };
        this.global = global;
    }

    view() {

        document.querySelector(this.selector).innerHTML = `
            <div class="col-sm-7 pt-3 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Registry')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary  d-none" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                </div>
                <p class="form-text">${__html('This app uses <a href="#">%1$</a> image tag.', this.global.state.app.tags ? this.global.state.app.tags[this.global.state.app.tags.length - 1] : "-")}</p>
                <div class="mb-3 row d-none-">
                    <label for="appRegistryDomain" class="col-sm-3 col-form-label ">${__html('Registry')}</label>
                    <div class="col-sm-9">
                        <input type="text" class="form-control" id="appRegistryDomain" value="${attr(this.registry.domain)}">
                    </div>
                </div>
                <div class="mb-3 row d-none-">
                    <label for="appRegistryUser" class="col-sm-3 col-form-label ">${__html('Username')}</label>
                    <div class="col-sm-9">
                        <input type="text" class="form-control" id="appRegistryUser" value="${attr(this.registry.user)}">
                    </div>
                </div>
                <div class="mb-4 row d-none-">
                    <label for="appRegistryPass" class="col-sm-3 col-form-label ">${__html('Password')}</label>
                    <div class="col-sm-9">
                        <input type="password" class="form-control" id="appRegistryPass" value="${attr(this.registry.pass)}">
                    </div>
                </div>
            </div>
            `;
    }

    resources() {

        let val = parseInt(document.querySelector('#app-ram').value);

        document.querySelector(".cpu-ram").innerHTML = `
        <div class="fs-5 fw-bold text-secondary mb-0">${this.tiers[val].ramtxt}</div>
        <div class="mt-0"><div style="margin-top:-4px;" class="form-text text-secondary">${this.tiers[val].ops} ${__html('OPS')} <sub>${__html('sec')}</sub></div></div>`;

        this.specs = this.tiers[val];
        this.specs.tier = val;
    }

    get() {

        this.registry = {
            domain: document.querySelector('#appRegistryDomain').value,
            user: document.querySelector('#appRegistryUser').value,
            pass: document.querySelector('#appRegistryPass').value
        };

        return this.registry;
    }

    save() {

        let settings = getKenzapSettings();

        saveKenzapSettings({ id: settings.id, registry: this.registry });

        updateDevspace(this.global.state.app, this.registry);

        updateApp(this.global.state.app, this.registry);
    }

    init() {

        this.settings = getKenzapSettings();

        if (this.settings.registry) this.registry = this.settings.registry;

        // if (!this.settings.registry) 
        getAppRegistry(this.global.state.app, (registry) => {

            // console.log(this.registry, registry);

            this.registry = registry;

            this.view();
        });

        this.view();

        this.cleanup();
    }

    cleanup() {

        let tag = "";

        if (this.global.state.app.tags) {

            tag = this.global.state.app.tags[this.global.state.app.tags.length - 1];

            // console.log("removing tag", tag);

            deleteRegistryTag(this.global.state.app, tag);
        }
    }
}
