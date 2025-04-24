
import global from "./global.js"
import { __html, attr, onClick, getSetting, log } from './helpers.js'
import { getAppKubeconfig } from './app-status-helpers.js'
import { validPath, getDevspacePath, run_script } from './dev-tools.js'
import terminate from "terminate"
import fs from "fs"

export class DevToolsSync {

    constructor(global) {

        this.global = global;
    }

    init() {

        this.listeners();
    }

    listeners() {

        // start dev
        onClick('.start-dev-app', e => {

            e.preventDefault();

            this.sync(e.currentTarget.dataset.id, 'start');
        });

        // stop dev
        onClick('.stop-dev-app', e => {

            e.preventDefault();

            this.sync(e.currentTarget.dataset.id, 'stop');

            return false
        });
    }

    sync(id, cmd) {

        log(`Syncing ${id}...`);

        if (!global.state.dev) global.state.dev = {};
        if (!global.state.dev[id]) global.state.dev[id] = { running: true };

        let cache = getSetting(id);

        let app = global.state.apps.filter(app => app.id == id)[0];

        if (!validPath(cache)) return;

        if (cmd == 'stop') { this.syncStop(app); return; }

        document.querySelector('.devToolsSyncCont[data-id=' + id + '] ul').innerHTML = "";

        const devspaceFiles = fs.readdirSync(cache.path).filter(file => file.startsWith('devspace') && file.endsWith('.yaml'));

        log(`Found devspace files: ${devspaceFiles}`);

        devspaceFiles.forEach(file => {

            document.querySelector('.devToolsSyncCont[data-id=' + id + '] ul').innerHTML += `<li><a class="dropdown-item po dev-tools-sync-start" data-file="${file}" href="#">` + file.replace('devspace-', '').replace('.yaml', '') + `</a></li>`;
        });

        if (devspaceFiles.length == 0) return;

        if (devspaceFiles.length == 1) {

            this.syncStart(app, devspaceFiles[0]);

            // Close the dropdown menu
            const dropdownMenu = document.querySelector('.devToolsSyncCont .dropdown-menu.show');
            if (dropdownMenu) {
                dropdownMenu.classList.remove('show');
            }
        }

        if (devspaceFiles.length > 1) {

            onClick('.dev-tools-sync-start', e => {

                e.preventDefault();

                let file = e.currentTarget.dataset.file;

                this.syncStart(app, file);

                // Close the dropdown menu
                const dropdownMenu = document.querySelector('.devToolsSyncCont .dropdown-menu.show');
                if (dropdownMenu) {
                    dropdownMenu.classList.remove('show');
                }
            });
        }
    }

    syncStart(app, file) {

        let id = app.id;

        let kubeconfig = getAppKubeconfig(app.id);

        if (!kubeconfig && app.clusters[0] != 'local') return;

        if (app.clusters[0] == 'local') kubeconfig = "";

        let devspace = getDevspacePath();

        let cache = getSetting(id);

        document.querySelector('[data-id="' + id + '"].stop-dev-app').classList.remove('d-none');
        document.querySelector('[data-id="' + id + '"].start-dev-app').classList.add('d-none');
        if (document.querySelector('[data-id="' + id + '"].dev-badge')) document.querySelector('[data-id="' + id + '"].dev-badge').parentElement.innerHTML = `<div class="badge dev-badge bg-danger fw-light po" data-id="${app.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1 mb-0" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div>`;
        document.querySelector('.console-output').innerHTML = "";

        let cb = () => {

            log(`cd ${cache.path} && ${devspace} sync -n ${id} --config=${file} ${kubeconfig ? `--kubeconfig=${kubeconfig}` : ''} --no-warn`)
        }

        if (global.state.dev[id].proc) {
            terminate(global.state.dev[id].proc.pid, err => {
                if (err) {
                    log('Failed to terminate existing process:', err);
                } else {
                    log('Terminated existing devspace sync process');
                }
                startDevspaceSync();
            });
        } else {
            startDevspaceSync();
        }

        function startDevspaceSync() {

            global.state.dev[id].status = "sync";
            global.state.dev[id].proc = run_script(
                `cd ${cache.path} && rm -Rf .devspace && ${devspace} sync -n ${id} --config=${file} ${kubeconfig ? `--kubeconfig=${kubeconfig}` : ''} --no-warn`,
                [],
                cb
            );
        }
    }

    syncStop(app) {

        let id = app.id;

        document.querySelector('[data-id="' + id + '"].stop-dev-app').classList.add('d-none');
        document.querySelector('[data-id="' + id + '"].start-dev-app').classList.remove('d-none');
        document.querySelector('[data-id="' + id + '"].dev-badge').parentElement.innerHTML = `<div class="badge dev-badge bg-primary fw-light po" data-id="${app.id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`
        terminate(global.state.dev[id].proc.pid, err => log(err))
        global.state.dev[id].status = "stop";
    }
}

