import global from "./global.js"
import { shell } from 'electron' // deconstructing assignment
import { __html, attr, onClick, simulateClick, getSetting, toast, showLoader, hideLoader, parseError, log } from './helpers.js'
import { appList } from "../../renderer/app-list.js"
import { getAppKubeconfig } from './app-status-helpers.js'
import { getClusterKubeconfig } from './cluster-kubernetes-helpers.js'
import { DevToolsSync } from './dev-tools-sync.js'
import { DevToolsConsole } from './dev-tools-console.js'
import { DevToolsPublish } from './dev-tools-publish.js'
import { Client as ssh } from 'ssh2';
import { timeStamp } from "console"
import child_process from "child_process"
import terminate from "terminate"
import fs from "fs"
import yaml from 'js-yaml';
import * as path from 'path';

export class DevTools {

    constructor(global) {

        this.global = global;
    }

    listeners() {

        // open folder
        onClick('.open-folder', e => {

            e.preventDefault();

            let cache = getSetting(e.currentTarget.dataset.id);

            // shell.showItemInFolder('filepath') // Show the given file in a file manager. If possible, select the file.
            shell.openPath(cache.path) // Open the given file in the desktop's default manner.            
        });
    }

    init() {

        this.devToolsSync = new DevToolsSync();
        this.devToolsSync.init();

        this.devToolsConsole = new DevToolsConsole();
        this.devToolsConsole.init();

        this.devToolsPublish = new DevToolsPublish();
        this.devToolsPublish.init();

        this.listeners();
    }
}

/**
 * Retrieves the path to the `kubectl` executable.
 * 
 * @returns {string|undefined} The path to the `kubectl` executable, or `undefined` if not found.
 */
export function getKubectlPath() {

    // Try common kubectl installation locations
    const possiblePaths = [
        "/usr/local/bin/kubectl",
        "/usr/bin/kubectl",
        "/opt/homebrew/bin/kubectl",
        `${process.env.HOME}/.kube/kubectl`
    ];

    let kubectlPath;
    for (const path of possiblePaths) {
        try {
            if (fs.existsSync(path)) {
                kubectlPath = path;
                // log('Found kubectl at:', kubectlPath);
                break;
            }
        } catch (error) {
            // Continue checking
        }
    }

    if (!kubectlPath) {
        log('Failed to find kubectl');
        return;
    }

    return kubectlPath;
}

/**
 * Retrieves the path to the `kubectl` executable.
 * 
 * @returns {string|undefined} The path to the `kubectl` executable, or `undefined` if not found.
 */
export function getDevspacePath() {

    // Try common devspace installation locations
    const possibleDevspacePaths = [
        "/usr/local/bin/devspace",
        "/usr/bin/devspace",
        "/opt/homebrew/bin/devspace",
        `${process.env.HOME}/.devspace/bin/devspace`,
        `${process.env.HOME}/.local/bin/devspace`
    ];

    let devspacePath;
    for (const path of possibleDevspacePaths) {
        try {
            if (fs.existsSync(path)) {
                devspacePath = path;
                // log('Found devspace at:', devspacePath);
                break;
            }
        } catch (error) {
            // Continue checking
        }
    }

    if (!devspacePath) {
        log('Failed to find devspace');
        return;
    }

    return devspacePath;
}

/**
 * Retrieves the path to the `minikube` executable.
 * 
 * @returns {string|undefined} The path to the `minikube` executable, or `undefined` if not found.
 */
export function getMinukubePath() {

    // Try common devspace installation locations
    const possibleMinikubePaths = [
        "/usr/local/bin/minikube",
        "/usr/bin/minikube",
        "/opt/homebrew/bin/minikube",
        `${process.env.HOME}/.minikube/bin/minikube`,
        `${process.env.HOME}/.local/bin/minikube`
    ];

    let minikubePath;
    for (const path of possibleMinikubePaths) {
        try {
            if (fs.existsSync(path)) {
                minikubePath = path;
                // log('Found devspace at:', minikubePath);
                break;
            }
        } catch (error) {
            // Continue checking
        }
    }

    if (!minikubePath) {
        log('Failed to find devspace');
        return;
    }

    return minikubePath;
}

export function checkConfigs(id) {

    let cache = getSetting(id);

    if (fs.existsSync(path.join(cache.path, 'app.yaml'))) {

        log('app.yaml exists');
    } else {

        log('app.yaml does not exist');
    }

    // kubeconfig-sg.yaml
    if (fs.existsSync(path.join(cache.path, 'kubeconfig-sg.yaml'))) {

        log('kubeconfig-sg.yaml exists');
    } else {

        log('kubeconfig-sg.yaml does not exist');
        // try { fs.writeFileSync(path.join(cache.path, 'kubeconfig-sg.yaml'), response.app.config.kubeconfigsg, 'utf-8'); }catch(e){ console.log(e); }
    }

    // devspace.yaml
    if (fs.existsSync(path.join(cache.path, 'devspace.yaml'))) {

        log('devspace.yaml exists');
    } else {

        log('devspace.yaml does not exist');
        // try { fs.writeFileSync(path.join(cache.path, 'devspace.yaml'), response.app.config.devspace, 'utf-8'); }catch(e){ console.log(e); }
    }
}

// using docker and DB stored registry data
export function deploy_docker(id) {

    // set dev object defaults
    if (!global.state.dev) global.state.dev = { status: "stop" };

    // check if sync is running and shut it down
    if (global.state.dev[id]) if (global.state.dev[id].status == "sync") devApp(id, 'stop');

    // set dev deployment defaults
    if (!global.state.dev[id]) global.state.dev[id] = { running: true };

    let cache = getSetting(id);

    document.querySelector('.console-output').innerHTML = "";

    global.state.app = global.state.apps.filter(app => app.id == id)[0];

    let cb = () => {

        setTimeout(() => {

            let cb2 = () => { };
            if (global.state.app.dtc) global.state.app.dtc.forEach((dt, index) => {

                global.state.dev[id].proc = run_script('cd ' + cache.path + ' && kubectl apply -f endpoints.yaml --kubeconfig=kubeconfig-' + dt + '.yaml && kubectl apply -f app.yaml --kubeconfig=kubeconfig-' + dt + '.yaml && kubectl rollout restart deployment ' + global.state.app.slug + ' --kubeconfig=kubeconfig-' + dt + '.yaml;', [], cb2);
            });

            appList();

        }, 1 * 1000);
    }

    global.state.dev[id].edgePending = true;

    document.querySelector(".edge-status[data-id='" + id + "']").classList.add("pending"); document.querySelector(".edge-status[data-id='" + id + "']").classList.remove("d-none");

    global.state.dev[id].proc = run_script('cd ' + cache.path + ' && docker login -u ' + global.state.app.registry.user + ' -p ' + global.state.app.registry.pass + ' ' + global.state.app.registry.domain + ' && docker buildx build --platform linux/arm64 --push -t ' + global.state.app.registry.domain + '/v2 .', [], cb);
}

export function deleteApp(id, cb) {

    let data = global.state.apps.filter(app => app.id == id)[0];

    if (!data.clusters) { toast(__html("Please remove app manually")); return; }

    let kubeconfigCluster = getClusterKubeconfig(data.clusters[0]);

    if (data.clusters[0].includes("local")) { deleteAppLocal(id, data, cb); return; }

    log("kubeconfigCluster", kubeconfigCluster);

    let kubeconfig = getAppKubeconfig(id);

    if (!kubeconfig) return;

    log('deleteApp', data);

    let step1 = () => {

        // clear namespace
        log(`cd ${data.path}; kubectl delete all --all -n ${data.slug} --kubeconfig=${kubeconfigCluster}`);
        run_script(`cd ${data.path}; kubectl delete all --all -n ${data.slug} --kubeconfig=${kubeconfigCluster}`, [], () => { log(`Removing previous resources in ${data.slug} namespace`); step2(); }, 0, (error) => { log('Cluster 1 E: ', error.toString()); });
    }

    let step2 = () => {

        hideLoader();

        // clear namespace
        run_script(`cd ${data.path}; kubectl delete namespace ${data.slug} --kubeconfig=${kubeconfigCluster}`, [], () => { log(`Removing ${data.slug} namespace`); step3(); }, 0, (error) => { log('Cluster 2 E: ', error.toString()); step3(); });
    }

    let step3 = () => {

        log('step3');

        // force delete namespace and all resources
        log(`kubectl get namespace "${data.slug}" --kubeconfig=${kubeconfigCluster} -o json | tr -d "\n" | sed "s/\"finalizers\": \[[^]]\+\]/\"finalizers\": []/" | kubectl replace --kubeconfig=${kubeconfigCluster} --raw /api/v1/namespaces/${data.slug}/finalize -f -`);
        run_script(`cd ${data.path}; kubectl get namespace "${data.slug}" --kubeconfig=${kubeconfigCluster} -o json | tr -d "\n" | sed "s/\"finalizers\": \[[^]]\+\]/\"finalizers\": []/" | kubectl replace --kubeconfig=${kubeconfigCluster} --raw /api/v1/namespaces/${data.slug}/finalize -f -`, [], () => { step4(); log('Namespace force removed'); }, 0, (error) => { step4(); log('Cluster 3 E: ', error.toString()); });
    }

    let step4 = () => {

        log('step4');

        step5();

        // CertificateSigningRequest
        log(`kubectl delete CertificateSigningRequest ${data.slug} --kubeconfig=${kubeconfigCluster}`);
        run_script(`kubectl delete CertificateSigningRequest ${data.slug} --kubeconfig=${kubeconfigCluster}`, [], () => { log('Clearing previous certificate signing requests'); step5(); }, 1, (error) => { step5(); });
    }

    let step5 = () => {

        toast(global.state.msg);

        // remove .kenzap file from app folder
        let kenzapFilePath = path.join(data.path, '.kenzap');
        if (fs.existsSync(kenzapFilePath)) {
            fs.unlink(kenzapFilePath, (err) => {
                if (err) {
                    log('Error removing .kenzap file:', err);
                } else {
                    log('.kenzap file removed successfully');
                }
            });
        } else {
            log('.kenzap file does not exist');
        }

        if (typeof cb === 'function') cb();
    };

    toast(__html('Deleting app'));

    step1();
}

export function deleteAppLocal(id, data, cb) {

    log('deleteAppLocal', data);

    let step1 = () => {

        // clear namespace
        log(`kubectl config use-context minikube && cd ${data.path}; kubectl delete all --all -n ${data.slug} `);
        run_script(`kubectl config use-context minikube && cd ${data.path}; kubectl delete all --all -n ${data.slug}`, [], () => { log(`Removing previous resources in ${data.slug} namespace`); step2(); }, 0, (error) => { log('Cluster 1 E: ', error.toString()); });
    }

    let step2 = () => {

        hideLoader();

        // clear namespace
        run_script(`kubectl config use-context minikube && cd ${data.path}; kubectl delete namespace ${data.slug}`, [], () => { log(`Removing ${data.slug} namespace`); step3(); }, 0, (error) => { log('Cluster 2 E: ', error.toString()); step3(); });
    }

    let step3 = () => {

        log('step3');

        // force delete namespace and all resources
        log(`kubectl config use-context minikube && kubectl get namespace "${data.slug}" -o json | tr -d "\n" | sed "s/\"finalizers\": \[[^]]\+\]/\"finalizers\": []/" | kubectl replace --raw /api/v1/namespaces/${data.slug}/finalize -f -`);
        run_script(`cd ${data.path}; kubectl config use-context minikube && kubectl get namespace "${data.slug}" -o json | tr -d "\n" | sed "s/\"finalizers\": \[[^]]\+\]/\"finalizers\": []/" | kubectl replace --raw /api/v1/namespaces/${data.slug}/finalize -f -`, [], () => { step5(); log('Namespace force removed'); }, 0, (error) => { step5(); log('Cluster 3 E: ', error.toString()); });
    }

    let step5 = () => {

        toast(global.state.msg);

        // remove .kenzap file from app folder
        let kenzapFilePath = path.join(data.path, '.kenzap');
        if (fs.existsSync(kenzapFilePath)) {
            fs.unlink(kenzapFilePath, (err) => {
                if (err) {
                    log('Error removing .kenzap file:', err);
                } else {
                    log('.kenzap file removed successfully');
                }
            });
        } else {
            log('.kenzap file does not exist');
        }

        if (typeof cb === 'function') cb();
    };

    toast(__html('Deleting app'));

    step1();
}

export function syncDeployments(data) {

    let id = data.id;

    if (!global.state.dev) global.state.dev = {};
    if (!global.state.dev[id]) global.state.dev[id] = { running: true };

    let cache = getSetting(id);

    document.querySelector('.console-output').innerHTML = "";

    global.state.app = global.state.apps.filter(app => app.id == id)[0];

    // publish endpoints and certificates
    let cb = () => {

        log('syncing data centers');

        let cb2 = () => { }

        data.dtc.forEach((dt, index) => {

            if (index > 0) {
                global.state.dev[id].proc = run_script('cd ' + cache.path + ' && docker login -u ' + global.state.app.registry.user + ' -p ' + global.state.app.registry.pass + ' ' + global.state.app.registry.domain + ' && kubectl apply -f endpoints.yaml --kubeconfig=kubeconfig-' + dt + '.yaml; kubectl apply -f letsencrypt-prod.yaml --kubeconfig=kubeconfig-' + dt + '.yaml', [], cb2);
            }

            // publish application
            global.state.dev[id].proc2 = run_script('cd ' + cache.path + ' && kubectl apply -f app.yaml --kubeconfig=kubeconfig-' + dt + '.yaml; kubectl rollout restart deployment ' + global.state.app.slug + ' --kubeconfig=kubeconfig-' + dt + '.yaml', [], cb2);
        });
    }

    // if(global.state.dtc_updated) 
    global.state.dev[id].proc = run_script('cd ' + cache.path + ' && docker login -u ' + global.state.app.registry.user + ' -p ' + global.state.app.registry.pass + ' ' + global.state.app.registry.domain + ' && kubectl apply -f endpoints.yaml --kubeconfig=kubeconfig-' + data.dtc[0] + '.yaml; kubectl get secret letsencrypt-prod -o yaml --kubeconfig=kubeconfig-' + data.dtc[0] + '.yaml > letsencrypt-prod.yaml;', [], cb);
}

export function getTemplatesPath() {
    return process.env.NODE_ENV === 'development'
        ? path.join(__dirname, "..", "templates")
        : path.join(process.resourcesPath, 'templates');
}

/**
 * Runs console commmands locally.
 * This function will output the lines from the script and will return the full combined output as well as exit code when it's done (using the callback).
 * 
 * @name run_script
 * @link https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
 * @param {String} command - command
 * @param {String} args - args
 * @param {Function} callback - callback function
 */
export function run_script(command, args, callback, verbose = 1, callback_error, callback_output) {

    let child = child_process.spawn(command, args, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: true, PATH: `${process.env.PATH}:/usr/local/bin` },
        shell: true
    });

    // You can also use a variable to save the output for when the script closes later
    child.on('error', (error) => {

        if (typeof callback_error === 'function' && error) callback_error(error);

        if (verbose < 1) return;

        log("run_script error");

        log(error);
    });

    // child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {

        if (typeof callback_output === 'function' && data) callback_output(data);

        if (verbose < 1) return;

        //Here is the output
        data = data.toString();

        log("script child stdout data");
        log(data);

        data = normalizeStyle(data);

        // global.state.editor.setValue(global.state.editor.getValue() + data);
        global.state.console = data;
        document.querySelector('.console-output').innerHTML += data;
        document.querySelector('.console-output').scrollTo({ top: document.querySelector('.console-output').scrollHeight, behavior: 'smooth' })
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data) => {

        if (typeof callback_error === 'function' && data) callback_error(data);

        if (verbose < 1) return;

        // Return some data to the renderer process with the mainprocess-response ID
        // mainWindow.webContents.send('mainprocess-response', data);
        // Here is the output from the command
        log("script child stderr data");

        log(data);

        data = normalizeStyle(data);

        global.state.console = data;
        document.querySelector('.console-output').innerHTML += data;
        document.querySelector('.console-output').scrollTo({ top: document.querySelector('.console-output').scrollHeight, behavior: 'smooth' })
    });

    child.on('close', (code) => {

        // Here you can get the exit code of the script  
        switch (code) {
            case 0:

                // call next method provided by parent
                if (typeof callback === 'function') callback();

                break;
        }
    });

    return child;
}

export function run_ssh_script(command, script, server, callback, verbose = 1, callback_error, callback_close, timeout) {

    let response = "";

    if (!fs.existsSync(server.key)) {
        const error = new Error(`SSH Key file not found: ${server.key}`);
        if (typeof callback_error === 'function') {
            callback_error("ssh_key", error);
        }
        return;
    }

    const conn = new ssh();
    conn.on('ready', () => {

        log('Client :: ready');

        conn.sftp((error, sftp) => {

            if (typeof callback_error === 'function' && error) { callback_error("ssh_sftp", error); return; }

            sftp.writeFile('/tmp/' + script, command, (error) => {

                if (typeof callback_error === 'function' && error) { callback_error("ssh_write_file", error); return; }

                conn.exec('bash /tmp/' + script, (error, stream) => {

                    if (typeof callback_error === 'function' && error) { callback_error("ssh_exec", error); return; }

                    stream.on('close', (code, signal) => {

                        log('SSH CLOSED');

                        if (typeof callback_close === 'function') callback_close({ "code": code, "signal": signal, "response": response });

                        if (verbose < 1) return;

                        conn.end();

                    }).on('data', (data) => {

                        response += data;

                        log('SSH OUT: ' + data);

                        if (typeof callback === 'function' && data) { callback(data); return; }

                    }).stderr.on('data', (data) => {

                        log('SSH STDERR: ' + data);

                        if (typeof callback_error === 'function' && data) { callback_error("stderr", data); return; }
                    });
                });
            });
        });

    }).on('error', (error) => {

        console.error('SSH Connection Error:', error);

        if (typeof callback_error === 'function' && error) { callback_error("shh_connection", error + '. Server: ' + server.server); return; }

    }).connect({
        readyTimeout: timeout || 30000,
        host: server.server,
        port: server.port,
        username: server.username,
        privateKey: require('fs').readFileSync(server.key)
    });

    return conn;
}

export function toggleDepIconState(id) {

    // log(`toggleDepIconState`);

    if (document.querySelector('.app-publish[data-id="' + id + '"]')) document.querySelector('.app-publish[data-id="' + id + '"]').classList.remove('d-none');
    if (document.querySelector('.app-stop-publish[data-id="' + id + '"]')) document.querySelector('.app-stop-publish[data-id="' + id + '"]').classList.add('d-none');
    if (document.querySelector('.dev-badge[data-id="' + id + '"]')) document.querySelector('.dev-badge[data-id="' + id + '"]').parentElement.innerHTML = `<div class="badge dev-badge bg-primary fw-light po" data-id="${id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`;
    if (document.querySelector('.app-list-publish[data-id="' + id + '"]')) document.querySelector('.app-list-publish[data-id="' + id + '"]').innerHTML = `<div class="badge dev-badge bg-primary fw-light po" data-id="${id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`;

    if (global.state.pub[id].proc) {

        const pid = global.state.pub[id].proc.pid;

        // log(`toggleDepIconState: Checking process with PID ${pid}...`);

        try {
            // Check if the process exists
            process.kill(pid, 0);

            // log(`toggleDepIconState: Process with PID ${pid} is running.`);

            if (document.querySelector('.app-publish[data-id="' + id + '"]')) document.querySelector('.app-publish[data-id="' + id + '"]').classList.add('d-none');
            if (document.querySelector('.app-stop-publish[data-id="' + id + '"]')) document.querySelector('.app-stop-publish[data-id="' + id + '"]').classList.remove('d-none');
            if (document.querySelector('.dev-badge[data-id="' + id + '"]')) document.querySelector('.dev-badge[data-id="' + id + '"]').parentElement.innerHTML = `<div class="badge dev-badge bg-danger fw-light po" data-id="${id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1 mb-0" role="status" aria-hidden="true"></span> ${__html('Publishing')}</div></div>`;
            if (document.querySelector('.app-list-publish[data-id="' + id + '"]')) document.querySelector('.app-list-publish[data-id="' + id + '"]').innerHTML = `<div class="badge dev-badge bg-danger fw-light po" data-id="${id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1 mb-0" role="status" aria-hidden="true"></span> ${__html('Publishing')}</div></div>`;

        } catch (error) {
            if (error.code === 'ESRCH') {
                log(`toggleDepIconState: Process with PID ${pid} is not running.`);
            } else {
                log(`Error checking process with PID ${pid}:`, error);
            }
        }
    }
}

export function normalizeStyle(data) {

    data = data.replaceAll('[1;37m', '<b>')
    data = data.replaceAll('[0m', '</b>')
    data = data.replaceAll('[1;36m', '<b style="color:#1941df;">')
    data = data.replaceAll('[1;36m', '<b style="color:#1941df;">')
    data = data.replaceAll('[0m', '</b>')
    data = data.replaceAll('[1;33m', '<b style="color:#FFA500;">')
    data = data.replaceAll('[0m', '</b>')
    data = data.replaceAll('[1;32m', '<b style="color:#20c997;">')
    data = data.replaceAll('[0m', '</b>')
    data = data.replaceAll('[1;32m', '<b style="color:#f75fb4;">')
    data = data.replaceAll('[0m', '</b>')
    data = data.replaceAll('[1;31m', '<b style="color:#f75fb4;">')
    data = data.replaceAll('[0m', '</b>')
    data = data.replaceAll('[92m', '<b style="color:#20c997;">')
    data = data.replaceAll('[0m', '</b>')
    data = data.replaceAll('[93m', '<b style="color:#5E50F9;">')
    data = data.replaceAll('[0m', '</b>')

    return data;
}

export function validPath(cache) {

    // log('validPath');

    if (!cache.path) {

        if (!cache.title) cache.title = "App";

        document.querySelector('.app-warnings').innerHTML = `
            <div class="alert alert-danger alert-dismissible fade show" role="alert" data-id="36a32a9f35bded87c712ee89d75cae032e1ad58d">
                <div class="d-flex align-items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-square flex-shrink-0 me-2" viewBox="0 0 16 16">
                        <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"></path>
                        <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"></path>
                    </svg>
                    <div class="alert-msg">
                        ${__html('Please specify "%1$" application local path in settings.', cache.title)}
                    </div>
                </div>
                <button type="button" class="btn-close btn-dismiss-notify" data-bs-dismiss="alert" aria-label="Close" data-id="36a32a9f35bded87c712ee89d75cae032e1ad58d"></button>
            </div>
        `;

        toast(__html('Specify local path in settings first'));

        return false;
    }

    return true;
}