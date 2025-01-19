import { __html, getSetting, onChange, parseError } from './helpers.js'
import fs from "fs"
import yaml from 'js-yaml';
import * as path from 'path';

export class AppResources {

    constructor(global) {

        this.tiers = [{ cpu: "25m", ops: 35, memory: "100Mi", ramtxt: "100 MB" }, { cpu: "50m", ops: 60, memory: "200Mi", ramtxt: "200 MB" }, { cpu: "100m", ops: "140", memory: "400Mi", ramtxt: "400 MB" }, { cpu: "200m", ops: "280", memory: "800Mi", ramtxt: "800 MB" }, { cpu: "500m", ops: "700", memory: "2000Mi", ramtxt: "2 GB" }, { cpu: "1", ops: "1400", memory: "4000Mi", ramtxt: "4 GB" }];
        this.selector = "app-resources";
        this.global = global;
    }

    view() {

        return `
            <div class="col-sm-7 pt-3 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Resources')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary  d-none" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                </div>
                <p class="form-text">${__html('Easily scale microservice CPU and RAM resources backed by Ampere® Altra® processors.')}</p>
                <div class="mb-3 row">
                    <label for="app-ram" class="col-sm-3 col-form-label label-ram">${__html('CPU & RAM')}</label>
                    <div class="col-sm-6 d-flex align-items-center">
                        <label for="app-ram" class="form-label d-none">Example range</label>
                        <input type="range" class="form-range" min="0" max="5" step="1" id="app-ram">
                    </div>
                    <div class="col-sm-3">
                        <div class="cpu-ram text-end">

                        </div>
                    </div>
                </div>
            </div>
            `;
    }

    listeners() {

        // publish app
        onChange('#app-ram', e => {

            e.preventDefault();

            this.resources();
        });

        document.querySelector('#app-ram').addEventListener('input', e => {

            this.resources();
        }, false);
    }

    resources() {

        let val = parseInt(document.querySelector('#app-ram').value);

        document.querySelector(".cpu-ram").innerHTML = `
        <div class="fs-5 fw-bold text-secondary mb-0">${this.tiers[val].ramtxt}</div>
        <div class="mt-0"><div style="margin-top:-4px;"  class="form-text text-secondary">${this.tiers[val].ops} ${__html('OPS')} <sub>${__html('sec')}</sub></div></div>`;

        this.specs = this.tiers[val];
        this.specs.tier = val;
    }

    readYaml() {

        let cache = getSetting(this.global.state.app.id);

        let read = false;

        // read endpoints
        if (cache.path) if (fs.existsSync(path.join(cache.path, 'app.yaml'))) {

            try {

                const appYaml = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'app.yaml'), 'utf8'));

                this.resources();

                let t = 0;

                // find tier index
                this.tiers.forEach((tier, index) => { if (tier.cpu + "" == appYaml[0].spec.template.spec.containers[0].resources.requests.cpu + "") { t = index; } });

                document.querySelector('#app-ram').value = t;

                this.resources();

                read = true;

            } catch (err) {

                console.log(err);

                parseError(err);
            }
        }

        if (!read) {

            this.resources();
        }
    }

    get() {

        return this.specs;
    }

    save() {

        let cache = getSetting(this.global.state.app.id);

        // read endpoints
        if (cache.path) if (fs.existsSync(path.join(cache.path, 'app.yaml'))) {

            try {

                const appYaml = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'app.yaml'), 'utf8'));

                appYaml[0].spec.template.spec.containers[0].resources.requests.cpu = this.specs.cpu;
                appYaml[0].spec.template.spec.containers[0].resources.requests.memory = this.specs.memory;

                appYaml[0].spec.template.spec.containers[0].resources.limits.cpu = this.tiers[this.specs.tier < this.tiers.length - 1 ? this.specs.tier + 1 : this.specs.tier].cpu;
                appYaml[0].spec.template.spec.containers[0].resources.limits.memory = this.tiers[this.specs.tier < this.tiers.length - 1 ? this.specs.tier + 1 : this.specs.tier].memory;

                fs.writeFileSync(path.join(cache.path, 'app.yaml'), yaml.dump(appYaml[0], {}), 'utf-8');

            } catch (err) {

                parseError(err);
            }
        }
    }

    /**
     * Convert docker CPU to OPS (operations per second per code)
     * Benchmark examples: https://www.vpsbenchmarks.com/compare/hetzner
     * Ex.: CPX31, AMD 4 vCPU = 5,700 ops/s, 1425
     * @name getOps
     * @param {Integer} cpu - docker cpu value
     * @param {Function} callback - callback function
     */
    getOps(cpu) {

        return 1425 * 1000 / parseInt(cpu);
    }

    init() {

        document.querySelector(this.selector).innerHTML = this.view();

        this.listeners();

        this.readYaml();
    }
}
