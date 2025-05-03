import global from "./global.js"
import { __html, attr, onClick, getSetting, parseError, toast, log } from './helpers.js'
import { getAppKubeconfig } from './app-status-helpers.js'
import { validPath, getDevspacePath, toggleDepIconState, run_script } from './dev-tools.js'
import terminate from "terminate"
import fs from "fs"
import yaml from 'js-yaml';
import * as path from 'path';

export class DevToolsPublish {

    constructor(global) {

        this.global = global;
    }

    init() {

        this.listeners();
    }

    listeners() {

        // publish app
        onClick('.app-deploy', e => {

            let id = e.currentTarget.dataset.id;

            if (document.querySelector(".settings") && !global.state.pub[id].proc) { simulateClick(document.querySelector('.app-save')); this.global.runDeploy = true; return; }

            e.preventDefault();

            // let msg = __html('Publish app?');

            // check last deploy activity
            // if (global.state.last_activity && (Date.now() - global.state.last_activity) > 1000 * 10) global.state.loading = false;

            // still loading
            if (global.state.pub[id].proc) {

                if (confirm(__html('Reset publishing?'))) {

                    this.stop_publish_process(id, (id) => { });
                }

                return;
            }

            this.deploy(id);
        });

        // cancel publishing
        // onClick('.app-stop-publish', e => {

        //     if (confirm(__html('Reset publishing?'))) {

        //         this.stop_publish_process(e.currentTarget.dataset.id, (id) => { });
        //     }
        // });
    }

    deploy(id) {

        let cache = getSetting(id);

        let app = global.state.apps.filter(app => app.id == id)[0];

        if (!validPath(cache)) return;

        document.querySelector('.devToolsPublishCont[data-id=' + id + '] ul').innerHTML = "";

        const devspaceFiles = fs.readdirSync(cache.path).filter(file => file.startsWith('devspace') && file.endsWith('.yaml'));

        log(`Found devspace files: ${devspaceFiles}`);

        this.devspaceFiles = [];

        this.queue = [];

        devspaceFiles.forEach(file => {

            this.devspaceFiles.push(file);

            document.querySelector('.devToolsPublishCont[data-id=' + id + '] ul').innerHTML += `<li><a class="dropdown-item po dev-tools-publish" data-file="${file}" href="#">` + file.replace('devspace-', '').replace('.yaml', '') + `</a></li>`;
        });

        document.querySelector('.devToolsPublishCont[data-id=' + id + '] ul').innerHTML += `<li><hr class="dropdown-divider"></li><li><a class="dropdown-item po dev-tools-publish" data-file="all" href="#">${__html('publish all')}</a></li>`;

        if (devspaceFiles.length == 0) return;

        if (devspaceFiles.length == 1) {

            this.queue.push(devspaceFiles[0]);

            this.deployApp(app);

            // Close the dropdown menu
            const dropdownMenu = document.querySelector('.devToolsPublishCont .dropdown-menu.show');
            if (dropdownMenu) {
                dropdownMenu.classList.remove('show');
            }
        }

        if (devspaceFiles.length > 1) {

            onClick('.dev-tools-publish', e => {

                e.preventDefault();

                let file = e.currentTarget.dataset.file;

                this.queue = [];
                if (file == 'all') {
                    this.devspaceFiles.forEach(file => {
                        this.queue.push(file);
                    });
                } else {
                    this.queue.push(file);
                }

                this.deployApp(app);

                // Close the dropdown menu
                const dropdownMenu = document.querySelector('.devToolsPublishCont .dropdown-menu.show');
                if (dropdownMenu) {
                    dropdownMenu.classList.remove('show');
                }
            });
        }
    }

    /**
     * Deploys the application with the given ID.
     *
     * This function sets up the necessary environment and configurations for deploying
     * an application. It ensures that any ongoing synchronization is stopped, sets up
     * deployment defaults, and initiates the deployment process using DevSpace and Kubernetes.
     *
     * @param {string} id - The unique identifier of the application to be deployed.
     * @param {string} file - The name of the DevSpace configuration file to be used for deployment.
     */
    deployApp(app) {

        if (!this.queue.length) { global.state.pub[app.id].proc = null; toggleDepIconState(app.id); return; }

        let file = this.queue.pop();

        let cache = getSetting(app.id);

        if (!validPath(cache)) return;

        document.querySelector('.console-output').innerHTML = "";

        // global.state.app = global.state.apps.filter(app => app.id == app.id)[0];

        let kubeconfig = getAppKubeconfig(app.id);

        if (!kubeconfig && app.clusters[0] != 'local') return;

        if (app.clusters[0] == 'local') kubeconfig = "";

        global.state.pub[app.id].edgePending = true;

        global.state.pub[app.id].path = [];

        if (!global.state.pub[app.id].iteration) global.state.pub[app.id].iteration = 0;

        global.state.loading = true;

        // publishing
        toast(__html('Publishing'));

        document.querySelector(".edge-status[data-id='" + app.id + "']").classList.add("pending"); document.querySelector(".edge-status[data-id='" + app.id + "']").classList.remove("d-none");

        if (cache.path) {
            const devspaceFilePath = path.join(cache.path, file);

            if (fs.existsSync(devspaceFilePath)) {

                global.state.pub[app.id].path.push(devspaceFilePath);

                this.deployRecursive(app, cache, kubeconfig, devspaceFilePath);
            }
        }
    }

    // checkAppClusterState(id) {

    //     let cache = getSetting(id);

    //     // validate data
    //     let data = { id: id, endpoints: [] };

    //     // get endpoints
    //     if (cache.path) if (fs.existsSync(path.join(cache.path, 'endpoints.yaml'))) {

    //         try {
    //             // global.state.app.endpoints = [];
    //             const endpoints = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'endpoints.yaml'), 'utf8'));

    //             endpoints.forEach(endpoint => {

    //                 if (endpoint.kind == "Ingress") {

    //                     endpoint.spec.rules.map(rule => {

    //                         data.endpoints.push({ "host": rule.host, "port": rule.http.paths[0].backend.service.port.number });
    //                     })
    //                 }
    //             });

    //         } catch (err) {

    //             parseError(err);
    //         }
    //     }

    //     // show loading
    //     showLoader();

    //     // block UI buttons
    //     global.state.loading = true;

    //     // publishing
    //     toast(__html('Publishing'));

    //     // check if config files exist
    //     checkConfigs(id);

    //     // show UI
    //     hideLoader();

    //     // deploy to cluster
    //     deploy(id);
    // };

    deployRecursive(app, cache, kubeconfigFile, devspaceFile) {

        let id = app.id;

        log('deployRecursive kubeconfigFile', kubeconfigFile);
        log('deployRecursive', id);

        let devspace = getDevspacePath();

        // if (global.timeout) clearTimeout(global.timeout);

        // global.timeout = setTimeout((id) => {
        //     global.state.pub[id].iteration = global.state.pub[id].path.length;
        //     global.state.pub[id].proc = null;
        //     global.state.loading = false;
        //     toggleDepIconState(id);
        // }, 1000 * 60 * 5, id);

        // if (global.state.pub[id].iteration >= global.state.pub[id].path.length) { global.state.loading = false; global.state.pub[id].proc = null; toggleDepIconState(id); return; }

        try {

            // let devspaceFile = global.state.pub[id].path[global.state.pub[id].iteration];
            let pub = yaml.loadAll(fs.readFileSync(global.state.pub[id].path[global.state.pub[id].iteration], 'utf8'));

            if (pub[0]) pub = pub[0];

            // log('deploy devspaceFile', devspaceFile);
            log(`${devspace} deploy -n ${id} --config=${devspaceFile} ${kubeconfigFile ? `--kubeconfig=${kubeconfigFile}` : ''} --no-warn -b`);

            // production 
            if (kubeconfigFile) global.state.pub[id].proc = run_script(
                `cd ${cache.path} && docker login -u ${pub.pullSecrets.pullsecret.username} \
                    -p ${pub.pullSecrets.pullsecret.password} ${pub.pullSecrets.pullsecret.registry} \
                    && ${devspace} deploy -n ${id} --config=${devspaceFile} --kubeconfig=${kubeconfigFile} -b`,
                [],
                cb,
                1,
                (error) => { log('Deploy E: ', error.toString()); },
                (output) => {
                    global.state.last_activity = Date.now();
                    if (output.toString().includes("Successfully deployed")) {
                        log('Deploy O:', output.toString());
                        this.deployApp(app);
                    }
                }
            );

            // minikube 
            if (!kubeconfigFile) global.state.pub[id].proc = run_script(
                `cd ${cache.path} && kubectl config use-context minikube \
                && ${devspace} deploy -n ${id} --config=${devspaceFile} -b`,
                [],
                cb,
                1,
                (error) => { log('Deploy E: ', error.toString()); },
                (output) => {
                    global.state.last_activity = Date.now();
                    if (output.toString().includes("Successfully deployed")) {
                        log('Deploy O:', output.toString());
                        this.deployApp(app);
                    }
                }
            );

            // update UI
            toggleDepIconState(id);

        } catch (err) {
            log(err);
            parseError(err);
        }
    }

    /**
     * Stops a development process by its ID and executes a callback upon completion.
     *
     * @param {string} id - The identifier of the development process to stop.
     * @param {Function} [cb] - Optional callback function to execute after the process is stopped.
     *                           The callback receives the process ID as an argument.
     *
     * @throws {Error} Throws an error if there is an issue checking or terminating the process.
     *
     * @example
     * toggleDepIconState('process1', (id) => {
     *     console.log(`Process ${id} has been stopped.`);
     * });
     */
    stop_publish_process(id) {

        if (global.state.pub[id].proc) {

            const pid = global.state.pub[id].proc.pid;

            try {
                process.kill(pid, 0); // Check if the process exists

                // toast("toggleDepIconState: Reseting process " + pid);

                terminate(pid, (err) => {
                    if (err) {
                        log('toggleDepIconState: Failed to terminate child process:', err);
                    } else {
                        log('toggleDepIconState: Child process terminated successfully');

                        document.querySelector('.console-output').innerHTML += '<b style="color:#f75fb4;">' + __html('Publishing canceled') + '</b>';
                    }

                    global.state.pub[id].proc = null;

                    global.state.loading = false;

                    toggleDepIconState(id);
                });
            } catch (error) {
                if (error.code === 'ESRCH') {
                    log('toggleDepIconState: Process does not exist:', pid);
                } else {
                    log('toggleDepIconState: Error checking process:', error);
                }

                global.state.pub[id].proc = null;

                global.state.loading = false;

                toggleDepIconState(id);
            }
        }
    }
}

