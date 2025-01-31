'use strict';

import { ipcRenderer } from 'electron'
import global from '../assets/js/global.js'
import { __html, html, attr, toast, initBreadcrumbs, showLoader, hideLoader, kenzapdir, getDefaultAppPath, cacheSettings, getKenzapSettings, log } from '../assets/js/helpers.js'
import { AppClusterPicker } from '../assets/js/app-cluster-picker.js'
import { DockerFile } from '../assets/js/app-docker-file.js'
import { DockerApps } from '../assets/js/app-docker-apps.js'
import { AppRegistry } from '../assets/js/app-registry.js'
import { NavigationHeader } from '../assets/js/navigation-header.js'
import { Footer } from '../assets/js/app-footer.js'
import { run_script } from '../assets/js/dev-tools.js'
import { getClusterKubeconfig } from '../assets/js/cluster-kubernetes-helpers.js'
import { AppList } from './app-list.js'
import { Settings } from './app-settings.js'
import { Home } from './home.js'
import slugify from 'slugify'
import fs from "fs"
import * as path from 'path';
import { set } from 'ace-builds/src-noconflict/ace.js';

import "../assets/libs/bootstrap.5.0.2.1.0.min.css"
import "../assets/scss/app.css"

/** 
 * App creation class. Similar to app settings page.
 * Inits configuration components of:
 * Dockerfile, endpoints, data centers, users, app resources.
 *
 * @link 
 * @since 1.0.0
 *
 * @package Kenzap
 */
export class AppCreate {

    constructor(id) {

        global.state.page = "app-create";
        global.state.app = {};

        // load this page
        this.init();
    }

    init() {

        this.settings = getKenzapSettings();

        // set scroll to top
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });

        this.view();

        // data centers
        this.appClusterPicker = new AppClusterPicker(global);
        this.appClusterPicker.init();

        // docker file
        this.dockerFile = new DockerFile(global);
        this.dockerFile.init();

        // docker app selection
        this.dockerApps = new DockerApps(global);
        this.dockerApps.init();

        // app registry
        this.appRegistry = new AppRegistry(global);
        this.appRegistry.init();

        // init header
        this.nav = new NavigationHeader(global);
        this.nav.init();

        // init
        this.footer = new Footer(global);
        this.footer.init();

        // initiate breadcrumbs
        initBreadcrumbs(
            [
                { link: '#home', cb: () => { new Home() }, text: __html('Home') },
                { link: '#apps', cb: () => { new AppList() }, text: __html('Apps') },
                { text: __html('New App') }
            ]
        );

        document.querySelector('#appTitle').focus();

        hideLoader();

        this.listeners();
    }

    view() {

        document.querySelector('body').innerHTML = `
            <navigation-header></navigation-header>
            <div class="container p-edit app-create">
                <div class="d-flex justify-content-between bd-highlight mb-3">
                    <nav class="bc" aria-label="breadcrumb"></nav>
                    <div class="">
                        <a style="margin-right:16px;" class="preview-link nounderline d-none" target="_blank" href="#">${__html('template')}<i class="mdi mdi-monitor"></i></a>
                        <button class="btn btn-primary d-flex align-items-center mt-md-0 mt-2 btn-app-create" type="button">
                            <span class="d-flex" role="status" aria-hidden="true">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle me-2" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                                    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                                </svg>
                            </span>
                            ${__html('Create')}
                        </button>
                    </div>
                </div>
                <div class="row-">
                    <div class="col-lg-12- grid-margin- stretch-card-">
                        <div class="card- border-white- shadow-sm-">
                            <div class="card-body- p-0">
                                <div class="px-2- mt-2">
                                    <h4 class="card-title app-title">${__html('New App')}</h4>
                                    <p class="form-text">
                                        ${__html('Define <a href="#">core</a> app settings.')}
                                        <pre id="console-output" class="console-output form-text"></pre>
                                    </p>
                                    <div class="col-sm-7">
                                        <div class="mb-3 row">
                                            <label for="appTitle" class="col-sm-3 col-form-label">${__html('Title')}</label>
                                            <div class="col-sm-9">
                                                <input type="text" class="form-control" id="appTitle" value="" >
                                                <p class="form-text">${__html('Unique app title.')}</p>
                                            </div>
                                        </div>
                                        <div class="mb-3 row ${this.settings.projects.length > 1 ? "" : "d-none"}">
                                            <label for="appProject" class="col-sm-3 col-form-label">${__html('Project')}</label>
                                            <div class="col-sm-9">
                                                <select id="appProject" class="form-select project-select form-select-lg- mb-0" aria-label="Large select example" style="width:100%;">
                                                    ${this.settings.projects.map((p, i) => {

            return `<option ${p.id == global.state.project ? 'selected' : ''} value="${attr(p.id)}">${html(p.project)}</option>`

        }).join('')
            }
                                                </select>
                                                <p class="form-text">${__html('Assign app to a project.')}</p>
                                            </div>
                                        </div>
                                        <div class="mb-3 row d-none">
                                            <label for="appKeywords" class="col-sm-3 col-form-label">${__html('Keywords')}</label>
                                            <div class="col-sm-9">
                                                <input type="text" class="form-control" id="appKeywords" value="">
                                                <p class="form-text">${__html('Help users find your app if published to the marketplace.')}</p>
                                            </div>
                                        </div>
                                        <div class="mb-3 row">
                                            <label for="appDescription" class="col-sm-3 col-form-label">${__html('Description')}</label>
                                            <div class="col-sm-9">
                                                <input type="text" class="form-control" id="appDescription" value="">
                                                <p class="form-text">${__html('Short description of app features.')}</p>
                                            </div>
                                        </div>
                                        <div class="mb-3 row">
                                            <label for="appPath" class="col-sm-3 col-form-label">${__html('Local path')}</label>
                                            <div class="col-sm-9">
                                                <input type="text" class="form-control bg-white" id="appPath" value="" readonly>
                                                <p class="form-text">${__html('Local directory to keep app files.')}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <app-cluster-picker></app-cluster-picker>
                                    <app-registry></app-registry>
                                    <docker-apps></docker-apps>
                                    <docker-file></docker-file>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    
            <app-footer></app-footer>
        `;
    }

    listeners() {

        let refreshPath = (title) => {

            if (!getDefaultAppPath()) return;

            document.querySelector('#appPath').value = path.join(kenzapdir, slugify(title).toLowerCase());

            document.querySelector('.app-title').innerHTML = title;
        }

        document.querySelector('#appTitle').addEventListener('change', e => { refreshPath(e.currentTarget.value); });

        document.querySelector('#appTitle').addEventListener('keyup', e => { refreshPath(e.currentTarget.value); });

        // path picker
        document.querySelector('#appPath').addEventListener('click', e => {

            e.preventDefault();

            ipcRenderer.invoke("pick-folder", []).then(returnValue => {

                if (!returnValue.filePath) return;

                let pathArr = returnValue.filePath.split('/');
                pathArr.pop();
                let path = pathArr.join('/');

                document.querySelector("#appPath").value = path;

                // this.console(returnValue.filePath);
            });
        });

        // create app
        document.querySelector('.btn-app-create').addEventListener('click', e => {

            e.preventDefault();

            // validate data
            let data = {};
            data.title = document.querySelector("#appTitle").value.trim();
            data.project = document.querySelector('#appProject').value,
                data.slug = slugify(data.title.toLowerCase());
            data.id = data.slug;
            data.path = document.querySelector("#appPath").value.trim();
            data.description = document.querySelector("#appDescription").value.trim();
            data.keywords = document.querySelector("#appKeywords").value.trim();
            data.registry = this.appRegistry.get();
            data.app = this.dockerApps.get();
            data.app.dockerfile = this.dockerFile.get();

            data.status = "0";
            data.img = [];
            data.cats = [];
            data.new = true;
            data.clusters = this.appClusterPicker.get();

            // validate
            if (data.title.length < 4) { alert(__html('Please provide longer title')); return; }
            if (data.path.length < 4) { alert(__html('Please provide valid app path')); return; }
            if (data.clusters.length == 0) { alert(__html('Please select your cluster')); return; }
            if (!data.app.dockerfile) { alert(__html('Please define Dockerfile')); return; }

            // create app folder if not exists
            if (!fs.existsSync(data.path)) { fs.mkdirSync(data.path); }

            // show loading
            // showLoader();

            // cacheSettings(data); return;

            if (this.loading) return;

            this.setLoading(true);

            // create app in cluster
            this.provisionClusterApp(data.clusters[0], data);
        });
    }

    provisionClusterApp(id, data) {

        log('Provisioning cluster app: ', id, data);

        document.querySelector('.console-output').innerHTML = "";

        let kubeconfig = getClusterKubeconfig(id);

        let step1 = () => {

            // clear namespace
            log(`cd ${data.path}; kubectl delete all --all -n ${data.slug} --kubeconfig=${kubeconfig}`);
            run_script(`cd ${data.path}; kubectl delete all --all -n ${data.slug} --kubeconfig=${kubeconfig}`, [], () => { this.console(`Removing previous resources in ${data.slug} namespace`); step2(); }, 0, (error) => { log('Cluster 1 E: ', error.toString()); });
        }

        let step2 = () => {

            // clear namespace
            run_script(`cd ${data.path}; kubectl delete namespace ${data.slug} --kubeconfig=${kubeconfig}`, [], () => { this.console(`Removing ${data.slug} namespace`); step3(); }, 0, (error) => { log('Cluster 2 E: ', error.toString()); step3(); });
        }

        let step3 = () => {

            // force delete namespace and all resources
            log(`kubectl get namespace "${data.slug}" --kubeconfig=${kubeconfig} -o json | tr -d "\n" | sed "s/\"finalizers\": \[[^]]\+\]/\"finalizers\": []/" | kubectl replace --kubeconfig=${kubeconfig} --raw /api/v1/namespaces/${data.slug}/finalize -f -`);
            run_script(`cd ${data.path}; kubectl get namespace "${data.slug}" --kubeconfig=${kubeconfig} -o json | tr -d "\n" | sed "s/\"finalizers\": \[[^]]\+\]/\"finalizers\": []/" | kubectl replace --kubeconfig=${kubeconfig} --raw /api/v1/namespaces/${data.slug}/finalize -f -`, [], () => { step4(); this.console('Namespace force removed'); }, 0, (error) => { step4(); log('Cluster 3 E: ', error.toString()); });
        }

        let step4 = () => {

            log('step4');

            // CertificateSigningRequest
            log(`kubectl delete CertificateSigningRequest ${data.slug} --kubeconfig=${kubeconfig}`);
            run_script(`kubectl delete CertificateSigningRequest ${data.slug} --kubeconfig=${kubeconfig}`, [], () => { this.console('Clearing previous certificate signing requests'); step5(); }, 1, (error) => { step5(); });
        }

        let step5 = () => {

            log('step5');

            // create namespace
            log(`cd ${data.path}; kubectl create namespace ${data.slug} --kubeconfig=${kubeconfig}`);
            run_script(`cd ${data.path}; kubectl create namespace ${data.slug} --kubeconfig=${kubeconfig}`, [], () => { this.console(`Creating ${data.slug} namespace`); this.provisionClusterUser(id, data); }, 1, (error) => { log('Cluster 5 E: ', error.toString()); this.provisionClusterUser(id, data); });
        }

        step1();
    }

    /**
     * Provisions a cluster user by performing a series of steps including cleanup, certificate creation, 
     * user role binding, certificate approval, and exporting the certificate.
     *
     * @param {Object} data - The data required for provisioning the cluster user.
     * @param {string} data.path - The path where the user data and certificates will be stored.
     * @param {string} data.slug - The unique identifier for the user.
     * @param {string} data.certData - The base64 encoded certificate data (output).
     * @param {string} data.keyData - The base64 encoded key data (output).
     */
    provisionClusterUser(id, data) {

        let kubeconfig = getClusterKubeconfig(id);

        log("kubeconfig file: ", kubeconfig);

        let step1 = () => {

            // cleanup
            run_script(`cd ${data.path}; rm -Rf ${data.slug}.crt; rm -Rf ${data.slug}.key; rm -Rf ${data.slug}.csr; rm -Rf ${data.slug}-user-role-binding.yaml; rm -Rf ${data.slug}-user-roles.yaml; rm -Rf ${data.slug}-csr.yaml; rm -Rf ${data.slug}-network-policy.yaml;`, [], () => { this.console('Removing old certificate'); step2() });
        }

        let step2 = () => {

            // create new certificates
            log(`openssl genrsa -out ${data.slug}.key 2048; openssl req -new -key ${data.slug}.key -out ${data.slug}.csr -subj "/CN=${data.slug}"; cat ${data.slug}.csr | base64 | tr -d "\n" `);
            run_script(`cd ${data.path}; openssl genrsa -out ${data.slug}.key 2048; openssl req -new -key ${data.slug}.key -out ${data.slug}.csr -subj "/CN=${data.slug}"; cat ${data.slug}.csr | base64 | tr -d "\n" `, [], () => { this.console('Creting new certificate'); }, 0, (error) => { log('User 2 E: ', error.toString()) }, (response) => { log('User 2 R: ' + response.toString()); setTimeout(() => { step3(response.toString()) }, 1500); });
        }

        let step3 = (response) => {

            // create user role binding
            let certRequest = fs.readFileSync(path.join(__dirname, "../assets/templates/sh/cert_request.yaml")).toString();

            // this.console(certRequest);

            certRequest = certRequest.replace(/kenzap-app-slug-request/g, response);
            certRequest = certRequest.replace(/kenzap-app-slug/g, data.slug);
            fs.writeFileSync(path.join(data.path, `${data.slug}-csr.yaml`), certRequest);

            // kubectl create -f php-test-csr.yaml --kubeconfig=../.kenzap/kubeconfig-GJDmHH.yaml
            log(`kubectl create -f ${data.slug}-csr.yaml --kubeconfig=${kubeconfig}`);
            run_script(`cd ${data.path}; kubectl create -f ${data.slug}-csr.yaml --kubeconfig=${kubeconfig}`, [], () => { this.console('Creating certificate signing request'); step4() });
        }

        let step4 = () => {

            // certificate auto approve | kubectl certificate approve php-test --kubeconfig=../.kenzap/kubeconfig-GJDmHH.yaml
            log(`cd ${data.path}; kubectl certificate approve ${data.slug} --kubeconfig=${kubeconfig}`);
            run_script(`cd ${data.path}; kubectl certificate approve ${data.slug} --kubeconfig=${kubeconfig}`, [], () => { this.console('Approving certificate'); setTimeout(() => { step5(); }, 100); });
        }

        let step5 = () => {

            // certificate export | kubectl get csr php-test --kubeconfig=../.kenzap/kubeconfig-GJDmHH.yaml -o jsonpath='{.status.certificate}' | base64 -d > php-test.crt
            log(`kubectl get csr ${data.slug} --kubeconfig=${kubeconfig} -o jsonpath='{.status.certificate}' | base64 -d > ${data.slug}.crt`);
            run_script(`cd ${data.path}; kubectl get csr ${data.slug} --kubeconfig=${kubeconfig} -o jsonpath='{.status.certificate}' | base64 -d > ${data.slug}.crt`, [], () => { this.console('User 5: certificate exported'); step6(); });
        }

        let step6 = () => {

            // kubectl get csr --kubeconfig=../.kenzap/kubeconfig-GJDmHH.yaml
            log(`kubectl get csr --kubeconfig=${kubeconfig}`);
            run_script(`cd ${data.path}; kubectl get csr --kubeconfig=${kubeconfig}`, [], () => { this.console('Retrieving certificate signing request'); step8(); });
        }

        let step7 = () => {

        }

        let step8 = () => {

            data.certData = fs.readFileSync(path.join(data.path, `${data.slug}.crt`)).toString('base64').replace(/\n/g, '');
            data.keyData = fs.readFileSync(path.join(data.path, `${data.slug}.key`)).toString('base64').replace(/\n/g, '');

            // create user role binding
            let userRolesTemplate = fs.readFileSync(path.join(__dirname, '../assets/templates/sh/user-roles.yaml'), 'utf8');
            userRolesTemplate = userRolesTemplate.replace(/kenzap-slug/g, data.slug);
            userRolesTemplate = userRolesTemplate.replace(/kenzap-namespace/g, data.slug);
            fs.writeFileSync(path.join(data.path, `${data.slug}-user-roles.yaml`), userRolesTemplate);
            run_script(`cd ${data.path}; kubectl create -f ${data.slug}-user-roles.yaml --kubeconfig=${kubeconfig}`, [], () => { this.console('Creating user roles'); step9(); });
        }

        let step9 = () => {

            let userRoleBindingTemplate = fs.readFileSync(path.join(__dirname, '../assets/templates/sh/user-role-binding.yaml'), 'utf8');
            userRoleBindingTemplate = userRoleBindingTemplate.replace(/kenzap-slug/g, data.slug);
            userRoleBindingTemplate = userRoleBindingTemplate.replace(/kenzap-namespace/g, data.slug);
            fs.writeFileSync(path.join(data.path, `${data.slug}-user-role-binding.yaml`), userRoleBindingTemplate);
            run_script(`cd ${data.path}; kubectl create -f ${data.slug}-user-role-binding.yaml --kubeconfig=${kubeconfig}`, [], () => { this.console('Creating user role binding'); finalize(); });
        }

        let finalize = () => {

            this.setLoading(false);

            this.createLocalApp(id, data);

            toast(__html('Application created'));
        }

        step1();
    }

    createLocalApp(id, data) {

        let settings = getKenzapSettings();

        // get cluster
        let cluster = settings.clusters.find(cluster => cluster.id == id);

        // this.console(cluster);

        // get cert data
        data.certData = fs.readFileSync(path.join(data.path, `${data.slug}.crt`)).toString('base64').replace(/\n/g, '');
        data.keyData = fs.readFileSync(path.join(data.path, `${data.slug}.key`)).toString('base64').replace(/\n/g, '');

        // kubeconfig.yaml
        let kubeconfig = fs.readFileSync(path.join(__dirname, "../assets/templates/app/kubeconfig-template.yaml"), 'utf8');
        kubeconfig = kubeconfig.replace(/template_namespace/g, data.slug);
        kubeconfig = kubeconfig.replace(/template_cluster/g, "https://" + cluster.servers[0].server + ":16443");
        kubeconfig = kubeconfig.replace(/template_user/g, `${data.slug}-${data.registry.user}`);
        kubeconfig = kubeconfig.replace(/template_name/g, data.slug);
        kubeconfig = kubeconfig.replace(/template_certdata/g, data.certData);
        kubeconfig = kubeconfig.replace(/template_keydata/g, data.keyData);
        fs.writeFileSync(path.join(data.path, `kubeconfig-${id}.yaml`), kubeconfig);

        // app.yaml
        let app = fs.readFileSync(path.join(__dirname, "../assets/templates/app/app.yaml"), 'utf8');
        app = app.replace(/template_username/g, data.registry.user);
        app = app.replace(/template_slug/g, data.slug);
        app = app.replace(/template_registry/g, `${data.registry.domain}/v2`);
        fs.writeFileSync(path.join(data.path, 'app.yaml'), app);

        // devspace.yaml
        let devspace = fs.readFileSync(path.join(__dirname, "../assets/templates/app/devspace.yaml"), 'utf8');
        devspace = devspace.replace(/template_username/g, data.registry.user);
        devspace = devspace.replace(/template_password/g, data.registry.pass);
        devspace = devspace.replace(/template_registry/g, `${data.registry.domain}/v2`);
        devspace = devspace.replace(/template_slug/g, data.slug);
        fs.writeFileSync(path.join(data.path, 'devspace.yaml'), devspace);

        // endpoints.yaml
        let endpoints = fs.readFileSync(path.join(__dirname, "../assets/templates/app/endpoints.yaml"), 'utf8');
        endpoints = endpoints.replace(/template_namespace/g, data.slug);
        endpoints = endpoints.replace(/template_endpoint/g, data.slug + ".endpoint-" + settings.id + ".kenzap.cloud");
        fs.writeFileSync(path.join(data.path, 'endpoints.yaml'), endpoints);

        // .gitignore
        let gitignore = fs.readFileSync(path.join(__dirname, "../assets/templates/app/.gitignore"), 'utf8');
        fs.writeFileSync(path.join(data.path, '.gitignore'), gitignore);

        // Dockerfile
        fs.writeFileSync(path.join(data.path, 'Dockerfile'), data.app.dockerfile);

        // _
        const sourceDir = path.join(__dirname, '../assets/templates/app/_');
        const targetDir = path.join(data.path, '_');

        const copyFolderRecursiveSync = (source, target) => {
            if (!fs.existsSync(target)) {
                fs.mkdirSync(target);
            }

            if (fs.lstatSync(source).isDirectory()) {
                const files = fs.readdirSync(source);
                files.forEach(file => {
                    const curSource = path.join(source, file);
                    const curTarget = path.join(target, file);
                    if (fs.lstatSync(curSource).isDirectory()) {
                        copyFolderRecursiveSync(curSource, curTarget);
                    } else {
                        fs.copyFileSync(curSource, curTarget);
                    }
                });
            }
        };

        copyFolderRecursiveSync(sourceDir, targetDir);

        hideLoader();

        cacheSettings(data);

        if (!global.state.dev[data.id]) global.state.dev[data.id] = { status: "stop", edgeStatus: "d-none" }

        this.console(`App created in ${data.path}`);

        // apply endpoints
        setTimeout(() => { run_script('cd ' + data.path + ' && kubectl apply -f endpoints.yaml --kubeconfig=kubeconfig-' + cluster.id + '.yaml', [], () => { }); }, 2000);

        // clean up
        setTimeout(() => { run_script(`cd ${data.path}; rm -Rf ${data.slug}.crt; rm -Rf ${data.slug}.key; rm -Rf ${data.slug}.csr; rm -Rf ${data.slug}-user-roles.yaml; rm -Rf ${data.slug}-user-role-binding.yaml; rm -Rf ${data.slug}-csr.yaml; rm -Rf ${data.slug}-network-policy.yaml;`, [], () => { this.console('Cleaning up'); }); }, 20000);

        // load app settings page
        setTimeout(() => { new Settings(data.slug); }, 2000);
    }

    setLoading(state) {

        if (state) {

            document.querySelector('.btn-app-create').innerHTML = `
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                ${__html('Creating...')}
            `;

            this.loading = true;

        } else {

            document.querySelector('.btn-app-create').innerHTML = `
                <span class="d-flex" role="status" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle me-2" viewBox="0 0 16 16">
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                    </svg>
                </span>`;

            this.loading = false;

            hideLoader();
        }
    }

    console(...args) {

        let data = args.join('<br>');

        document.querySelector('.console-output').innerHTML = data;
    }
}