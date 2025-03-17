
import global from "./global.js"
import { __html, attr, html, getSetting, cacheSettings, log } from './helpers.js'
import yaml from 'js-yaml';
import { run_script, getKubectlPath, getDevspacePath } from './dev-tools.js'
import { getAppKubeconfig } from './app-status-helpers.js'
import { getAppList } from './app-list-helpers.js'
import child_process from "child_process"

export class AppStatus {

    constructor() {

    }

    init() {

        if (!global.edgeTimeout) { global.edgeTimeout = setInterval(() => { this.getEdgeStatus(); }, 10 * 1000); } else { }

        this.app = global.state.app;

        this.getEdgeStatus();
    }

    /**
     * Get latest status of running pods in the cluster.
     * Mark frontend as online, pending, offline.
     * To optmise performance get only UI visible app state
     * 
     * @name getEdgeStatus
     * @param {Function} callback - callback function
     */
    getEdgeStatus() {

        // exit this class if not in app list or app settings page
        if (global.state.page != 'app-list' && global.state.page != 'app-settings') { clearInterval(global.edgeTimeout); return; }

        // log("Edge Status", "getEdgeStatus");

        let apps = getAppList();

        apps.map(app => {

            if (!global.state.dev[app.id] && global.edgeTimeout) { clearInterval(global.edgeTimeout); return; }

            let kubeconfig = getAppKubeconfig(app.id);

            if (!kubeconfig) return;

            this.cache = getSetting(app.id);

            // when app is not created yet, skip
            if (!this.cache.path) { global.state.dev[app.id].edgeStatus = "d-none"; return; }

            // when in app list page, only show status for the current project
            if (global.state.page === 'app-list') if (global.state.project) if (this.cache.project != global.state.project) return;

            // when in app settings page, only show status for the current app
            if (global.state.page === 'app-settings') if (global.state.app.id != app.id) return;

            // log("Edge app", app);

            let cb = () => { };

            // TODO add support for multi cluster state
            // console.log('cd '+this.cache.path+' && kubectl get deployments --kubeconfig='+kubeconfig+' -o=yaml');
            let kubectl = getKubectlPath();

            global.state.dev[app.id].proc = run_script('cd ' + this.cache.path + ' && ' + kubectl + ' get deployments -n ' + app.id + ' --kubeconfig=' + kubeconfig + ' -o=yaml', [], cb, false);

            global.state.dev[app.id].proc.stdout.on('data', (data) => {

                if (!global.state.dev[app.id] && global.edgeTimeout) { clearInterval(global.edgeTimeout); return; }

                if (global.state.dev[app.id].edgePending) {

                    global.state.dev[app.id].edgeStatus = "pending"; if (document.querySelector(".edge-status[data-id='" + app.id + "']")) { document.querySelector(".edge-status[data-id='" + app.id + "']").classList.add("pending"); }
                }

                try {

                    // Here is the output
                    const items = yaml.load(data.toString(), 'utf8');

                    if (items.items) items.items.forEach(item => {

                        if (item.kind != "Deployment") return;

                        if (document.querySelector(".edge-status[data-id='" + app.id + "']")) {

                            document.querySelector(".edge-status[data-id='" + app.id + "']").classList.remove("online");
                            document.querySelector(".edge-status[data-id='" + app.id + "']").classList.remove("offline");
                            document.querySelector(".edge-status[data-id='" + app.id + "']").classList.remove("pending");
                            document.querySelector(".edge-status[data-id='" + app.id + "']").classList.remove("d-none");
                        }

                        // get image tag
                        let tag = global.state.dev[app.id].edgeImage = item.spec.template.spec.containers[0].image.split(":")[1];

                        if (!app.tags) app.tags = [];

                        if (app.tags.indexOf(tag) < 0) {

                            app.tags.push(tag);

                            cacheSettings(app);
                        }

                        // console.log("TAG", tag);

                        if (!item.status) return;

                        global.state.dev[app.id].edgeConditions = item.status.conditions;

                        if (item.status.readyReplicas > 0 && item.status.replicas == item.status.readyReplicas) { if (document.querySelector('.app-warnings')) document.querySelector('.app-warnings').innerHTML = ``; global.state.dev[app.id].edgePending = false; global.state.dev[app.id].edgeStatus = "online"; if (document.querySelector(".edge-status[data-id='" + app.id + "']")) { document.querySelector(".edge-status[data-id='" + app.id + "']").classList.add("online"); } if (document.querySelector(".bi-exclamation-triangle[data-id='" + app.id + "']")) { document.querySelector(".bi-exclamation-triangle[data-id='" + app.id + "']").classList.add("d-none"); } }

                        if (item.status.unavailableReplicas > 0) {

                            global.state.dev[app.id].edgePending = false;

                            global.state.dev[app.id].edgeStatus = "offline";

                            if (document.querySelector(".edge-status[data-id='" + app.id + "']")) document.querySelector(".edge-status[data-id='" + app.id + "']").classList.add("offline");

                            if (document.querySelector(".bi-exclamation-triangle[data-id='" + app.id + "']")) document.querySelector(".bi-exclamation-triangle[data-id='" + app.id + "']").classList.remove("d-none");

                            if (global.state.page === 'app-settings') this.getLogs(app, cb);
                        }

                        if (document.querySelector(".edge-status[data-id='" + app.id + "']")) document.querySelector(".edge-status[data-id='" + app.id + "']").setAttribute("title", global.state.dev[app.id].edgeConditions.slice(-1)[0].message);
                        if (document.querySelector(".app-title-cont[data-id='" + app.id + "']")) document.querySelector(".app-title-cont[data-id='" + app.id + "']").setAttribute("title", global.state.dev[app.id].edgeConditions.slice(-1)[0].message);

                        // callback
                        if (typeof cb === 'function') cb();
                    });
                } catch (e) {

                    console.log(e);
                }
            });
        });
    }

    showAlert(app) {

        let status = global.state.dev[app.id].edgeStatus;

        if (status == "offline" || status == "pending") {

            document.querySelector('.app-warnings').innerHTML = `
                <div class="alert ${status == "offline" ? "alert-danger" : ""} ${status == "pending" ? "alert-warning" : ""} alert-dismissible- fade show" role="alert" data-id="${attr(app.id)}">
                    <div class="d-flex align-items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-square flex-shrink-0 me-2 d-none" viewBox="0 0 16 16">
                            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"></path>
                            <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"></path>
                        </svg>
                        <div class="alert-msg">
                            <h4 class="alert-heading">${html(global.state.dev[app.id].edgeStatus)}</h4>
                            ${global.state.dev[app.id].edgeConditions ? "<pre>" + html(global.state.dev[app.id].edgeConditions.slice(-1)[0].message) + "</pre><hr>" : ""}
                            <pre class="mb-0 ${global.state.dev[app.id].edgeLogs ? "" : "d-none"}">${html(global.state.dev[app.id].edgeLogs)}</pre>
                            <pre class="mb-0 ${global.state.dev[app.id].edgeEvent ? "" : "d-none"}">${html(global.state.dev[app.id].edgeEvent)}</pre>
                        </div>
                    </div>
                    <button type="button" class="btn-close btn-dismiss-notify d-none" data-bs-dismiss="alert" aria-label="Close" data-id="${attr(app.id)}"></button>
                </div>
                `;
        }
    }

    /**
     * Get a detailed log of a particular deployment
     * 
     * @name getLogs
     * @param {Function} callback - callback function
     */
    getLogs(app, cb) {

        let id = app.id;

        let cache = getSetting(id);

        if (!global.state.dev[id]) global.state.dev[id] = {};

        if (cache.event != "") {

            global.state.dev[id].edgeEvent = cache.event;

            this.showAlert(app);
        }

        log("event " + cache.event);

        let kubeconfig = getAppKubeconfig(id);

        if (!kubeconfig) return;

        let kubectl = getKubectlPath();

        global.state.dev[id].procPod = run_script('cd ' + cache.path + ' && ' + kubectl + ' get pods --kubeconfig=' + kubeconfig + ' -o=yaml', [], null, false);
        global.state.dev[id].procPod.stdout.on('data', (data) => {

            // find pod name
            const items = yaml.load(data.toString(), 'utf8');

            let pod = "", timestamp = "2000-00-01T00:00:00Z";

            if (items.items) items.items.forEach(item => {

                if (item.kind != "Pod") return;

                if (item.metadata.creationTimestamp > timestamp) { timestamp = item.metadata.creationTimestamp; pod = item.metadata.name; }
            });

            if (pod == "") return;

            let callback_response_logs = (data) => {

                global.state.dev[app.id].edgeLogs = data.toString();

                if (global.state.dev[app.id].edgeStatus == "online") {

                    document.querySelector('.app-warnings').innerHTML = ``;
                }

                if (data.length > 10) this.showAlert(app);
            }

            let callback_response_events = (data) => {

                try {

                    console.log(data.toString());

                    // no recent events are present
                    if ("No events found in phpmyadmin namespace." != data.toString()) {

                        // manually parse event since reply is inconsistent
                        let s = data.toString().lastIndexOf("message:");
                        let e = data.toString().lastIndexOf("metadata:");

                        if (s > e || s < 0 || e < 0) return;

                        let msg = data.toString().substr(s + 8, e - s - 8).trim().trim('\'').replace(/['"]+/g, '');

                        if (msg.indexOf("metadata:") > 0) msg = msg.split("metadata:")[0];

                        if (msg.length > 10) {

                            global.state.dev[app.id].edgeEvent = msg;

                            cache.event = msg;

                            cacheSettings(cache);
                        }

                        // get last cached event
                    }

                } catch (e) {

                    console.log(e);
                }
            }

            global.state.dev[id].procLog = run_script('cd ' + cache.path + ' && ' + kubectl + ' logs ' + pod + ' --kubeconfig=' + kubeconfig, [], null, false, callback_response_logs);
            global.state.dev[id].procLog = run_script('cd ' + cache.path + ' && ' + kubectl + ' events ' + app.slug + ' --kubeconfig=' + kubeconfig + ' -o=yaml --', [], null, false, callback_response_events);
        });
    }
}
