'use strict';

import global from './global.js'
import { __html, toast, getDefaultAppPath, getKenzapSettings, cacheSettings, consoleUI, log } from './helpers.js'
import { getClusterKubeconfig } from './cluster-kubernetes-helpers.js'
import { https, v2 } from './app-registry-helpers.js'
import { Endpoints } from './app-endpoints.js'
import { run_script } from './dev-tools.js'
import fs, { unlink } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { connected } from 'process';

/**
 * Provisions a cluster application by performing a series of steps to clean up
 * and recreate the necessary Kubernetes namespace and resources.
 *
 * @param {Object} app - The application object containing details for provisioning.
 * @param {string} app.id - The unique identifier of the application.
 * @param {string} app.slug - The slug used as the namespace for the application.
 * @param {Array} app.clusters - An array of cluster objects associated with the application.
 * @param {string} app.path - The file path where the application resources are located.
 *
 * The function executes the following steps:
 * 1. Deletes all resources in the application's namespace.
 * 2. Deletes the namespace itself.
 * 3. Force deletes the namespace and its finalizers if necessary.
 * 4. Deletes any existing CertificateSigningRequest for the application.
 * 5. Recreates the namespace and provisions the cluster user.
 *
 * Logs and handles errors at each step, ensuring the process continues to the next step.
 */
export function provisionClusterApp(app, cb) {

    log('Provisioning cluster app: ', app.id);

    document.querySelector('.console-output').innerHTML = "";

    let kubeconfig = getClusterKubeconfig(app.clusters[0]);

    let step1 = () => {

        logModal("Clearing previous resources in " + app.slug + " namespace");

        // clear namespace
        log(`cd ${app.path}; kubectl delete all --all -n ${app.slug} --kubeconfig=${kubeconfig}`);
        run_script(`cd ${app.path}; kubectl delete all --all -n ${app.slug} --kubeconfig=${kubeconfig}`, [], () => { consoleUI(`Removing previous resources in ${app.slug} namespace`); step2(); }, 0, (error) => { log('Cluster 1 E: ', error.toString()); });
    }

    let step2 = () => {

        // clear namespace
        run_script(`cd ${app.path}; kubectl delete namespace ${app.slug} --kubeconfig=${kubeconfig}`, [], () => { consoleUI(`Removing ${app.slug} namespace`); step3(); }, 0, (error) => { log('Cluster 2 E: ', error.toString()); step3(); });
    }

    let step3 = () => {

        // force delete namespace and all resources
        log(`kubectl get namespace "${app.slug}" --kubeconfig=${kubeconfig} -o json | tr -d "\n" | sed "s/\"finalizers\": \[[^]]\+\]/\"finalizers\": []/" | kubectl replace --kubeconfig=${kubeconfig} --raw /api/v1/namespaces/${app.slug}/finalize -f -`);
        run_script(`cd ${app.path}; kubectl get namespace "${app.slug}" --kubeconfig=${kubeconfig} -o json | tr -d "\n" | sed "s/\"finalizers\": \[[^]]\+\]/\"finalizers\": []/" | kubectl replace --kubeconfig=${kubeconfig} --raw /api/v1/namespaces/${app.slug}/finalize -f -`, [], () => { step4(); consoleUI('Namespace force removed'); }, 0, (error) => { step4(); log('Cluster 3 E: ', error.toString()); });
    }

    let step4 = () => {

        log('step4');

        // CertificateSigningRequest
        log(`kubectl delete CertificateSigningRequest ${app.slug} --kubeconfig=${kubeconfig}`);
        run_script(`kubectl delete CertificateSigningRequest ${app.slug} --kubeconfig=${kubeconfig}`, [], () => { consoleUI('Clearing previous certificate signing requests'); step5(); }, 1, (error) => { step5(); });
    }

    let step5 = () => {

        log('step5');

        logModal("Creating namespace " + app.namespace);

        // create namespace
        log(`cd ${app.path}; kubectl create namespace ${app.slug} --kubeconfig=${kubeconfig}`);
        run_script(`cd ${app.path}; kubectl create namespace ${app.slug} --kubeconfig=${kubeconfig}`, [], () => { consoleUI(`Creating ${app.slug} namespace`); provisionClusterUser(app, cb); }, 1, (error) => { log('Cluster 5 E: ', error.toString()); provisionClusterUser(app, cb); });
    }

    step1();
}

/**
 * Provisions a cluster user by performing a series of steps including cleanup, certificate creation, 
 * user role binding, certificate approval, and exporting the certificate.
 *
 * @param {Object} app - The data required for provisioning the cluster user.
 * @param {string} app.path - The path where the user data and certificates will be stored.
 * @param {string} app.slug - The unique identifier for the user.
 * @param {string} app.certData - The base64 encoded certificate data (output).
 * @param {string} app.keyData - The base64 encoded key data (output).
 */
export function provisionClusterUser(app, cb) {

    let kubeconfig = getClusterKubeconfig(app.clusters[0]);

    log("provisionClusterUser kubeconfig file: ", kubeconfig);

    let step1 = () => {

        // cleanup
        run_script(`cd ${app.path}; rm -Rf ${app.slug}.crt; rm -Rf ${app.slug}.key; rm -Rf ${app.slug}.csr; rm -Rf ${app.slug}-user-role-binding.yaml; rm -Rf ${app.slug}-user-roles.yaml; rm -Rf ${app.slug}-csr.yaml; rm -Rf ${app.slug}-network-policy.yaml;`, [], () => { consoleUI('Removing old certificate'); step2() });
    }

    let step2 = () => {

        logModal("Provisioning cluster user");

        // create new certificates
        log(`openssl genrsa -out ${app.slug}.key 2048; openssl req -new -key ${app.slug}.key -out ${app.slug}.csr -subj "/CN=${app.slug}"; cat ${app.slug}.csr | base64 | tr -d "\n" `);
        run_script(`cd ${app.path}; openssl genrsa -out ${app.slug}.key 2048; openssl req -new -key ${app.slug}.key -out ${app.slug}.csr -subj "/CN=${app.slug}"; cat ${app.slug}.csr | base64 | tr -d "\n" `, [], () => { consoleUI('Creting new certificate'); }, 0, (error) => { log('User 2 E: ', error.toString()) }, (response) => { log('User 2 R: ' + response.toString()); setTimeout(() => { step3(response.toString()) }, 1500); });
    }

    let step3 = (response) => {

        // create user role binding
        let certRequest = fs.readFileSync(path.join(__dirname, "..", "templates", "sh", "cert_request.yaml")).toString();

        // consoleUI(certRequest);

        certRequest = certRequest.replace(/kenzap-app-slug-request/g, response);
        certRequest = certRequest.replace(/kenzap-app-slug/g, app.slug);
        fs.writeFileSync(path.join(app.path, `${app.slug}-csr.yaml`), certRequest);

        // kubectl create -f php-test-csr.yaml --kubeconfig=../.kenzap/kubeconfig-GJDmHH.yaml
        log(`kubectl create -f ${app.slug}-csr.yaml --kubeconfig=${kubeconfig}`);
        run_script(`cd ${app.path}; kubectl create -f ${app.slug}-csr.yaml --kubeconfig=${kubeconfig}`, [], () => { consoleUI('Creating certificate signing request'); step4() });
    }

    let step4 = () => {

        // certificate auto approve | kubectl certificate approve php-test --kubeconfig=../.kenzap/kubeconfig-GJDmHH.yaml
        log(`cd ${app.path}; kubectl certificate approve ${app.slug} --kubeconfig=${kubeconfig}`);
        run_script(`cd ${app.path}; kubectl certificate approve ${app.slug} --kubeconfig=${kubeconfig}`, [], () => { consoleUI('Approving certificate'); setTimeout(() => { step5(); }, 100); });
    }

    let step5 = () => {

        // certificate export | kubectl get csr php-test --kubeconfig=../.kenzap/kubeconfig-GJDmHH.yaml -o jsonpath='{.status.certificate}' | base64 -d > php-test.crt
        log(`kubectl get csr ${app.slug} --kubeconfig=${kubeconfig} -o jsonpath='{.status.certificate}' | base64 -d > ${app.slug}.crt`);
        run_script(`cd ${app.path}; kubectl get csr ${app.slug} --kubeconfig=${kubeconfig} -o jsonpath='{.status.certificate}' | base64 -d > ${app.slug}.crt`, [], () => { consoleUI('User 5: certificate exported'); step6(); });
    }

    let step6 = () => {

        // kubectl get csr --kubeconfig=../.kenzap/kubeconfig-GJDmHH.yaml
        log(`kubectl get csr --kubeconfig=${kubeconfig}`);
        run_script(`cd ${app.path}; kubectl get csr --kubeconfig=${kubeconfig}`, [], () => { consoleUI('Retrieving certificate signing request'); step8(); });
    }

    let step7 = () => {

    }

    let step8 = () => {

        logModal("Setting up CI/CD environment");

        app.certData = fs.readFileSync(path.join(app.path, `${app.slug}.crt`)).toString('base64').replace(/\n/g, '');
        app.keyData = fs.readFileSync(path.join(app.path, `${app.slug}.key`)).toString('base64').replace(/\n/g, '');

        // create user role binding
        let userRolesTemplate = fs.readFileSync(path.join(__dirname, "..", "templates", "sh", "user-roles.yaml"), 'utf8');
        userRolesTemplate = userRolesTemplate.replace(/kenzap-slug/g, app.slug);
        userRolesTemplate = userRolesTemplate.replace(/kenzap-namespace/g, app.slug);
        fs.writeFileSync(path.join(app.path, `${app.slug}-user-roles.yaml`), userRolesTemplate);
        run_script(`cd ${app.path}; kubectl create -f ${app.slug}-user-roles.yaml --kubeconfig=${kubeconfig}`, [], () => { consoleUI('Creating user roles'); step9(); });
    }

    let step9 = () => {

        let userRoleBindingTemplate = fs.readFileSync(path.join(__dirname, "..", "templates", "sh", "user-role-binding.yaml"), 'utf8');
        userRoleBindingTemplate = userRoleBindingTemplate.replace(/kenzap-slug/g, app.slug);
        userRoleBindingTemplate = userRoleBindingTemplate.replace(/kenzap-namespace/g, app.slug);
        fs.writeFileSync(path.join(app.path, `${app.slug}-user-role-binding.yaml`), userRoleBindingTemplate);
        run_script(`cd ${app.path}; kubectl create -f ${app.slug}-user-role-binding.yaml --kubeconfig=${kubeconfig}`, [], () => { consoleUI('Creating user role binding'); finalize(); });
    }

    let finalize = () => {

        // this.setLoading(false);

        createLocalApp(app, cb);

        toast(__html('Application created'));
    }

    step1();
}

/**
 * Creates a local application by setting up necessary configurations, copying template files,
 * and applying Kubernetes configurations.
 *
 * @param {Object} app - The application object containing details about the app to be created.
 * @param {string} app.path - The file path where the application will be created.
 * @param {string} app.slug - The unique identifier for the application.
 * @param {string} app.title - The title of the application.
 * @param {Array<string>} app.clusters - The list of cluster IDs associated with the application.
 * @param {string} app.project - The project name associated with the application.
 *
 * @throws {Error} Throws an error if required files or directories are missing during the process.
 *
 * @description
 * This function performs the following steps:
 * 1. Retrieves application settings and cluster information.
 * 2. Reads and encodes certificate and key files for the application.
 * 3. Copies the Kubernetes configuration file to the application directory.
 * 4. Ensures required configuration files (`devspace.yaml`, `app.yaml`, `endpoints.yaml`) are present.
 * 5. Copies template files for the application, excluding specific files.
 * 6. Updates the `endpoints.yaml` file with application-specific details.
 * 7. Publishes endpoints to DNS and applies Kubernetes configurations.
 * 8. Cleans up temporary files after the setup process.
 * 9. Loads the application settings page.
 *
 * @example
 * const app = {
 *   path: '/path/to/app',
 *   slug: 'my-app',
 *   title: 'My Application',
 *   clusters: ['cluster1'],
 *   project: 'my-project'
 * };
 * createLocalApp(app);
 */
export function createLocalApp(app, cb) {

    logModal("Setting up application files");

    let settings = getKenzapSettings();

    let cluster_id = app.clusters[0]

    // get cluster
    let cluster = settings.clusters.find(cluster => cluster.id == cluster_id);

    // get cert data
    app.certData = fs.readFileSync(path.join(app.path, `${app.slug}.crt`)).toString('base64').replace(/\n/g, '');
    app.keyData = fs.readFileSync(path.join(app.path, `${app.slug}.key`)).toString('base64').replace(/\n/g, '');

    // Copy kubeconfig from parent folder /.kenzap
    let appFolder = path.join(getDefaultAppPath(), '.kenzap');
    const kubeconfigSource = path.join(appFolder, `kubeconfig-${cluster_id}.yaml`);
    const kubeconfigDestination = path.join(app.path, `kubeconfig-${cluster_id}.yaml`);

    if (fs.existsSync(kubeconfigSource)) {
        fs.copyFileSync(kubeconfigSource, kubeconfigDestination);
        console.log(`Kubeconfig copied from ${kubeconfigSource} to ${kubeconfigDestination}`);
    } else {
        console.log(`Kubeconfig file not found at ${kubeconfigSource}`);
    }

    // clean up prev files
    cleanUpFiles(app);

    // check if app.yaml is missing
    if (!fs.existsSync(path.join(app.path, "devspace.yaml"))) {

        let devspaceContent = fs.readFileSync(path.join(__dirname, "..", "templates", "app", "devspace.yaml"), 'utf8');
        fs.writeFileSync(path.join(app.path, 'devspace.yaml'), devspaceContent);
        applyActions(app, path.join(app.path, "devspace.yaml"));
    }

    // check if app.yaml is missing
    if (!fs.existsSync(path.join(app.path, "app.yaml"))) {

        let appContent = fs.readFileSync(path.join(__dirname, "..", "templates", "app", "app.yaml"), 'utf8');
        fs.writeFileSync(path.join(app.path, 'app.yaml'), appContent);
        log("applying rules for app.yaml");
        applyActions(app, path.join(app.path, 'app.yaml'));
    }

    // check if endpoints.yaml is missing
    let endpointsPath = path.join(app.path, 'endpoints.yaml');

    // check if endpoints.yaml is missing
    if (!fs.existsSync(endpointsPath)) {

        // create endpoints.yaml
        let endpointsContent = fs.readFileSync(path.join(__dirname, "..", "templates", "app", "endpoints.yaml"), 'utf8');
        fs.writeFileSync(endpointsPath, endpointsContent);
        applyActions(app, endpointsPath);
    }

    // copy app template files
    const templateFolder = path.join(__dirname, "..", "templates", "apps", app.image, app.image_id);
    const filesToExclude = ["manifest.json", ".DS_Store"];
    if (fs.existsSync(templateFolder)) {

        const files = fs.readdirSync(templateFolder);
        files.forEach(file => {

            log('Copying file:', file);

            if (!filesToExclude.includes(file)) {
                const sourcePath = path.join(templateFolder, file);
                const targetPath = path.join(app.path, file);

                if (fs.lstatSync(sourcePath).isDirectory()) {
                    const copyFolderRecursiveSync = (source, target) => {
                        if (!fs.existsSync(target)) {
                            fs.mkdirSync(target);
                        }

                        const items = fs.readdirSync(source);
                        items.forEach(item => {
                            const curSource = path.join(source, item);
                            const curTarget = path.join(target, item);
                            if (fs.lstatSync(curSource).isDirectory()) {
                                copyFolderRecursiveSync(curSource, curTarget);
                            } else {
                                fs.copyFileSync(curSource, curTarget);
                            }
                        });
                    };

                    copyFolderRecursiveSync(sourcePath, targetPath);
                } else {

                    fs.copyFileSync(sourcePath, targetPath);

                    if (!file.startsWith('.')) applyActions(app, targetPath);
                }
            }
        });
    } else {
        log(`Template folder not found at ${templateFolder}`);
    }

    logModal("Creating application endpoints");

    // update endpoints.yaml
    let endpointsContent = fs.readFileSync(endpointsPath, 'utf8');
    let template_endpoint = app.slug + ".endpoint-" + settings.id.toLowerCase() + ".kenzap.cloud";
    endpointsContent = endpointsContent.replace(/template_namespace/g, app.slug);
    endpointsContent = endpointsContent.replace(/template_slug/g, app.slug);
    endpointsContent = endpointsContent.replace(/template_endpoint/g, template_endpoint);
    fs.writeFileSync(endpointsPath, endpointsContent);

    // hideLoader();

    cacheSettings(app);

    log(app)

    if (!global.state.dev[app.id]) global.state.dev[app.id] = { status: "stop", edgeStatus: "d-none" }

    log(`App created in ${app.path} with ${app.slug} namespace and ${app.id} app id`);

    // apply endpoints
    setTimeout(() => {

        // publish endpoints to DNS
        let endpoints = new Endpoints(app);
        endpoints.init();
        endpoints.createEndpoints();

        logModal("");

        run_script('cd ' + app.path + ' && kubectl apply -f endpoints.yaml --kubeconfig=kubeconfig-' + cluster.id + '.yaml', [], () => { });
    }, 2000);

    // clean up
    setTimeout(() => { run_script(`cd ${app.path}; rm -Rf ${app.slug}.crt; rm -Rf ${app.slug}.key; rm -Rf ${app.slug}.csr; rm -Rf ${app.slug}-user-roles.yaml; rm -Rf ${app.slug}-user-role-binding.yaml; rm -Rf ${app.slug}-csr.yaml; rm -Rf ${app.slug}-network-policy.yaml;`, [], () => { consoleUI('Cleaning up'); }); }, 20000);

    // load app settings page
    setTimeout((cb) => { cb("success", app); }, 2000, cb);
}

/**
 * Cleans up specific YAML configuration files from the application's directory.
 * 
 * This function checks for the existence of the following files in the application's
 * path and deletes them if they are found:
 * - `devspace.yaml`
 * - `app.yaml`
 * - `endpoints.yaml`
 */
export function cleanUpFiles(app) {

    console.log("Cleaning up devspace.yaml", path.join(app.path, "devspace.yaml"));

    if (fs.existsSync(path.join(app.path, "devspace.yaml"))) {
        fs.unlinkSync(path.join(app.path, "devspace.yaml"));
    }

    if (fs.existsSync(path.join(app.path, "app.yaml"))) {
        fs.unlinkSync(path.join(app.path, "app.yaml"));
    }

    if (!fs.existsSync(path.join(app.path, "endpoints.yaml"))) {
        fs.unlinkSync(path.join(app.path, "endpoints.yaml"));
    }
}

/**
 * Applies a series of transformations and updates to the content of a file
 * based on the provided data and target path.
 *
 * @param {Object} app - The data object containing information for processing.
 * @param {string} targetPath - The file path of the target file to be modified.
 *
 * @throws {Error} If the file cannot be read or written.
 *
 * @description
 * This function performs the following steps:
 * 1. Reads the content of the file specified by `targetPath`.
 * 2. Applies transformation rules defined in `app.actions` to the file content.
 * 3. Replaces placeholders in the file content with values derived from the `app` object.
 * 4. Saves the modified content back to the file at `targetPath`.
 */
export function applyActions(app, targetPath) {

    log("applying actions to: ", targetPath);

    // read file
    let fileContent = fs.readFileSync(targetPath, 'utf8');

    // apply manifest.json rules
    if (app.actions) fileContent = app.actions.apply("firstView", fileContent);

    log("replacing template_registry_url with: ", https(v2(app.registry.domain)));

    // CI/CD settings
    fileContent = fileContent.replace(/template_registry_url/g, `${https(v2(app.registry.domain))}`);
    fileContent = fileContent.replace(/template_registry_username/g, app.registry.user);
    fileContent = fileContent.replace(/template_registry_password/g, app.registry.pass);
    fileContent = fileContent.replace(/template_registry/g, `${v2(app.registry.domain)}`);
    fileContent = fileContent.replace(/template_slug/g, app.slug);
    fileContent = fileContent.replace(/template_namespace/g, app.slug);

    // save changes
    fs.writeFileSync(targetPath, fileContent);
}

export function logModal(msg) {

    if (document.querySelector('console-output-modal')) document.querySelector('console-output-modal').innerHTML = `
        <div class="console-line form-text text-center text-secondary my-5">
            ${msg}
        </div>
    `;
}