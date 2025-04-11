'use strict';

import global from './global.js'
import { __html, toast, getDefaultAppPath, saveKenzapSettings, getKenzapSettings, getToken, log } from './helpers.js'
import { run_ssh_script, run_script } from './dev-tools.js'
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { connected } from 'process';

/**
 * Installs Kubernetes on the specified server within the given cluster.
 * 
 * This function performs the following steps:
 * 1. Installs microk8s on the server.
 * 2. If microk8s is newly installed, it proceeds to install Kubernetes addons.
 * 3. If Kubernetes is already installed, it joins the server to the Kubernetes cluster and downloads the kubeconfig.
 * 
 * @param {Object} cluster - The cluster object containing information about the cluster.
 * @param {Object} server - The server object where Kubernetes will be installed.
 */
export function installKubernetes(cluster, server) {

    global.state.installKubernetesErrors = [];

    let settings = getKenzapSettings();

    // install microk8s
    let step1 = () => {

        let cb = (data) => {

            log("install step1");

            log(data.toString());

            let result = parseInstallResult(data);

            if (result.success) {

                saveKenzapSettings(settings);

                server.status = "ready";
                server.type = "microk8s";
                server.version = result.version;
                server.linux_version = result.linux_version;
                server.linux_architecture = result.linux_architecture;
                cluster.servers = cluster.servers.map(s => s.id === server.id ? server : s);
                cluster.status = "active";
                settings.clusters = settings.clusters.map(c => c.id === cluster.id ? cluster : c);

                saveKenzapSettings(settings);

                // continue only if kluester is newly installed
                if (result.installed) {

                    step2();
                }

                // only download kubeconfig if kubernetes is already installed
                if (!result.installed) {

                    retrieveAllClusterNodes(cluster);

                    joinKubernetes(cluster, server);

                    downloadKubeconfig(cluster.id, server);

                    // toast(__html('Kubernetes installed successfully'));
                }
            }

            if (!result.success) {

                parseErrorResult("exec", "Error installing Kubernetes " + result.message, cluster, server);
            }
        }

        parseWarningResult(__html("Installing Kubernetes to %1$, please wait...", server.server));

        let sh = fs.readFileSync(path.join(__dirname, "../templates/sh/install-kubernetes.sh")).toString();

        let conn = run_ssh_script(sh, "install-kubernetes.sh", server, cb, 0, (tag, error) => { parseErrorResult(tag, error, cluster, server); global.state.installKubernetesErrors.push(error); console.log("install-kubernetes error", error.toString()); }, (data) => { });
    }

    // install kubernetes addons
    let step2 = () => {

        log("install step2");

        let cb = (data) => {

            log(data.toString());

            if (!data.toString()) return;

            let result = parseInstallResult(data);

            if (!result) return;

            if (result.success) {

                joinKubernetes(cluster, server);

                downloadKubeconfig(cluster.id, server);
            }
        }

        let sh = fs.readFileSync(path.join(__dirname, "../templates/sh/install-kubernetes-addons.sh")).toString();

        // Replace placeholder with cluster IP address
        sh = sh.replace("kenzap_ip_address", cluster.servers[0].server);

        run_ssh_script(sh, "install-kubernetes-addons.sh", server, cb, 0, (tag, error) => { parseErrorResult(tag, error, cluster, server); global.state.installKubernetesErrors.push(error); console.log("install-kubernetes-addons error", error.toString()); }, (data) => { }); // parseErrorResult(error, cluster, server);

        global.state.refreshClusters();
    }

    step1();
}

/**
 * Retrieves all nodes from a Kubernetes cluster and updates the cluster's server list.
 * Eliminates the need to add each server manually via ssh.
 * 
 * @param {Object} cluster - The cluster object containing cluster details.
 * @param {string} cluster.id - The unique identifier of the cluster.
 * @param {Array} cluster.servers - The list of servers in the cluster.
 *
 * @returns {void}
 */
export function retrieveAllClusterNodes(cluster, cb) {

    let kubeconfig = getClusterKubeconfig(cluster.id);

    if (!kubeconfig) return;

    let data = "", added = false;

    let proc = run_script('kubectl get nodes -o json --kubeconfig=' + kubeconfig, [], () => { }, false);

    proc.stdout.on('data', (res) => {

        data += res.toString();
    });

    proc.stdout.on('error', (res) => {

        log(`Error retrieving cluster nodes: ${res}`);
    });

    proc.on('close', (code) => {

        log(`kubectl get nodes exited with code ${code}`);

        log(data);

        try {
            data = JSON.parse(data);

            cluster.nodes = [];

            // Add servers if not yet in the array, check by server IP address
            data.items.forEach(item => {

                added = true;

                cluster.nodes.push({
                    id: getToken(6), // You might need to implement this function
                    server: item.status.addresses[0].address,
                    host: item.status.addresses[1].address,
                    capacity: item.status.capacity,
                    version: item.status.nodeInfo.kubeletVersion
                });
            });

            if (added) {

                let settings = getKenzapSettings();

                settings.clusters = settings.clusters.map(c => c.id === cluster.id ? cluster : c);

                log(`Cluster Nodes to Add : ${JSON.stringify(cluster.nodes)}`);

                saveKenzapSettings(settings);

                if (typeof cb === 'function') cb();
            }
        } catch (error) {

            log(`Error processing cluster nodes: ${error}`);
        }
    });
}

/**
 * Joins a server to a Kubernetes cluster.
 *
 * @param {Object} cluster - The Kubernetes cluster object.
 * @param {Object} server - The server object to be joined to the cluster.
 */
export function joinKubernetes(cluster, server) {

    let settings = getKenzapSettings();

    // if single node then nothing to do
    if (cluster.servers.length == 1) {

        server.status = "active";

        cluster.servers = cluster.servers.map(s => s.id === server.id ? server : s);
        settings.clusters = settings.clusters.map(c => c.id === cluster.id ? cluster : c);

        saveKenzapSettings(settings);

        return;
    }

    // get kubeconfig
    let step1 = () => {

        let cb = (data) => {

            log("join step1");

            log(data);

            let result = parseInstallResult(data);

            if (result.success) {

                try {

                    cluster.servers[0].urls = JSON.parse(result.data.urls);
                } catch (error) {

                    return parseErrorResult("exec", "Error creating join urls " + result.error, cluster, server);
                }

                settings.clusters = settings.clusters.map(c => c.id === cluster.id ? cluster : c);

                saveKenzapSettings(settings);

                if (!cluster.status != 'error') step2(cluster.servers[0].urls);
            }
        }

        let sh = fs.readFileSync(path.join(__dirname, "../templates/sh/get-kubernetes-token.sh")).toString();

        run_ssh_script(sh, "get-kubernetes-token.sh", cluster.servers[0], cb, 0, (tag, error) => { parseErrorResult(tag, error, cluster, server); }, (data) => { });
    }

    let step2 = (urls) => {

        let cb = (data) => {

            let result = parseInstallResult(data);

            if (result.success) {

                try {

                    settings.nodes = result.data.nodes
                } catch (error) {

                    return parseErrorResult("parse", "Error parsing nodes response " + result.error, cluster, server);
                }

                server.status = "active";
                server.connected = true;
                cluster.servers = cluster.servers.map(s => s.id === server.id ? server : s);
                settings.clusters = settings.clusters.map(c => c.id === cluster.id ? cluster : c);

                saveKenzapSettings(settings);
            } else {

                return parseErrorResult("exec", "Error joining kubernetes " + result.error, cluster, server);
            }
        }

        let sh = fs.readFileSync(path.join(__dirname, "../templates/sh/join-kubernetes-node.sh")).toString();

        // add connction token created by the first cluster node
        sh = sh.replace("{{url}}", urls.urls[0]);

        run_ssh_script(sh, "join-kubernetes-node.sh", server, cb, 0, (tag, error) => { parseErrorResult(tag, error, cluster, server); }, (data) => { });
    }

    step1();
}

/**
 * Downloads the kubeconfig file for a specified Kubernetes cluster.
 *
 * @param {string} id - The ID of the Kubernetes cluster.
 * @param {string} server - The server address of the Kubernetes cluster.
 * @param {boolean} [download=false] - If true, the kubeconfig will be downloaded to the user's Downloads folder. If false, it will be saved to the .kenzap/settings directory.
 */
export function downloadKubeconfig(id, server, download = false) {

    let settings = getKenzapSettings();

    let cluster = settings.clusters.filter(cluster => cluster.id == id)
    server = server ? server : cluster[0].servers[0];

    if (cluster[0].status == 'creating') { console.log("Cluster is still creating. Skip downloadKubeconfig"); return; }

    // get kubeconfig
    let step1 = () => {

        let cb = (data) => {

            log("kube step1");

            log(data.toString());

            let result = parseInstallResult(data);

            if (!result.success) {

                toast(__html('Error downloading kubeconfig'));

                return;
            }

            if (result.success) {

                // user requested to download kubeconfig
                if (download) {

                    const filePath = path.join(require('os').homedir(), 'Downloads', 'kubeconfig.yaml');
                    fs.writeFileSync(filePath, result.data.kubeconfig);
                    toast(__html('Kubeconfig downloaded'));

                    // save kubeconfig to .kenzap/settings
                } else {

                    saveClusterKubeconfig(`kubeconfig-${id}.yaml`, result.data.kubeconfig, id);
                }
            }
        }

        let sh = fs.readFileSync(path.join(__dirname, "../templates/sh/get-kubernetes-kubeconfig.sh")).toString();

        run_ssh_script(sh, "get-kubernetes-kubeconfig.sh", server, cb, 0, (tag, error) => { parseErrorResult(tag, error, cluster, server); }, (data) => { });
    }

    step1();
}

/**
 * Saves the Kubernetes configuration file for a specific cluster.
 *
 * @param {string} filename - The name of the file to save the kubeconfig to.
 * @param {string} kubeconfig - The Kubernetes configuration content in YAML format.
 * @param {string} id - The unique identifier of the cluster.
 *
 * @throws Will throw an error if the file system operations fail.
 */
export function saveClusterKubeconfig(filename, kubeconfig, id) {

    let settings = getKenzapSettings();

    let cluster = settings.clusters.filter(cluster => cluster.id == id)[0]

    // init defaults
    let appFolder = getDefaultAppPath() + require('path').sep + '.kenzap';
    let kubePath = appFolder + require('path').sep + filename;

    if (!fs.existsSync(appFolder)) {
        fs.mkdirSync(appFolder, { recursive: true });
    }

    // Check if kubeconfig server is a private IP address
    const kube = yaml.loadAll(kubeconfig, 'utf8');

    const serverUrl = kube[0].clusters[0].cluster.server;
    const privateIpRegex = /^(10|172\.16|192\.168)\./;

    // allow self issued certificates
    kube[0].clusters[0].cluster['insecure-skip-tls-verify'] = true;
    delete kube[0].clusters[0].cluster['certificate-authority-data'];

    if (privateIpRegex.test(new URL(serverUrl).hostname)) {

        // console.log("Private IP detected");

        kube[0].clusters[0].cluster.server = "https://" + cluster.servers[0].server + ":16443";

        // convert json to final endpoints.yaml file
        kubeconfig = kube.map(ef => { return yaml.dump(ef, {}); }).join("---\n");
    }

    fs.writeFileSync(kubePath, kubeconfig);
}

/**
/**
 * Parses the installation result from a JSON string.
 *
 * @param {string} data - The JSON string to parse.
 * @returns {Object} The parsed result object. If parsing fails, returns an object with a "success" property set to false.
 */
export function parseInstallResult(data) {

    let result = { "success": false };

    try {

        result = JSON.parse(data);
    } catch (error) {

        console.log("Error parsing JSON", error);
        return;
    }

    return result;
}

/**
 * Parses the warning result and updates the DOM to display a warning alert.
 *
 * @param {string} data - The warning message to be displayed.
 */
export function parseWarningResult(data) {

    document.querySelector('.app-warnings').innerHTML = `
        <div class="alert alert-warning alert-dismissible fade show" role="alert" >
            <div class="d-flex align-items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-square flex-shrink-0 me-2" viewBox="0 0 16 16">
                    <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"></path>
                    <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"></path>
                </svg>
                <div class="alert-msg">
                    ${data}
                </div>
            </div>
            <button type="button" class="btn-close btn-dismiss-notify" data-bs-dismiss="alert" aria-label="Close" ></button>
        </div>
    `;
}

/**
 * Parses the error result and updates the cluster status accordingly.
 * Displays an error message in the UI.
 *
 * @param {string} error - The error message to display.
 * @param {Object} cluster - The cluster object to update.
 * @param {string} cluster.id - The unique identifier of the cluster.
 * @param {string} cluster.status - The current status of the cluster.
 * @param {number} [cluster.attempts] - The number of attempts made to connect to the cluster.
 * @param {Object} server - The server object associated with the error.
 */
export function parseErrorResult(tag, error, cluster, server) {

    // preprocess error based on tag
    switch (tag) {

        case "exec":
            error = "Error executing command: " + error;
            break;
        case "shh_exec":
        case "shh_sftp":
        case "shh_connection":
            error = "SSH: " + error;
            break;
        case "parse":
            return;
        default:
            return;
    }

    if (cluster) {

        let settings = getKenzapSettings();

        cluster.status = 'error';

        cluster.attempts = cluster.attempts ? cluster.attempts + 1 : 1;

        if (cluster.attempts > 3) { cluster.status = 'error'; cluster.error = { reason: error, server: server }; }

        settings.clusters = settings.clusters.map(c => c.id === cluster.id ? cluster : c);

        saveKenzapSettings(settings);
    }

    document.querySelector('.app-warnings').innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert" >
            <div class="d-flex align-items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-square flex-shrink-0 me-2" viewBox="0 0 16 16">
                    <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"></path>
                    <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"></path>
                </svg>
                <div class="alert-msg">
                    ${error}
                </div>
            </div>
            <button type="button" class="btn-close btn-dismiss-notify" data-bs-dismiss="alert" aria-label="Close" ></button>
        </div>
    `;

    toast(__html('Error occured'));

    return false;
}

/**
 * Generates the file path for the Kubernetes configuration file for a given cluster ID.
 *
 * @param {string} id - The unique identifier of the Kubernetes cluster.
 * @returns {string} The file path to the Kubernetes configuration file.
 */
export function getClusterKubeconfig(id) {

    return getDefaultAppPath() + require('path').sep + '.kenzap/kubeconfig-' + id + '.yaml';
}