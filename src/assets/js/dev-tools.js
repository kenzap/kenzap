
import global from "./global.js"
import { shell } from 'electron' // deconstructing assignment
import { __html, attr, onClick, simulateClick, getSetting, toast, showLoader, hideLoader, parseError, log } from './helpers.js'
import child_process from "child_process"
import terminate from "terminate"
import fs from "fs"
import yaml from 'js-yaml';
import { appList } from "../../renderer/app-list.js"
import { getAppKubeconfig } from './app-status-helpers.js'
import * as path from 'path';
import { getClusterKubeconfig } from './cluster-kubernetes-helpers.js'
import { Client as ssh } from 'ssh2';
import { timeStamp } from "console"

export class DevTools {

    constructor(global) {

        this.global = global;
    }

    listeners() {

        // publish app
        onClick('.app-publish', e => {

            if (document.querySelector(".settings")) { simulateClick(document.querySelector('.app-save')); this.global.runDeploy = true; return; }

            e.preventDefault();

            if (confirm(__html('Publish app?'))) {

                checkAppClusterState(e.currentTarget.dataset.id);
            }
        });

        // start dev
        onClick('.start-dev-app', e => {

            e.preventDefault();

            devApp(e.currentTarget.dataset.id, 'start');
        });

        // stop dev
        onClick('.stop-dev-app', e => {

            e.preventDefault();

            devApp(e.currentTarget.dataset.id, 'stop');
        });

        // start console
        onClick('.start-terminal', e => {

            e.preventDefault();

            consoleApp(e.currentTarget.dataset.id);
        });

        // open folder
        onClick('.open-folder', e => {

            e.preventDefault();

            let cache = getSetting(e.currentTarget.dataset.id);

            // shell.showItemInFolder('filepath') // Show the given file in a file manager. If possible, select the file.
            shell.openPath(cache.path) // Open the given file in the desktop's default manner.            
        });
    }

    init() {

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
 * Manages the development state of an application by starting or stopping the development process.
 *
 * @param {string} id - The unique identifier of the application.
 * @param {string} cmd - The command to execute, either 'start' or 'stop'.
 */
export function devApp(id, cmd) {

    if (!global.state.dev) global.state.dev = {};
    if (!global.state.dev[id]) global.state.dev[id] = { running: true };

    let cache = getSetting(id);

    let app = global.state.apps.filter(app => app.id == id)[0];

    if (!validPath(cache)) return;

    let kubeconfig = getAppKubeconfig(app.id);

    if (!kubeconfig) return;

    let devspace = getDevspacePath();

    if (cmd == 'start') {

        document.querySelector('[data-id="' + id + '"].stop-dev-app').classList.remove('d-none');
        document.querySelector('[data-id="' + id + '"].start-dev-app').classList.add('d-none');
        if (document.querySelector('[data-id="' + id + '"].dev-badge')) document.querySelector('[data-id="' + id + '"].dev-badge').parentElement.innerHTML = `<div class="badge dev-badge bg-danger fw-light po" data-id="${app.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1 mb-0" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div>`;
        document.querySelector('.console-output').innerHTML = "";

        let cb = () => {

            log('cd ' + cache.path + ' && ' + devspace + ' sync -n ' + id + ' --config=devspace.yaml --kubeconfig=' + kubeconfig + ' --no-warn')
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
            global.state.dev[id].proc = run_script('cd ' + cache.path + ' && rm -Rf .devspace && ' + devspace + ' sync -n ' + id + ' --config=devspace.yaml --kubeconfig=' + kubeconfig + ' --no-warn', [], cb);
        }
    }

    if (cmd == 'stop') {

        document.querySelector('[data-id="' + id + '"].stop-dev-app').classList.add('d-none');
        document.querySelector('[data-id="' + id + '"].start-dev-app').classList.remove('d-none');
        document.querySelector('[data-id="' + id + '"].dev-badge').parentElement.innerHTML = `<div class="badge dev-badge bg-primary fw-light po" data-id="${app.id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`
        terminate(global.state.dev[id].proc.pid, err => log(err))
        global.state.dev[id].status = "stop";
    }
}

/**
 * Launches a terminal and executes a script to enter a development space for the specified app.
 *
 * @param {string} id - The ID of the app to enter the development space for.
 *
 */
export function consoleApp(id) {

    let cache = getSetting(id);

    let app = global.state.apps.filter(app => app.id == id)[0];

    if (!validPath(cache)) return;

    let kubeconfig = getAppKubeconfig(app.id);

    if (!kubeconfig) return;

    let cb = () => { };

    let args = [];
    var child = child_process.spawn('echo "cd ' + cache.path + ' && devspace enter --config=devspace.yaml --kubeconfig=' + kubeconfig + '; rm /tmp/console.sh" > /tmp/console.sh ; chmod +x /tmp/console.sh ; open -a Terminal /tmp/console.sh', args, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: true },
        shell: true
    });
}

export function checkAppClusterState(id) {

    let cache = getSetting(id);

    // validate data
    let data = { id: id, endpoints: [] };

    // get endpoints
    if (cache.path) if (fs.existsSync(path.join(cache.path, 'endpoints.yaml'))) {

        try {
            // global.state.app.endpoints = [];
            const endpoints = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'endpoints.yaml'), 'utf8'));

            endpoints.forEach(endpoint => {

                if (endpoint.kind == "Ingress") {

                    endpoint.spec.rules.map(rule => {

                        data.endpoints.push({ "host": rule.host, "port": rule.http.paths[0].backend.service.port.number });
                    })
                }
            });

        } catch (err) {

            parseError(err);
        }
    }

    // still loading
    if (global.state.loading) return false;

    // show loading
    showLoader();

    // block UI buttons
    global.state.loading = true;

    toast(__html('Publishing'));

    // check if config files exist
    checkConfigs(id);

    // show UI
    hideLoader();

    // deploy to cluster
    deploy(id);
};

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

/**
 * Deploys the application with the given ID.
 *
 * This function sets up the necessary environment and configurations for deploying
 * an application. It ensures that any ongoing synchronization is stopped, sets up
 * deployment defaults, and initiates the deployment process using DevSpace and Kubernetes.
 *
 * @param {string} id - The unique identifier of the application to be deployed.
 */
export function deploy(id) {

    log('deploy', id);

    // set dev object defaults
    if (!global.state.dev) global.state.dev = { status: "stop" };

    // check if sync is running and shut it down
    if (global.state.dev[id]) if (global.state.dev[id].status == "sync") devApp(id, 'stop');

    // set dev deployment defaults
    if (!global.state.dev[id]) global.state.dev[id] = { running: true, timeStamp: Date.now() };

    let cache = getSetting(id);

    document.querySelector('.console-output').innerHTML = "";

    global.state.app = global.state.apps.filter(app => app.id == id)[0];

    let kubeconfig = getAppKubeconfig(global.state.app.id);

    if (!kubeconfig) return;

    let cb = () => {

        global.state.loading = false;
    }

    global.state.dev[id].edgePending = true;

    global.state.dev[id].path = [];

    if (!global.state.dev[id].iteration) global.state.dev[id].iteration = 0;

    document.querySelector(".edge-status[data-id='" + id + "']").classList.add("pending"); document.querySelector(".edge-status[data-id='" + id + "']").classList.remove("d-none");

    if (cache.path) {
        const devspaceFiles = fs.readdirSync(cache.path).filter(file => file.endsWith('.yaml') && file.startsWith('devspace'));

        devspaceFiles.forEach(devspaceFile => {
            const devspaceFilePath = path.join(cache.path, devspaceFile);

            if (fs.existsSync(devspaceFilePath)) {

                global.state.dev[id].path.push(devspaceFilePath);
            }
        });
    }

    deployRecursive(id, cache, kubeconfig);
}

export function deployRecursive(id, cache, kubeconfig) {

    let devspace = getDevspacePath();

    if (global.state.dev[id].iteration >= global.state.dev[id].path.length) return;

    try {

        let devspaceFile = global.state.dev[id].path[global.state.dev[id].iteration];
        let dev = yaml.loadAll(fs.readFileSync(global.state.dev[id].path[global.state.dev[id].iteration], 'utf8'));

        if (dev[0]) dev = dev[0];

        log('deploy devspaceFile', devspaceFile);

        log(devspace + ' deploy -n ' + id + ' --config=' + devspaceFile + ' --kubeconfig=' + kubeconfig + ' --no-warn -b');

        global.state.dev[id].proc = run_script(
            'cd ' + cache.path + ' && docker login -u ' + dev.pullSecrets.pullsecret.username +
            ' -p ' + dev.pullSecrets.pullsecret.password + ' ' + dev.pullSecrets.pullsecret.registry +
            ' && ' + devspace + ' deploy -n ' + id + ' --config=' + devspaceFile + ' --kubeconfig=' + kubeconfig + ' -b',
            [],
            cb,
            1,
            (error) => { log('Deploy E: ', error.toString()); },
            (output) => { if (output.toString().includes("Successfully deployed")) { log('Deploy O:', output.toString()); global.state.dev[id].iteration += 1; deployRecursive(id, cache, kubeconfig); } }
        );

    } catch (err) {
        log(err);
        parseError(err);
    }
}

export function deleteApp(id, cb) {

    let data = global.state.apps.filter(app => app.id == id)[0];

    if (!data.clusters) { toast(__html("Please remove app manually")); return; }

    let kubeconfigCluster = getClusterKubeconfig(data.clusters[0]);

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

    // log('run_script ' + process.env.PATH, command);

    var child = child_process.spawn(command, args, {
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

    log('validPath');

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