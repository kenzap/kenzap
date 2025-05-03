
import global from "./global.js"
import { shell } from 'electron' // deconstructing assignment
import { __html, attr, onClick, simulateClick, getSetting, toast, kenzapdir, showLoader, hideLoader, parseError, log } from './helpers.js'
import child_process from "child_process"
import terminate from "terminate"
import fs from "fs"
import yaml from 'js-yaml';
import { AppList } from "../../renderer/app-list.js"
import { Home } from "../../renderer/home.js"
import { getAppKubeconfig } from './app-status-helpers.js'
import { getClusterKubeconfig } from './cluster-kubernetes-helpers.js'
import { run_script, getMinukubePath } from './dev-tools.js'
import { warning } from './warnings.js'
import { Client as ssh } from 'ssh2';
import * as os from 'os';
import * as path from 'path';
import { set } from "ace-builds/src-noconflict/ace.js"
const { exec, execSync } = require('child_process');

/**
 * Verify if the following dependencies are working on the host machiene
 * - docker desktop
 * - devspace
 * - kubectl
 * 
 * Block UI in case they are not
 * 
 * @name checkEnvironment
 * @return {Object} status - callback function
 * /Users/pavellukasenko/Extensions/kenzap/node_modules/.bin:/Users/pavellukasenko/Extensions/node_modules/.bin:/Users/pavellukasenko/node_modules/.bin:/Users/node_modules/.bin:/node_modules/.bin:/Users/pavellukasenko/.nvm/versions/node/v19.9.0/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/Users/pavellukasenko/.nvm/versions/node/v19.9.0/bin:/opt/homebrew/opt/ruby/bin:/Users/pavellukasenko/opt/anaconda3/bin:/opt/local/bin:/opt/local/sbin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Library/Apple/usr/bin:/usr/local/MacGPG2/bin:/usr/local/share/dotnet:~/.dotnet/tools:/Library/Frameworks/Mono.framework/Versions/Current/Commands
 * /usr/bin:/bin:/usr/sbin:/sbin
 */
export function checkEnvironment() {

    log('Arch OS: ' + os.arch() + ' OS: ' + os.platform());

    // log('Checking environment...');

    // log(process.env.PATH);

    if (!global.state.installation) { global.state.installation = { c: 0, allow: true, installing: false, svc: [], timeout: null, attempts: { kubectl: 0, devspace: 0, docker: 0, minikube: 0, total: 0 } }; }

    const lastRun = global.state.lastRun || 0;
    const now = Date.now();

    if (now - lastRun < 10000) {
        // log('Script execution blocked: Please wait at least 1 minute between runs.');
        if (global.state.installation.c < 3) {

            if (global.state.installation.timeout) clearTimeout(global.state.installation.timeout)
            global.state.installation.timeout = setTimeout(() => { checkEnvironment(); }, 500);
        }
        return;
    }

    global.state.lastRun = now;

    if (!fs.existsSync(kenzapdir)) {
        try {
            fs.mkdirSync(kenzapdir);
        } catch (e) {
            parseError(e);
        }
    }

    if (!fs.existsSync(kenzapdir)) {
        callback_response("can not create home directory");
    }

    const requiredCommands = {
        // docker: ['docker --version', 'Docker', 'https://docs.docker.com/desktop/install/mac-install/', 'Please launch Docker Desktop'],
        docker: ['docker stats --no-stream', 'Docker', 'https://docs.docker.com/desktop/install/mac-install/', 'Please launch Docker Desktop'],
        brew: ['brew --version', 'Homebrew', 'https://brew.sh/', 'Installing Homebrew..'],
        devspace: ['devspace --version', 'DevSpace', 'https://www.devspace.sh/docs/getting-started/installation?x0=3', 'Installing DevSpace CLI..'],
        kubectl: ['kubectl version --client', 'Kubernetes CLI', 'https://kubernetes.io/docs/tasks/tools/', 'Installing Kubernetes CLI..'],
        minikube: ['minikube version', 'Minikube CLI', 'https://minikube.sigs.k8s.io/docs/start/?arch=%2Fmacos%2Farm64%2Fstable%2Fbinary+download', 'Installing Minikube CLI..'],
        minikube_status: ['minikube status', 'Minikube', 'https://minikube.sigs.k8s.io/docs/start/?arch=%2Fmacos%2Farm64%2Fstable%2Fbinary+download', 'Waiting for Minikube to start..'],
        minikube_tunnel: ['pgrep -f "minikube tunnel"', 'Minikube Tunnel', 'https://minikube.sigs.k8s.io/docs/start/?arch=%2Fmacos%2Farm64%2Fstable%2Fbinary+download', 'Waiting for Minikube Tunnel to start..'],
    };

    const missing = [];

    global.state.installation.svc = [];

    for (const [cmd, [test, name, link, note]] of Object.entries(requiredCommands)) {
        try {
            // console.log('Check: ' + test);
            const output = execSync(test, { encoding: 'utf-8' });
            if (output.includes('not found') || output.includes('command not found') || output.includes('not recognized as an internal or external command') || output.length == 0) {
                missing.push(name);
                global.state.installation.allow = false;
                global.state.installation.svc.push({ name: name, link: link, note: note });
                global.state.installation.c += 1;
                // console.log('Command Output: ' + output);
                // console.log('Missing: ' + name);
            }

        } catch (e) {
            // console.log('Error C: ' + e);
            missing.push(name);
            global.state.installation.allow = false;
            global.state.installation.svc.push({ name: name, link: link, note: note });
            global.state.installation.c += 1;
        }
    }

    // showWarning();
    console.log('missing: ', missing);
    // return;

    if (missing.length > 0) {

        setTimeout(() => { blockUI() }, 1000);

        // log('Installing missing dependencies: ' + missing.join(', '));
        missing.forEach(dep => {

            switch (dep) {
                case 'Docker':
                    log('Waiting for Docker...');
                    // Add Docker installation logic here
                    break;
                case 'Homebrew':
                    log('Installing Homebrew...');
                    installHomebrew(installCallback);
                    break;
                case 'DevSpace':
                    log('Installing DevSpace...');
                    installDevSpace(installCallback);
                    break;
                case 'Kubernetes CLI':
                    log('Installing kubectl...');
                    installKubectl(installCallback);
                    break;
                case 'Minikube CLI':
                    log('Installing Minikube...');
                    installMinikube(installCallback);
                    break;
                case 'Minikube':
                    log('Launching Minikube...');
                    installMinikubeDeps(installCallback);
                    break;
                case 'Minikube Tunnel':
                    log('Launching Minikube Tunnel...');
                    launchMinikubeTunnel(installCallback);
                    break;
                default:
                    log(`No installation logic defined for ${dep}`);
            }
        });
    } else {

        log('All dependencies are installed.');
        global.state.installation.installing = false;
        global.state.installation.allow = true;
        global.state.installation.svc = [];
        global.state.installation.c = 0;

        if (document.querySelector('.block-ui')) new Home();
    }
}

function installCallback(data) {

    if (global.state.installation.timeout) clearTimeout(global.state.installation.timeout)

    global.state.installation.timeout = setTimeout(() => { checkEnvironment(); }, 1000);

    if (!data) return;

    log(data)
}

function installKubectl(installCallback) {
    try {
        if (os.platform() === 'win32') {
            log('choco install kubernetes-cli');
            execSync('choco install kubernetes-cli', { stdio: 'inherit' });
        } else if (os.platform() === 'darwin') {
            log('brew install kubectl');
            execSync('brew install kubectl', { stdio: 'inherit' });
        } else if (os.platform() === 'linux') {
            log('kubectl install linux');
            execSync('curl -LO "https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl" && chmod +x ./kubectl && sudo mv ./kubectl /usr/local/bin/kubectl', { stdio: 'inherit' });
        }
        installCallback(null);
    } catch (error) {
        installCallback(error);
    }
}

function installDevSpace(installCallback) {
    try {
        if (os.platform() === 'win32') {
            execSync('choco install devspace', { stdio: 'inherit' });
        } else if (os.platform() === 'darwin') {
            execSync('brew install devspace', { stdio: 'inherit' });
        } else if (os.platform() === 'linux' && os.arch() === 'x64') {
            execSync('curl -L -o devspace "https://github.com/loft-sh/devspace/releases/latest/download/devspace-linux-amd64" && sudo install -c -m 0755 devspace /usr/local/bin', { stdio: 'inherit' });
        } else if (os.platform() === 'linux' && os.arch() === 'arm64') {
            execSync('curl -L -o devspace "https://github.com/loft-sh/devspace/releases/latest/download/devspace-linux-arm64" && sudo install -c -m 0755 devspace /usr/local/bin', { stdio: 'inherit' });
        }
        installCallback(null);
    } catch (error) {
        installCallback(error);
    }
}

function installHomebrew(installCallback) {
    execSync('curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | bash', (error, stdout, stderr) => {
        if (error) {
            installCallback(error)
            log(`Error installing Homebrew: ${stderr}`);
        } else {
            log('Homebrew installed successfully.');
        }
    });
}

function installMinikube(installCallback) {
    log('installMinikube on ' + os.platform() + ' ' + os.arch());
    if (os.platform() === 'win32') {
        execSync('choco install minikube', (error, stdout, stderr) => { installCallback(error ? stderr : stdout); });
    } else if (os.platform() === 'darwin') {
        log('brew install minikube');
        execSync('brew install minikube', (error, stdout, stderr) => { installCallback(error ? stderr : stdout); });
    } else if (os.platform() === 'linux' && os.arch() === 'x64') {
        execSync('curl -LO https://github.com/kubernetes/minikube/releases/latest/download/minikube-linux-amd64 && sudo install minikube-linux-amd64 /usr/local/bin/minikube && rm minikube-linux-amd64', (error, stdout, stderr) => { installCallback(error ? stderr : stdout); });
    } else if (os.platform() === 'linux' && os.arch() === 'arm64') {
        execSync('curl -LO https://github.com/kubernetes/minikube/releases/latest/download/minikube-linux-arm64 && sudo install minikube-linux-arm64 /usr/local/bin/minikube && rm minikube-linux-arm64', (error, stdout, stderr) => { installCallback(error ? stderr : stdout); });
    }
    installMinikubeDeps(installCallback);
}

function installMinikubeDeps(installCallback) {
    exec(`${getMinukubePath()} status`, (error, stdout, stderr) => {
        if (stdout.includes('host: Running') && stdout.includes('kubelet: Running') && stdout.includes('apiserver: Running')) {

            log('Minikube is already running.');

            // minikube make sure essential addons are enabled
            exec('minikube addons list -o json', (error, stdout, stderr) => {
                // log('addons list: ' + stdout);
                try {
                    const addons = JSON.parse(stdout);
                    const requiredAddons = ['dashboard', 'registry', 'ingress', 'ingress-dns'];
                    const missingAddons = requiredAddons.filter(addon => addons[addon].Status !== 'enabled');
                    // console.log(addons);
                    missingAddons.forEach(addon => {
                        log(`Enabling addon: ${addon}`);
                        exec(`minikube addons enable ${addon}`, (error, stdout, stderr) => {
                            if (error) {
                                log(`Error enabling addon ${addon}: ${error}`);
                            } else {
                                log(`Addon ${addon} enabled successfully.`);
                            }
                        });
                    });

                } catch (parseError) {
                    log('Error parsing addons list: ' + parseError);
                }
            });

        } else {
            log('Starting Minikube...');
            exec(`${getMinukubePath()} start`, { shell: true }, (err, out, errOut) => {
                if (err) {

                    if (errOut.includes('RSRC_DOCKER_STORAGE')) warning('RSRC_DOCKER_STORAGE', errOut)

                    log('Error starting Minikube: ' + errOut);
                } else {

                    log('Minikube started successfully.');

                    // start minikube tunnel
                    launchMinikubeTunnel(installCallback);
                }
            });
        }
    });
}

function launchMinikubeTunnel(installCallback) {

    exec('pgrep -f "minikube tunnel"', { shell: true }, (error, stdout, stderr) => {
        if (!stdout) {
            log('Starting minikube tunnel...');
            // TODO - check for windows and linux
            exec(`osascript -e 'do shell script "minikube tunnel" with administrator privileges'`,
                { shell: true },
                (error, stdout, stderr) => {
                    log('Minikube out: ' + stdout)
                    if (error) {
                        log('Error starting minikube tunnel: ' + error);

                        installCallback(error);
                    } else {
                        log('Minikube tunnel started successfully.');
                    }
                });
        } else {
            log('Minikube tunnel is already running.');
        }
    });
}

function blockUI() {

    global.state.ui = false;
    document.querySelector('body').innerHTML = `
        <div class="container">
            <div class="app-warnings p-edit"></div>
        </div>
        <nav class="navbar navbar-expand-md navbar-light fixed-top bg-white shadow-sm block-ui">
            <div class="container">
                <div class="d-flex align-items-center">
                    <a class="navbar-brand nav-back d-flex align-items-center me-sm-2 me-1" href="https://dashboard.kenzap.cloud">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#212529" class="bi bi-arrow-left me-2 d-none" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"></path>
                        </svg>
                        <img style="max-height: 23px;" src="https://cdn.kenzap.com/logo.svg" alt="kenzap logo">
                    </a>
                    <div class="ms-sm-2 ms-0 dropdown d-none">
                        <button class="btn btn-sm btn-outline-secondary dropdown-toggle border-0 h-space" type="button" id="spaceSelect" data-bs-toggle="dropdown" aria-expanded="false" data-id="1000000"></button>
                        <ul class="dropdown-menu spaceSelectList" aria-labelledby="spaceSelect">
                            <li><hr class="dropdown-divider"></li>
                            <li><a data-id="manage" class="spw dropdown-item" href="#">Manage</a></li>
                        </ul>
                    </div>
                </div>
                <div class="d-flex flex-column align-items-end" id="navbarCollapse">
                    <ul class="navbar-nav me-auto mb-0 mb-md-0">
                        <li class="nav-item dropdown">
                            <a class="" href="https://account.kenzap.com/profile/" id="nav-account" data-bs-toggle="dropdown" aria-expanded="false">
                                <img src="https://account.kenzap.com/images/default_avatar.jpg" style="height:40px;width:40px;border-radius:50%;" alt="profile">
                            </a>
                            <ul class="dropdown-menu dropdown-menu-end" data-popper-placement="left-start" aria-labelledby="nav-account" style="position: absolute;">
                                <li><a class="dropdown-item open-dashboard" href="https://dashboard.kenzap.cloud/">${__html('Dashboard')}</a></li>
                                <li><a class="dropdown-item open-profile" href="https://account.kenzap.cloud/profile/">${__html('My profile')}</a></li>
                                <li><a class="dropdown-item choose-lang d-none" href="#">Language</a></li>
                                <li><a class="dropdown-item open-auth" href="https://auth.kenzap.com">Sign in</a></li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
        <div>
            ${placeholder()}
        </div>
        <div class="container mt-3">
            <h2>${__html('Please Wait')}</h2>
            <p>${__html('Checking dependencies')}</p>
            <ul>
                ${global.state.installation.svc.map(s => `<li class="open-dep-link po" data-link="${attr(s.link)}"><a href='#'>${s.name}</a> ${s.note.length ? " - " + s.note + "" : ""}</li>`).join('')}
            </ul>
            <div class="row" style="height:50%; display:block; margin:0px auto 0 auto;">
                <button type="button" class="btn btn-primary btn-lg btn-refresh position-absolute" style="width:90%;bottom:32px;margin-left: auto;margin-right: auto;left: 0;right: 0;text-align: center;">
                    ${__html("Refresh")}
                </button>
            </div>
        </div>
    `;

    onClick(".open-dep-link", e => {
        e.preventDefault();
        require('electron').shell.openExternal(e.currentTarget.dataset.link);
    });

    onClick(".btn-refresh", e => {
        e.preventDefault();
        checkEnvironment();
        // new AppList();
    });
}

// function showWarning() {
//     global.state.ui = false;
//     document.querySelector('body').innerHTML = `
//         <nav class="navbar navbar-expand-md navbar-light fixed-top bg-white shadow-sm">
//             <div class="container">
//                 <div class="d-flex align-items-center">
//                     <a class="navbar-brand nav-back d-flex align-items-center me-sm-2 me-1" href="https://dashboard.kenzap.cloud">
//                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#212529" class="bi bi-arrow-left me-2 d-none" viewBox="0 0 16 16">
//                             <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"></path>
//                         </svg>
//                         <img style="max-height: 23px;" src="https://cdn.kenzap.com/logo.svg" alt="kenzap logo">
//                     </a>
//                     <div class="ms-sm-2 ms-0 dropdown d-none">
//                         <button class="btn btn-sm btn-outline-secondary dropdown-toggle border-0 h-space" type="button" id="spaceSelect" data-bs-toggle="dropdown" aria-expanded="false" data-id="1000000">K-Space</button>
//                         <ul class="dropdown-menu spaceSelectList" aria-labelledby="spaceSelect">
//                             <li><hr class="dropdown-divider"></li>
//                             <li><a data-id="manage" class="spw dropdown-item" href="#">Manage</a></li>
//                         </ul>
//                     </div>
//                 </div>
//                 <div class="d-flex flex-column align-items-end" id="navbarCollapse">
//                     <ul class="navbar-nav me-auto mb-0 mb-md-0">
//                         <li class="nav-item dropdown">
//                             <a class="" href="https://account.kenzap.com/profile/" id="nav-account" data-bs-toggle="dropdown" aria-expanded="false">
//                                 <img src="https://account.kenzap.com/images/default_avatar.jpg" style="height:40px;width:40px;border-radius:50%;" alt="profile">
//                             </a>
//                             <ul class="dropdown-menu dropdown-menu-end" data-popper-placement="left-start" aria-labelledby="nav-account" style="position: absolute;">
//                                 <li><a class="dropdown-item open-dashboard" href="https://dashboard.kenzap.cloud/">${__html('Dashboard')}</a></li>
//                                 <li><a class="dropdown-item open-profile" href="https://account.kenzap.cloud/profile/">${__html('My profile')}</a></li>
//                                 <li><a class="dropdown-item choose-lang d-none" href="#">Language</a></li>
//                                 <li><a class="dropdown-item open-auth" href="https://auth.kenzap.com">Sign in</a></li>
//                             </ul>
//                         </li>
//                     </ul>
//                 </div>
//             </div>
//         </nav>
//         <div>
//             ${placeholder()}
//         </div>
//         <div class="container mt-3">
//             <h2>${__html('Hey!')}</h2>
//             <p>${__html('Please make sure the following dependencies are running:')}</p>
//             <ul>
//                 ${global.state.installation.svc.map(s => `<li class="open-dep-link po" data-link="${attr(s.link)}">${s.name}</li>`).join('')}
//             </ul>
//             <div class="row" style="height:50%; display:block; margin:0px auto 0 auto;">
//                 <button type="button" class="btn btn-primary btn-lg btn-refresh position-absolute" style="width:90%;bottom:32px;margin-left: auto;margin-right: auto;left: 0;right: 0;text-align: center;">
//                     ${__html("Refresh")}
//                 </button>
//             </div>
//         </div>
//     `;
// }

/**
 * Placeholder for the UI
 * 
 * @name placeholder
 * @return {String} html - html string
 */

export function placeholder() {

    return `
        <svg id="intro" viewBox="0 0 1759.3896 626.55573">
            <g id="layer1" transform="translate(331.2 -208.67)">
                <ellipse id="path6270" rx="47.854" ry="47.586" cy="722.65" cx="443.75" fill="#1941df"></ellipse>
                <rect id="rect6272" height="84.618" width="5.8452" y="745.99" x="441.3" fill="#696969"></rect>
                <g id="wheel1" transform="matrix(1.28512,0.13507,-0.13507,1.28512,-28.60192960565648,-266.59613310364557)" data-svg-origin="610.3550567626953 595.5170227050781" style="z-index: 0; transform-origin: 0px 0px;">
                    <g stroke="#000000">
                        <path id="wheel" style="color-rendering:auto;text-decoration-color:#000000;color:#000000;isolation:auto;mix-blend-mode:normal;shape-rendering:auto;solid-color:#000000;block-progression:tb;text-decoration-line:none;image-rendering:auto;white-space:normal;text-indent:0;text-transform:none;text-decoration-style:solid" d="m609.81 484.51c-61.932 0-112.18 49.968-112.18 111.55 0 61.584 50.25 111.55 112.18 111.55 61.932 0 112.18-49.969 112.18-111.55 0-61.584-50.251-111.55-112.18-111.55zm-2.6133 4.2088v101.07l-71.88-71.477c18.787-17.803 44.024-28.934 71.88-29.591zm5.2277 0c27.857.6574 53.093 11.789 71.88 29.592l-71.88 71.477v-101.07zm-80.804 33.268 71.88 71.477h-101.64c.66083-27.701 11.856-52.796 29.759-71.477zm156.38 0c17.903 18.682 29.099 43.777 29.759 71.477h-101.64l71.88-71.477zm-186.14 76.676h101.64l-71.879 71.476c-17.903-18.682-29.098-43.776-29.759-71.476zm114.26 0h101.64c-.66107 27.7-11.856 52.795-29.759 71.476l-71.879-71.476zm-3.6972 3.6754 71.879 71.476c-18.787 17.803-44.023 28.936-71.879 29.594v-101.07zm-5.2277.00072v101.07c-27.857-.65708-53.093-11.79-71.879-29.592l71.879-71.476z" stroke-width="1.6409" fill="#000000"></path>
                        <g id="wing3" transform="matrix(1.11814,-0.11752,0.11686,1.11187,-280.9954421037924,-2.1154134578038857)" data-svg-origin="830.3789672851562 624.9187927246094" style="z-index: 0; transform-origin: 0px 0px;">
                            <rect id="rect4317" ry="11.784" height="23.568" width="36.818" y="650.65" x="811.97" stroke-width="4.6316" fill="#f5f5f5"></rect>
                            <rect id="rect4319" height="21.213" width="4.9497" y="627.47" x="827.67" stroke-width="2.5" fill="#1941df"></rect>
                            <circle id="path4321" cx="830.05" cy="626.39" r="4.0659" stroke-width="2.5" fill="#1941df"></circle>
                        </g>
                        <g id="wing4" transform="matrix(1.11814,-0.11752,0.11686,1.11187,-312.4754421037924,75.58458654219612)" data-svg-origin="830.3789672851562 624.9187927246094" style="z-index: 0; transform-origin: 0px 0px;">
                            <rect id="rect4330" ry="11.784" height="23.568" width="36.818" y="650.65" x="811.97" stroke-width="4.6316" fill="#f5f5f5"></rect>
                            <rect id="rect4332" height="21.213" width="4.9497" y="627.47" x="827.67" stroke-width="2.5" fill="#1941df"></rect>
                            <circle id="circle4334" stroke-width="2.5" cy="626.39" cx="830.05" r="4.0659" fill="#1941df"></circle>
                        </g>
                    </g>
                    <g id="wing5" transform="matrix(1.11814,-0.11752,0.11686,1.11187,-391.1754521037924,106.88908654219613)" stroke="#0b0b0b" data-svg-origin="830.3789672851562 624.9187927246094" style="z-index: 0; transform-origin: 0px 0px;">
                        <rect id="rect4338" ry="11.784" height="23.568" width="36.818" y="650.65" x="811.97" stroke-width="4.6316" fill="#f5f5f5"></rect>
                        <rect id="rect4340" height="21.213" width="4.9497" y="627.47" x="827.67" stroke-width="2.5" fill="#1941df"></rect>
                        <circle id="circle4342" cx="830.05" cy="626.39" r="4.0659" stroke-width="2.5" fill="#1941df"></circle>
                    </g>
                    <g stroke="#000000">
                        <g id="wing6" transform="matrix(1.11814,-0.11752,0.11686,1.11187,-469.5554521037924,75.86958654219612)" data-svg-origin="830.3789672851562 624.9187927246094" style="z-index: 0; transform-origin: 0px 0px;">
                            <rect id="rect4346" ry="11.784" height="23.568" width="36.818" y="650.65" x="811.97" stroke-width="4.6316" fill="#f5f5f5"></rect>
                            <rect id="rect4348" height="21.213" width="4.9497" y="627.47" x="827.67" stroke-width="2.5" fill="#1941df"></rect>
                            <circle id="circle4350" stroke-width="2.5" cy="626.39" cx="830.05" r="4.0659" fill="#1941df"></circle>
                        </g>
                        <g id="wing7" transform="matrix(1.11814,-0.11752,0.11686,1.11187,-501.31543210379243,-1.8354134578038845)" data-svg-origin="830.3789672851562 624.9187927246094" style="z-index: 0; transform-origin: 0px 0px;">
                            <rect id="rect4354" ry="11.784" height="23.568" width="36.818" y="650.65" x="811.97" stroke-width="4.6316" fill="#f5f5f5"></rect>
                            <rect id="rect4356" height="21.213" width="4.9497" y="627.47" x="827.67" stroke-width="2.5" fill="#1941df"></rect>
                            <circle id="circle4358" cx="830.05" cy="626.39" r="4.0659" stroke-width="2.5" fill="#1941df"></circle>
                        </g>
                        <g id="wing8" transform="matrix(1.11814,-0.11752,0.11686,1.11187,-468.4254521037924,-78.97541345780387)" data-svg-origin="830.3789672851562 624.9187927246094" style="z-index: 0; transform-origin: 0px 0px;">
                            <rect id="rect4362" ry="11.784" height="23.568" width="36.818" y="650.65" x="811.97" stroke-width="4.6316" fill="#f5f5f5"></rect>
                            <rect id="rect4364" height="21.213" width="4.9497" y="627.47" x="827.67" stroke-width="2.5" fill="#1941df"></rect>
                            <circle id="circle4366" stroke-width="2.5" cy="626.39" cx="830.05" r="4.0659" fill="#1941df"></circle>
                        </g>
                        <g id="wing1" transform="matrix(1.11814,-0.11752,0.11686,1.11187,-390.8454321037924,-110.27541345780388)" data-svg-origin="830.3789672851562 624.9187927246094" style="z-index: 0; transform-origin: 0px 0px;">
                            <rect id="rect4370" ry="11.784" height="23.568" width="36.818" y="650.65" x="811.97" stroke-width="4.6316" fill="#f5f5f5"></rect>
                            <rect id="rect4372" height="21.213" width="4.9497" y="627.47" x="827.67" stroke-width="2.5" fill="#1941df"></rect>
                            <circle id="circle4374" cx="830.05" cy="626.39" r="4.0659" stroke-width="2.5" fill="#1941df"></circle>
                        </g>
                        <g id="wing2" transform="matrix(1.11814,-0.11752,0.11686,1.11187,-313.5054421037924,-77.6954134578039)" data-svg-origin="830.3789672851562 624.9187927246094" style="z-index: 0; transform-origin: 0px 0px;">
                            <rect id="rect4378" ry="11.784" height="23.568" width="36.818" y="650.65" x="811.97" stroke-width="4.6316" fill="#f5f5f5"></rect>
                            <rect id="rect4380" height="21.213" width="4.9497" y="627.47" x="827.67" stroke-width="2.5" fill="#1941df"></rect>
                            <circle id="circle4382" stroke-width="2.5" cy="626.39" cx="830.05" r="4.0659" fill="#1941df"></circle>
                        </g>
                    </g>
                </g>
                <ellipse id="circle6282" rx="52.077" ry="51.785" cy="733.82" cx="1287.9" fill="#1941df"></ellipse>
                <g id="hand3" transform="matrix(.74334 0 0 -.74334 994.58 700.63)">
                    <g id="g196" fill="#1941df" transform="matrix(.65977 .75147 -.75147 .65977 177.05 286.99)">
                        <path id="path198" d="m0 0-55.448-48.276c-10.738-9.35-11.874-25.785-2.525-36.524l83.343-95.721c9.349-10.739 25.784-11.875 36.523-2.526l55.447 48.277c10.738 9.35 11.875 25.785 2.525 36.523l-83.338 95.722c-9.349 10.738-25.784 11.875-36.522 2.525" fill-rule="evenodd" fill="#1941df"></path>
                    </g>
                    <g id="g200" fill="#ffffff" transform="matrix(.65977 .75147 -.75147 .65977 192.1 303.54)">
                        <path id="path202" d="m0 0-80.506-70.094c-.157-.136-.173-.376-.037-.532l96.182-110.47c.136-.156.375-.173.532-.036l80.506 70.094c.156.137.173.376.036.532l-96.18 110.48c-.137.16-.376.177-.533.04" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g id="g204" transform="matrix(.65977 .75147 -.75147 .65977 181.37 263.95)">
                        <path id="path206" d="m0 0-20.73-18.05c-.562-.489-.622-1.349-.132-1.911.489-.562 1.349-.621 1.911-.132l20.73 18.049c.562.489.622 1.35.133 1.912-.490.562-1.35.621-1.912.132" fill-rule="evenodd" fill="#5085a1"></path>
                    </g>
                    <g id="g208" transform="matrix(.65977 .75147 -.75147 .65977 248.26 131.47)">
                        <path id="path210" d="m0 0-63.994-48.634-6.811-50.813 9.19-10.556 10.978-.823 79.729 60.63l-29.092 50.19z" fill-rule="evenodd" fill="#e7d1a7"></path>
                    </g>
                    <g id="g212" transform="matrix(.65977 .75147 -.75147 .65977 303.32 111.94)">
                        <path id="path214" d="m0 0-74.787-65.482-17.046 19.579 6.149 47.823 43.839 38.362 41.845-40.282z" fill-rule="evenodd" fill="#808080"></path>
                    </g>
                    <g id="g216" transform="matrix(.65977 .75147 -.75147 .65977 308.56 83.567)">
                        <path id="path218" d="m0 0-46.741-40.088-12.326-.277-15.528 17.834 7.056 52.635 23.654 20.3l43.885-50.404z" fill-rule="evenodd" fill="#2f4f4f"></path>
                    </g>
                    <g id="g220" transform="matrix(.65977 .75147 -.75147 .65977 310.47 57.037)">
                        <path id="path222" d="m0 0-181.18-158.86-46.208 52.63l181.52 158.92z" fill-rule="evenodd" fill="#2b4fda"></path>
                    </g>
                    <g id="g224" fill="#1941df" transform="matrix(.65977 .75147 -.75147 .65977 273.76 57.188)">
                        <path id="path226" d="m0 0-181.47-158.99-21.928 24.976l181.63 159.01z" fill-rule="evenodd" fill="#1941df"></path>
                    </g>
                    <g id="g228" transform="matrix(.65977 .75147 -.75147 .65977 210.98 299.89)">
                        <path id="path230" d="m0 0 72.107-82.818-75.126-65.412-72.107 82.819 75.126 65.411z" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g fill="#696969">
                        <g id="g232" transform="matrix(.65977 .75147 -.75147 .65977 210.98 299.89)">
                            <path id="path234" d="m0 0 72.107-82.818-3.647-3.176-72.108 82.817 3.648 3.177z" fill-rule="evenodd" fill="#696969"></path>
                        </g>
                        <g id="g236" transform="matrix(.65977 .75147 -.75147 .65977 240.3 291.99)">
                            <path id="path238" d="m0 0 33.559-38.543-5.556-4.838-33.559 38.543 5.556 4.838z" fill-rule="evenodd" fill="#696969"></path>
                        </g>
                        <g id="g240" transform="matrix(.65977 .75147 -.75147 .65977 210.88 276.12)">
                            <path id="path242" d="m0 0 72.107-82.819-15.317-13.336-72.108 82.818 15.318 13.337z" fill-rule="evenodd" fill="#696969"></path>
                        </g>
                        <g id="g244" transform="matrix(.65977 .75147 -.75147 .65977 231.98 278.69)">
                            <path id="path246" d="m0 0 44.409-51.005 2.328 2.027l-44.408 51.006-2.329-2.028z" fill-rule="evenodd" fill="#696969"></path>
                        </g>
                    </g>
                    <g id="g248" transform="matrix(.65977 .75147 -.75147 .65977 217.36 235.29)">
                        <path id="path250" d="m0 0 18.106-20.796 12.379 10.777-18.107 20.797-12.378-10.778z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g252" transform="matrix(.65977 .75147 -.75147 .65977 251.83 235.15)">
                        <path id="path254" d="m0 0 18.106-20.796 12.379 10.778-18.107 20.796-12.378-10.778z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g256" transform="matrix(.65977 .75147 -.75147 .65977 286.3 235.01)">
                        <path id="path258" d="m0 0 18.106-20.796 12.379 10.778-18.107 20.796-12.378-10.778z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g260" transform="matrix(.65977 .75147 -.75147 .65977 210.61 209.14)">
                        <path id="path262" d="m0 0 72.107-82.817-6.678-5.815-72.107 82.818 6.678 5.814z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g264" transform="matrix(.65977 .75147 -.75147 .65977 217.34 229.95)">
                        <path id="path266" d="m0 0 18.106-20.796 2.329 2.028l-18.106 20.796-2.329-2.028z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g268" transform="matrix(.65977 .75147 -.75147 .65977 217.32 224.65)">
                        <path id="path270" d="m0 0 18.106-20.796 2.33 2.028l-18.107 20.796-2.329-2.028z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g272" transform="matrix(.65977 .75147 -.75147 .65977 217.3 219.34)">
                        <path id="path274" d="m0 0 18.106-20.796 2.329 2.027l-18.106 20.796-2.329-2.027z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g276" transform="matrix(.65977 .75147 -.75147 .65977 217.28 214.03)">
                        <path id="path278" d="m0 0 11.464-13.167 2.329 2.027-11.464 13.167-2.329-2.027z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g280" transform="matrix(.65977 .75147 -.75147 .65977 251.81 229.81)">
                        <path id="path282" d="m0 0 18.106-20.796 2.329 2.028l-18.106 20.796-2.329-2.028z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g284" transform="matrix(.65977 .75147 -.75147 .65977 251.79 224.5)">
                        <path id="path286" d="m0 0 18.106-20.796 2.329 2.028l-18.106 20.796-2.329-2.028z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g288" transform="matrix(.65977 .75147 -.75147 .65977 251.77 219.2)">
                        <path id="path290" d="m0 0 18.106-20.796 2.329 2.027l-18.106 20.796-2.329-2.027z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g292" transform="matrix(.65977 .75147 -.75147 .65977 251.74 213.89)">
                        <path id="path294" d="m0 0 11.464-13.167 2.329 2.027-11.464 13.168-2.329-2.028z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g296" transform="matrix(.65977 .75147 -.75147 .65977 286.28 229.67)">
                        <path id="path298" d="m0 0 18.106-20.796 2.33 2.028l-18.107 20.796-2.329-2.028z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g300" transform="matrix(.65977 .75147 -.75147 .65977 286.26 224.36)">
                        <path id="path302" d="m0 0 18.106-20.796 2.33 2.028l-18.107 20.796-2.329-2.028z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g304" transform="matrix(.65977 .75147 -.75147 .65977 286.23 219.05)">
                        <path id="path306" d="m0 0 18.106-20.796 2.33 2.027l-18.107 20.796-2.329-2.027z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g308" transform="matrix(.65977 .75147 -.75147 .65977 286.21 213.75)">
                        <path id="path310" d="m0 0 11.464-13.167 2.329 2.027-11.464 13.167-2.329-2.027z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g312" transform="matrix(.65977 .75147 -.75147 .65977 216.06 193.83)">
                        <path id="path314" d="m0 0-29.646-38.185c-3.814-4.915-13.411-27.345-8.818-31.544 4.589-4.196 19.019 8.126 22.713 13.141l19.338 28.233c11.09 16.188 1.875 24.374-3.587 28.355" fill-rule="evenodd" fill="#808080"></path>
                    </g>
                    <g id="g316" transform="matrix(.65977 .75147 -.75147 .65977 255.86 262.22)">
                        <path id="path318" d="m0 0-42.463-36.909c9.398 1.003 14.897-12.109 8.022-19.565 9.49 2.35 15.679-9.564 10.766-17.539 9.103.728 14.079-12.592 6.238-19.377l-35.913-31.076c-10.083-8.723-27.775-14.493-36.641-14.642-26.285-.444-36.822 31.251-32.837 44.763 3.106 10.535 4.153 18.393 9.485 23.137l99.32 86.881c12.493 11.121 24.536-6.811 14.02-15.669" fill-rule="evenodd" fill="#808080"></path>
                    </g>
                    <g id="g320" transform="matrix(.65977 .75147 -.75147 .65977 275.71 186.13)">
                        <path id="path322" d="m0 0v-.853c-2.558-2.17-4.305-3.649-4.305-3.649s1.778 1.87 4.305 4.502m0 26.745v-2.185c-7.01-5.726-15.449-12.438-15.449-12.438s9.738 9.416 15.449 14.623m0-2.185v2.185c.589.537 1.136 1.029 1.625 1.462-.08-.07.033-.053.27.022.836.067 1.643.02 2.41-.125-1.297-1.08-2.766-2.289-4.305-3.544m0-25.413v.853c3.432 3.573 8.248 8.554 11.876 12.172-.502-1.254-1.236-2.451-2.23-3.529.632.155 1.248.248 1.847.282-3.898-3.328-8.32-7.085-11.493-9.778m8.298-19.457s7.245 6.023 13.655 11.4c-.498.049-1.013.055-1.541.014.431.7.775 1.431 1.041 2.18-5.984-6.092-13.155-13.594-13.155-13.594" fill-rule="evenodd" fill="#c0c0c0"></path>
                    </g>
                    <g id="g324" transform="matrix(.65977 .75147 -.75147 .65977 348.16 253.64)">
                        <path id="path326" d="m0 0c1.496-1.718 1.315-4.323-.402-5.819-1.719-1.497-4.325-1.317-5.821.402-1.496 1.718-1.316 4.323.403 5.819 1.717 1.496 4.324 1.316 5.82-.402" fill-rule="evenodd" fill="#5085a1"></path>
                    </g>
                    <g id="g328" transform="matrix(.65977 .75147 -.75147 .65977 214.77 265.95)">
                        <path id="path330" d="m0 0-1.832-1.596.541 3.078 3.123.113-1.832-1.595z" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g id="g332" transform="matrix(.65977 .75147 -.75147 .65977 316.72 265.53)">
                        <path id="path334" d="m0 0-1.832-1.596 3.123.114.542 3.077-1.833-1.595z" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                </g>
                <ellipse id="ellipse5006" rx="45.29" ry="45.036" cy="739.7" cx="-204.87" fill="#1941df"></ellipse>
                <rect id="rect5008" height="63.671" width="5.1234" y="772.53" x="-207.43" fill="#696969"></rect>
                <g id="g6246" transform="matrix(.58925 .0077262 .0077262 -.58925 35.436 1032.4)">
                    <g id="g424" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -289.99 710.77)">
                        <path id="path426" d="m0 0-59.451 68.177-43.716 7.374.182-37.333 60.074-68.851l42.916 30.633z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g428" transform="matrix(-.75880 .65132 -.65132 -.75880 -294.22 666.02)">
                        <path id="path430" d="m0 0-30.562 35.03-46.673 3.803-3.163-38.829 34.719-39.775 45.679 39.771z" fill-rule="evenodd" fill="#2f4f4f"></path>
                    </g>
                    <g id="g432" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -295.95 747.03)">
                        <path id="path434" d="m0 0c1.85 22.696-15.05 42.594-37.747 44.443-22.695 1.849-42.593-15.051-44.441-37.747-1.85-22.696 15.05-42.593 37.746-44.443 22.695-1.848 42.593 15.052 44.442 37.747" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g436" transform="matrix(-.75880 .65132 -.65132 -.75880 -292.81 716.07)">
                        <path id="path438" d="m0 0c-2.424 10.139-13.61 15.369-24.984 11.682-11.374-3.686-18.63-14.894-16.206-25.033 2.424-10.138 13.61-15.369 24.984-11.682s18.63 14.895 16.206 25.033" fill-rule="evenodd" fill="#a9a9a9"></path>
                    </g>
                    <g id="g440" transform="matrix(-.75880 .65132 -.65132 -.75880 -299.94 784.28)">
                        <path id="path442" d="m0 0c2.522 2.188 2.8 6.045.609 8.564l-41.659 47.863c-3.8 4.366-13.066 7.778-17.439 3.985-4.372-3.792-4.861-10.486-1.054-14.846l36.976-42.405c6.189-7.099 17.186-7.828 22.567-3.161" fill-rule="evenodd" fill="#a9a9a9"></path>
                    </g>
                    <g id="g444" fill="#1941df" transform="matrix(-.75880 .65132 -.65132 -.75880 -194.8 936.87)">
                        <path id="path446" d="m0 0 61.911 53.904c11.991 10.44 13.259 28.791 2.82 40.781l-93.059 106.88c-10.44 11.991-28.79 13.26-40.781 2.82l-61.911-53.905c-11.991-10.439-13.259-28.79-2.82-40.78l93.059-106.88c10.44-11.992 28.79-13.26 40.781-2.82" fill-rule="evenodd" fill="#1941df"></path>
                    </g>
                    <g id="g448" transform="matrix(-.75880 .65132 -.65132 -.75880 -176.13 920.27)">
                        <path id="path450" d="m0 0 89.893 78.267c.174.152.193.419.041.594l-107.39 123.35c-.153.174-.42.193-.595.041l-89.892-78.267c-.175-.152-.193-.419-.041-.594l107.39-123.35c.149-.174.415-.192.59-.04" fill-rule="evenodd" fill="#c1d9ff"></path>
                    </g>
                    <g id="g452" transform="matrix(-.75880 .65132 -.65132 -.75880 -186.19 906.19)">
                        <path id="path454" d="m0 0 74.567 64.923c.145.126.16.348.034.493l-89.085 102.32c-.126.146-.348.161-.493.035l-74.566-64.923c-.146-.127-.161-.348-.035-.493l89.085-102.34c.126-.14.348-.156.493-.03" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g id="g456" transform="matrix(-.75880 .65132 -.65132 -.75880 -257.53 892.92)">
                        <path id="path458" d="m0 0c-5.556-4.837-13.981-4.255-18.819 1.301-4.837 5.556-4.255 13.981 1.301 18.819 5.556 4.837 13.981 4.255 18.818-1.301 4.838-5.556 4.256-13.982-1.3-18.819" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g id="g460" transform="matrix(-.75880 .65132 -.65132 -.75880 -246.19 875.58)">
                        <path id="path462" d="m0 0c-2.367 6.152.702 13.057 6.853 15.424 6.152 2.367 13.058-.701 15.424-6.853 2.367-6.152-.701-13.057-6.852-15.424l1.008-2.621c7.599 2.924 11.389 11.455 8.465 19.054s-11.454 11.389-19.053 8.465-11.389-11.455-8.465-19.053c1.014-2.638 2.704-4.815 4.795-6.413l1.708 2.23c-1.694 1.293-3.061 3.056-3.883 5.191" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g464" transform="matrix(-.75880 .65132 -.65132 -.75880 -213.72 893.23)">
                        <path id="path466" d="m0 0c-5.556-4.838-13.981-4.255-18.819 1.301-4.837 5.555-4.255 13.981 1.302 18.818 5.555 4.838 13.981 4.255 18.818-1.301s4.255-13.981-1.301-18.818" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g id="g468" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -202.13 876.68)">
                        <path id="path470" d="m0 0c-1.865 4.002-1.428 8.888 1.535 12.553 4.144 5.125 11.658 5.922 16.784 1.778s5.921-11.659 1.777-16.785l2.184-1.765c5.118 6.331 4.136 15.615-2.196 20.734-6.332 5.118-15.614 4.135-20.733-2.197-3.661-4.527-4.2-10.562-1.896-15.505l2.545 1.187z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g472" transform="matrix(-.75880 .65132 -.65132 -.75880 -255.83 880.28)">
                        <path id="path474" d="m0 0-3.856 4.429c-.581.666-.51 1.688.157 2.269.668.581 1.689.51 2.27-.157l3.855-4.428.002 1.606c.001.884.725 1.608 1.61 1.607s1.609-.726 1.607-1.611l-.017-6.172c-.002-.971-.585-1.489-1.42-1.374l-6.239.864c-.876.121-1.494.936-1.373 1.813.121.876.937 1.494 1.813 1.374l1.591-.220z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g476" transform="matrix(-.75880 .65132 -.65132 -.75880 -215.23 879.2)">
                        <path id="path478" d="m0 0 3.856-4.429c.581-.667.510-1.688-.157-2.269-.668-.581-1.688-.510-2.269.157l-3.856 4.429-.002-1.607c-.0010-.885-.725-1.608-1.61-1.607s-1.609.725-1.607 1.61l.017 6.171c.003.973.585 1.49 1.42 1.375l6.239-.862c.875-.122 1.495-.938 1.374-1.814-.121-.877-.937-1.495-1.814-1.374l-1.591.220z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g480" transform="matrix(-.75880 .65132 -.65132 -.75880 -257.02 852.1)">
                        <path id="path482" d="m0 0c-5.556-4.837-13.981-4.254-18.818 1.301-4.838 5.556-4.256 13.982 1.3 18.819s13.982 4.255 18.819-1.302c4.837-5.555 4.255-13.981-1.301-18.818" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g id="g484" transform="matrix(-.75880 .65132 -.65132 -.75880 -245.68 834.76)">
                        <path id="path486" d="m0 0c-2.367 6.152.701 13.058 6.853 15.424 6.151 2.368 13.057-0.7 15.424-6.852s-.701-13.058-6.853-15.425l1.008-2.62c7.6 2.924 11.389 11.454 8.466 19.053-2.924 7.599-11.455 11.389-19.054 8.466-7.598-2.924-11.389-11.455-8.465-19.054 1.014-2.638 2.704-4.815 4.796-6.413l1.707 2.23c-1.693 1.294-3.061 3.057-3.882 5.191" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g488" transform="matrix(-.75880 .65132 -.65132 -.75880 -213.21 852.41)">
                        <path id="path490" d="m0 0c-5.556-4.837-13.981-4.255-18.818 1.301-4.838 5.556-4.256 13.981 1.3 18.819 5.556 4.837 13.982 4.255 18.82-1.302 4.836-5.555 4.254-13.981-1.302-18.818" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g id="g492" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -201.62 835.86)">
                        <path id="path494" d="m0 0c-1.865 4.002-1.429 8.889 1.535 12.553 4.144 5.126 11.659 5.921 16.784 1.778 5.126-4.144 5.921-11.659 1.777-16.785l2.184-1.765c5.119 6.331 4.136 15.614-2.196 20.733s-15.614 4.137-20.733-2.196c-3.66-4.526-4.2-10.562-1.896-15.506l2.545 1.188z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g496" transform="matrix(-.75880 .65132 -.65132 -.75880 -255.32 839.46)">
                        <path id="path498" d="m0 0-3.856 4.429c-.581.667-.51 1.688.157 2.269s1.688.511 2.269-.156l3.856-4.43.001 1.607c.001.885.726 1.608 1.611 1.607s1.609-.725 1.607-1.61l-.017-6.173c-.003-.971-.586-1.489-1.42-1.374l-6.239.864c-.877.121-1.494.936-1.374 1.813.121.877.936 1.495 1.813 1.374l1.592-.220z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g500" transform="matrix(-.75880 .65132 -.65132 -.75880 -214.72 838.38)">
                        <path id="path502" d="m0 0 3.856-4.429c.581-.667.511-1.688-.157-2.27-.667-.581-1.688-.509-2.269.158l-3.856 4.429-.0010-1.607c-.0010-.885-.726-1.609-1.611-1.608-.885.002-1.609.726-1.607 1.611l.017 6.172c.003.972.586 1.49 1.42 1.375l6.239-.864c.8760-.121 1.495-.936 1.375-1.813-.1220-.877-.9370-1.495-1.814-1.374l-1.592.220z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g504" transform="matrix(-.75880 .65132 -.65132 -.75880 -256.75 813.65)">
                        <path id="path506" d="m0 0c-5.556-4.837-13.981-4.255-18.819 1.301-4.837 5.556-4.255 13.981 1.301 18.819s13.981 4.254 18.819-1.302c4.837-5.556 4.255-13.981-1.301-18.818" fill-rule="evenodd" fill="#ffffff"></path>
                    </g>
                    <g id="g508" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -244.87 797.1)">
                        <path id="path510" d="m0 0c-1.865 4.002-1.428 8.889 1.535 12.554 4.144 5.125 11.658 5.921 16.784 1.777s5.921-11.659 1.777-16.784l2.184-1.766c5.119 6.332 4.136 15.614-2.196 20.734-6.331 5.119-15.614 4.135-20.733-2.197-3.661-4.526-4.2-10.562-1.896-15.506l2.545 1.188z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g512" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -258.26 799.61)">
                        <path id="path514" d="m0 0 3.856-4.429c.581-.667.511-1.688-.156-2.269-.668-.581-1.689-.510-2.27.156l-3.856 4.43-.0010-1.607c-.0010-.885-.726-1.608-1.611-1.607-.884 0-1.609.726-1.607 1.61l.017 6.172c.003.971.586 1.49 1.42 1.375l6.239-.864c.8770-.121 1.495-.937 1.374-1.813s-.9360-1.494-1.813-1.374l-1.592.220z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g516" transform="matrix(-.75880 .65132 -.65132 -.75880 -226.39 809.22)">
                        <path id="path518" d="m0 0-21.262-18.512-1.169 1.342 21.262 18.512 1.169-1.342z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g520" transform="matrix(-.75880 .65132 -.65132 -.75880 -226.36 805.3)">
                        <path id="path522" d="m0 0-21.262-18.512-1.168 1.342 21.261 18.512 1.169-1.342z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g524" transform="matrix(-.75880 .65132 -.65132 -.75880 -226.33 801.38)">
                        <path id="path526" d="m0 0-21.262-18.512-1.169 1.343l21.262 18.512 1.169-1.343z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g528" transform="matrix(-.75880 .65132 -.65132 -.75880 -226.31 797.47)">
                        <path id="path530" d="m0 0-21.262-18.512-1.169 1.343l21.263 18.511 1.168-1.342z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g532" transform="matrix(-.75880 .65132 -.65132 -.75880 -226.28 793.55)">
                        <path id="path534" d="m0 0-11.478-9.993-1.168 1.343 11.478 9.993 1.168-1.343z" fill-rule="evenodd" fill="#badaf5"></path>
                    </g>
                    <g id="g536" transform="matrix(-.75880 .65132 -.65132 -.75880 -220.46 931.75)">
                        <path id="path538" d="m0 0 23.147 20.153c.628.547.694 1.507.148 2.135h-.001c-.546.628-1.506.694-2.134.148l-23.147-20.154c-.628-.547-.694-1.507-.147-2.135.547-.627 1.507-.694 2.134-.147" fill-rule="evenodd" fill="#5085a1"></path>
                    </g>
                    <g id="g540" transform="matrix(-.75880 .65132 -.65132 -.75880 -239.61 754.79)">
                        <path id="path542" d="m0 0c1.645 2.099 1.277 5.133-.82 6.777-2.099 1.645-5.133 1.278-6.778-.820-1.644-2.098-1.277-5.132.821-6.777s5.131-1.278 6.777.820" fill-rule="evenodd" fill="#5085a1"></path>
                    </g>
                    <g id="g544" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -308.57 783.72)">
                        <path id="path546" d="m0 0-45.176 51.901c-3.799 4.367-13.065 7.778-17.438 3.986-4.373-3.793-4.861-10.486-1.054-14.846l35.468-40.674c10.339-11.857 25.038-3.73 28.2-.367" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g548" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -298.16 713.83)">
                        <path id="path550" d="m0 0c-2.74 9.938-15.052 14.45-27.501 10.079-12.449-4.373-20.32-15.973-17.58-25.91 2.739-9.938 15.051-14.449 27.5-10.078 12.45 4.372 20.321 15.971 17.581 25.909" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g552" transform="matrix(-.75880 .65132 -.65132 -.75880 -201.24 719.78)">
                        <path id="path554" d="m0 0-44.372 58.385-55.272 7.41-1.47-19.596 55.317-72.741l45.793 26.542z" fill-rule="evenodd" fill="#e7d1a7"></path>
                    </g>
                    <g id="g556" fill="#696969" transform="matrix(-.75880 .65132 -.65132 -.75880 -150.81 702.53)">
                        <path id="path558" d="m0 0-60.017 68.544-.497 17.637 62.265-8.007 35-39.997l-36.751-38.177z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g560" transform="matrix(-.75880 .65132 -.65132 -.75880 -145.74 676.7)">
                        <path id="path562" d="m0 0-36.574 42.645-.623 27.644 64.662-8.669 18.522-21.581-45.987-40.039z" fill-rule="evenodd" fill="#2f4f4f"></path>
                    </g>
                    <g id="g564" fill="#00ced1" transform="matrix(-.75880 .65132 -.65132 -.75880 -143.73 652.51)">
                        <path id="path566" d="m0 0-210.65 241.12 48.004 41.205l210.72-240.47z" fill-rule="evenodd" fill="#2b4fda"></path>
                    </g>
                    <g id="g568" fill="#1941df" transform="matrix(-.75880 .65132 -.65132 -.75880 -143.73 652.51)">
                        <path id="path570" d="m0 0-210.32 240.74 24.425 20.965l210.36-240.4z" fill-rule="evenodd" fill="#1941df"></path>
                    </g>
                    <g id="g572" fill="#a9a9a9" transform="matrix(-.75880 .65132 -.65132 -.75880 -245.6 779.07)">
                        <path id="path574" d="m0 0-48.955 26.907c-4.975 2.735-26.561 8.166-29.686 3.426-3.123-4.735 10.048-15.973 15.096-18.581l38.51-19.047c16.048-7.937 22.23 1.803 25.035 7.295" fill-rule="evenodd" fill="#a9a9a9"></path>
                    </g>
                    <g id="g576" transform="matrix(-.75880 .65132 -.65132 -.75880 -215.83 835.43)">
                        <path id="path578" d="m0 0-38.925 33.008c2.249-8.324-8.776-15.157-16.479-10.031 3.477-8.215-6.371-15.498-14.261-12.214 1.96-8.097-9.329-14.491-16.565-8.398l-33.146 27.906c-9.307 7.835-17.04 22.949-18.445 30.917-4.167 23.619 22.881 37.655 35.628 36.001 9.937-1.289 17.167-1.106 22.206-5.231l93.313-76.551c11.808-9.666-3.832-23.613-13.322-15.407" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g580" transform="matrix(-.75880 .65132 -.65132 -.75880 -189.86 782.95)">
                        <path id="path582" d="m0 0v-.768c-.518.233-1.025.512-1.52.841.232-.547.402-1.088.52-1.624-6.427 5.484-14.361 12.311-14.361 12.311s8.819-6.066 15.361-10.76m0 21.69v-.314c-1.227 1.118-1.98 1.808-1.98 1.808s.762-.573 1.98-1.494m-27.799-24.551s6.465-5.664 12.228-10.67c-.029.456-.096.921-.209 1.39.693-.287 1.401-.493 2.114-.625-6.347 4.519-14.133 9.905-14.133 9.905m27.799 24.237v.314c3.622-2.739 11.28-8.56 14.959-11.586-.075.063-.042-.037.059-.239.180-.745.253-1.478.233-2.19-4.739 4.144-11.834 10.587-15.251 13.701m0-22.144v.768c.689-.495 1.354-.975 1.98-1.43-.669.152-1.332.370-1.98.662" fill-rule="evenodd" fill="#c0c0c0"></path>
                    </g>
                    <g id="g584" fill="#1941df" transform="matrix(-.75880 .65132 -.65132 -.75880 -295.99 646.96)">
                        <path id="path586" d="m0 0-207.63 236.45-39.043-33.512-10.664-9.1538l208.09-236.66z" fill-rule="evenodd" fill="#1941df"></path>
                    </g>
                    <g id="g588" fill="#2b4fda" transform="matrix(-.75880 .65132 -.65132 -.75880 -263.35 647.19)">
                        <path id="path590" d="m0 0-207.76 235.98-13.96-11.99-10.66-9.15 207.76-236.28z" fill-rule="evenodd" fill="#2b4fda"></path>
                    </g>
                </g>
                <g id="HAND2" transform="translate(-73.213 .58579)">
                    <g id="g120" transform="matrix(.59118 .43196 .43196 -.59118 385.12 615.1)">
                        <path id="path122" d="m-18.372 36.411-27.493 12.838c-9.9409 4.6418-19.904 5.4015-22.733-6.2329-4.901-20.16 18.211-14.022 53.494-34.82 7.6448-4.5061 21.246-16.062 25.225-10.986" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g72" transform="matrix(.60204 .41670 .41670 -.60204 446.62 534.48)">
                        <path id="path74" d="m0 0c5.367.637 10.213-3.246 10.915-8.599l12.858-97.928c.705-5.353-3.23-10.279-8.597-10.916s-10.21 3.24-10.914 8.598l-12.86 97.931c-.704 5.364 3.231 10.282 8.598 10.919" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g76" fill="#696969" transform="matrix(.54944 .48394 .48394 -.54944 384.11 647.11)">
                        <path id="path78" d="m0 0 40.959 35.661-28.018 32.181-19.674 62.828-60.883-53.011 67.616-77.659z" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g id="g80" transform="matrix(.60204 .41670 .41670 -.60204 452.88 556.76)">
                        <path id="path82" d="m0 0c5.367.636 10.212-3.246 10.915-8.599l12.858-97.928c.704-5.353-3.231-10.28-8.598-10.916-5.367-.637-10.209 3.239-10.913 8.598l-12.861 97.93c-.704 5.364 3.231 10.282 8.599 10.92" fill-rule="evenodd" fill="#696969"></path>
                    </g>
                    <g fill="#696969">
                        <g id="g84" transform="matrix(.60204 .41670 .41670 -.60204 442.7 506)">
                            <path id="path86" d="m0 0c5.367.637 10.216-3.243 10.915-8.599l12.329-94.302c.699-5.357-3.231-10.28-8.598-10.916-5.369-.637-10.214 3.239-10.915 8.598l-12.329 94.305c-0.7 5.36 3.231 10.278 8.598 10.915" fill-rule="evenodd" fill="#696969"></path>
                        </g>
                        <g id="g104" transform="matrix(.60204 .41670 .41670 -.60204 456.01 550.82)">
                            <path id="path106" d="m0 0c5.368.637 10.268-3.242 10.916-8.599l2.202-18.209c.649-5.357-3.231-10.279-8.598-10.916-5.368-.636-10.265 3.233-10.915 8.599l-2.203 18.211c-.648 5.366 3.231 10.277 8.598 10.914" fill-rule="evenodd" fill="#696969"></path>
                        </g>
                        <g id="g108" transform="matrix(.60204 .41670 .41670 -.60204 450.19 527.71)">
                            <path id="path110" d="m0 0c5.368.638 10.268-3.241 10.916-8.599l1.876-15.507c.647-5.358-3.231-10.28-8.599-10.916-5.367-.637-10.264 3.232-10.914 8.598l-1.876 15.51c-.649 5.366 3.23 10.277 8.597 10.914" fill-rule="evenodd" fill="#696969"></path>
                        </g>
                    </g>
                    <g id="g112" fill="#00c1e0" transform="matrix(.55789 .47418 .47418 -.55789 379.31 634.72)">
                        <path id="path114" d="m0 0 51.759 45.064 22.823-26.212-51.759-45.065-22.823 26.213z" fill-rule="evenodd" fill="#2f4f4f"></path>
                    </g>
                    <g id="g116" transform="matrix(.55789 .46578 .47418 -0.548 376.38 660.19)">
                        <path id="path118" d="m0 0 58.437 50.879 160.22-184.24-59.776-50.808z" fill-rule="evenodd" fill="#2b4fda"></path>
                    </g>
                    <g id="g124" transform="matrix(.55789 .46442 .47418 -.54640 404.74 659.86)">
                        <path id="path126" d="m0 0 29.219 25.44 160.82-184.94-29.888-25.404z" fill-rule="evenodd" fill="#1941df"></path>
                    </g>
                    <g id="g6128" transform="matrix(.72752 .082493 .082493 -.72752 548.53 803.02)">
                        <g id="g96" transform="matrix(.82225 -.56912 .56912 .82225 -248.1 409.96)">
                            <g id="g6086">
                                <path id="path90" d="m0 0 36.647 31.907c7.098 6.18 17.96 5.429 24.14-1.669l84.712-97.296c6.18-7.097 5.429-17.96-1.669-24.139l-36.646-31.907c-7.098-6.18-17.96-5.429-24.14 1.668l-84.708 97.29c-6.18 7.098-5.429 17.96 1.668 24.14" fill-rule="evenodd" transform="translate(-11.508 -4.665)" fill="#1941df"></path>
                                <g id="g92" transform="translate(-9.75 -21.283)">
                                    <path id="path94" d="m0 0 51.107 44.498c.1.087.252.076.338-.023l87.995-101.06c.087-.099.077-.251-.023-.338l-51.107-44.498c-.1-.087-.252-.076-.338.023l-87.998 101.06c-.087.101-.077.253.023.34" fill-rule="evenodd" fill="#ffffff"></path>
                                </g>
                                <path id="path98" d="m0 0 18.936 16.486c.513.448 1.298.394 1.746-.12.447-.513.392-1.299-.121-1.746l-18.936-16.487c-.514-.447-1.299-.393-1.746.121s-.393 1.299.121 1.746" fill-rule="evenodd" fill="#5085a1"></path>
                            </g>
                        </g>
                        <g id="g100" transform="matrix(.82225 -.56912 .56912 .82225 -219.32 265.02)">
                            <path id="path102" d="m0 0c1.743 1.517 4.386 1.334 5.902-.408 1.518-1.743 1.335-4.386-.407-5.903-1.743-1.516-4.386-1.335-5.902.409-1.518 1.742-1.335 4.384.407 5.902" fill-rule="evenodd" fill="#5085a1"></path>
                        </g>
                        <g id="g6092" fill="#696969">
                            <g id="g128" opacity=".86360" transform="matrix(.82225 -.56912 .56912 .82225 -228.61 348.46)">
                                <path id="path130" d="m0 0c7.571 6.592 19.052 5.798 25.644-1.772 6.591-7.572 5.797-19.052-1.774-25.644s-19.051-5.798-25.642 1.772c-6.592 7.572-5.799 19.052 1.772 25.644" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g132" opacity=".86360" transform="matrix(.82225 -.56912 .56912 .82225 -234.86 314.21)">
                                <path id="path134" d="m0 0c-3.099-.413-6.273-.025-9.192 1.143l6.77 16.872 2.422-18.015z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g136" opacity=".86360" transform="matrix(.82225 -.56912 .56912 .82225 -241.77 320.38)">
                                <path id="path138" d="m0 0c-2.59 1.037-4.979 2.688-6.937 4.937-3.817 4.383-5.158 10.077-4.141 15.374l17.849-3.439-6.771-16.872z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g140" opacity=".86360" transform="matrix(.82225 -.56912 .56912 .82225 -239.32 343.38)">
                                <path id="path142" d="m0 0c.739 3.853 2.726 7.494 5.913 10.27l11.936-13.708-17.849 3.438z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g144" opacity=".86360" transform="matrix(.82225 -.56912 .56912 .82225 -228.61 348.46)">
                                <path id="path146" d="m0 0 11.936-13.708 1.397 18.121c-4.686.360-9.508-1.083-13.333-4.413" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g148" transform="matrix(.82225 -.56912 .56912 .82225 -248.39 288.65)">
                                <path id="path150" d="m0 0 39.641 34.515.834-.957-39.642-34.515-.833.957z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g152" transform="matrix(.82225 -.56912 .56912 .82225 -248.08 285.87)">
                                <path id="path154" d="m0 0 39.641 34.515.834-.958-39.641-34.514-.834.957z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g156" transform="matrix(.82225 -.56912 .56912 .82225 -247.77 283.09)">
                                <path id="path158" d="m0 0 39.641 34.515.834-.958-39.641-34.514-.834.957z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g160" transform="matrix(.82225 -.56912 .56912 .82225 -247.46 280.32)">
                                <path id="path162" d="m0 0 39.641 34.515.834-.958-39.641-34.515-.834.958z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g164" transform="matrix(.82225 -.56912 .56912 .82225 -247.16 277.54)">
                                <path id="path166" d="m0 0 21.399 18.632.833-.958-21.398-18.632-.834.958z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g168" transform="matrix(.82225 -.56912 .56912 .82225 -249.65 299.9)">
                                <path id="path170" d="m0 0 39.641 34.515 4.439-5.099-39.641-34.515-4.439 5.099z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g172" transform="matrix(.82225 -.56912 .56912 .82225 -248.19 356.41)">
                                <path id="path174" d="m0 0 28.024 24.4.904-1.038-28.024-24.4-.904 1.038z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g176" transform="matrix(.82225 -.56912 .56912 .82225 -251.38 385.04)">
                                <path id="path178" d="m0 0 4.982 4.338 18.921-21.732-4.982-4.337-18.921 21.731z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g180" transform="matrix(.82225 -.56912 .56912 .82225 -242.59 375.09)">
                                <path id="path182" d="m0 0 4.982 4.338 11.787-13.538-4.982-4.338-11.787 13.538z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g184" transform="matrix(.82225 -.56912 .56912 .82225 -234.32 369.9)">
                                <path id="path186" d="m0 0 4.981 4.338 7.795-8.953-4.982-4.337-7.794 8.952z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g188" transform="matrix(.82225 -.56912 .56912 .82225 -227.35 376.27)">
                                <path id="path190" d="m0 0 4.982 4.337 11.451-13.15-4.983-4.338-11.45 13.151z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                            <g id="g192" transform="matrix(.82225 -.56912 .56912 .82225 -219.21 372.18)">
                                <path id="path194" d="m0 0 4.981 4.338 8.189-9.404-4.982-4.338-8.188 9.404z" fill-rule="evenodd" fill="#696969"></path>
                            </g>
                        </g>
                    </g>
                </g>
                <g id="g4857" transform="matrix(1.3532 0 0 1.3456 -300.53 -271.2)">
                    <rect id="rect4812" transform="scale(-1,1)" height="239.72" width="16.553" stroke="#000000" y="582.29" x="-276.95" stroke-width="4.0447" fill="#ffffff"></rect>
                    <g fill="#000000">
                        <rect id="rect4814" transform="scale(-1,1)" height="3.8568" width="14.769" y="596.22" x="-276.51"></rect>
                        <rect id="rect4816" transform="scale(-1,1)" height="3.8568" width="14.769" y="610.57" x="-276.51"></rect>
                        <rect id="rect4818" transform="scale(-1,1)" height="3.8568" width="14.769" y="624.91" x="-276.51"></rect>
                        <rect id="rect4820" transform="scale(-1,1)" height="3.8568" width="14.769" y="639.25" x="-276.51"></rect>
                        <rect id="rect4822" transform="scale(-1,1)" height="3.8568" width="14.769" y="653.59" x="-276.51"></rect>
                        <rect id="rect4824" transform="scale(-1,1)" height="3.8568" width="14.769" y="667.93" x="-276.51"></rect>
                        <rect id="rect4826" transform="scale(-1,1)" height="3.8568" width="14.769" y="682.27" x="-276.51"></rect>
                        <rect id="rect4828" transform="scale(-1,1)" height="3.8568" width="14.769" y="696.61" x="-276.51"></rect>
                        <rect id="rect4830" transform="scale(-1,1)" height="3.8568" width="14.769" y="710.95" x="-276.51"></rect>
                        <rect id="rect4832" transform="scale(-1,1)" height="3.8568" width="14.769" y="725.29" x="-276.51"></rect>
                        <rect id="rect4834" transform="scale(-1,1)" height="3.8568" width="14.769" y="739.63" x="-276.51"></rect>
                        <rect id="rect4836" transform="scale(-1,1)" height="3.8568" width="14.769" y="782.65" x="-276.81"></rect>
                        <rect id="rect4838" transform="scale(-1,1)" height="3.8568" width="14.769" y="753.97" x="-276.51"></rect>
                        <rect id="rect4840" transform="scale(-1,1)" height="3.8568" width="14.769" y="768.31" x="-276.51"></rect>
                    </g>
                </g>
                <g id="g4778" transform="matrix(-1.2146 0 0 1.3465 -608.03 -348.24)">
                    <rect id="rect4780" height="239.58" width="47.403" stroke="#000000" y="639.03" x="-607.28" stroke-width="4.2164" fill="#ffffff"></rect>
                    <g fill="#000000">
                        <rect id="rect4782" height="3.8568" width="35.07" y="652.96" x="-607.13"></rect>
                        <rect id="rect4784" height="3.8568" width="35.07" y="667.3" x="-607.13"></rect>
                        <rect id="rect4786" height="3.8568" width="35.07" y="681.64" x="-607.13"></rect>
                        <rect id="rect4788" height="3.8568" width="35.07" y="695.98" x="-607.13"></rect>
                        <rect id="rect4790" height="3.8568" width="35.07" y="710.32" x="-607.13"></rect>
                        <rect id="rect4792" height="3.8568" width="35.07" y="724.66" x="-607.13"></rect>
                        <rect id="rect4794" height="3.8568" width="35.07" y="739" x="-607.13"></rect>
                        <rect id="rect4796" height="3.8568" width="35.07" y="753.34" x="-607.13"></rect>
                        <rect id="rect4798" height="3.8568" width="35.07" y="767.68" x="-607.13"></rect>
                        <rect id="rect4800" height="3.8568" width="35.07" y="782.02" x="-607.13"></rect>
                        <rect id="rect4802" height="3.8568" width="35.07" y="796.36" x="-607.13"></rect>
                        <rect id="rect4804" height="3.8568" width="35.07" y="839.39" x="-607.85"></rect>
                        <rect id="rect4806" height="3.8568" width="35.07" y="810.71" x="-607.13"></rect>
                        <rect id="rect4808" height="3.8568" width="35.07" y="825.05" x="-607.13"></rect>
                    </g>
                </g>
                <g>
                    <ellipse id="ellipse6286" rx="19.369" ry="19.26" cy="789.23" cx="-.071472" fill="#1941df"></ellipse>
                    <rect id="rect6288" height="34.669" width="2.5645" y="800.39" x="-1.3537" fill="#696969"></rect>
                    <rect id="rect6284" height="73.214" width="5.8913" y="763.57" x="1284" fill="#696969"></rect>
                    <ellipse id="circle6278" rx="24.756" ry="24.617" cy="782.7" cx="1131.1" fill="#1941df"></ellipse>
                    <rect id="rect6280" height="37.311" width="2.8658" y="798.14" x="1129.7" fill="#696969"></rect>
                </g>
                <g id="g6104" transform="matrix(-.90794 0 0 1.1504 542.36 -173.15)">
                    <rect id="rect6106" height="239.58" width="47.403" stroke="#000000" y="637.16" x="-607.28" stroke-width="4.2164" fill="#f5f5f5"></rect>
                    <g fill="#000000">
                        <rect id="rect6108" height="3.8568" width="35.07" y="652.96" x="-607.13"></rect>
                        <rect id="rect6110" height="3.8568" width="35.07" y="667.3" x="-607.13"></rect>
                        <rect id="rect6112" height="3.8568" width="35.07" y="681.64" x="-607.13"></rect>
                        <rect id="rect6114" height="3.8568" width="35.07" y="695.98" x="-607.13"></rect>
                        <rect id="rect6116" height="3.8568" width="35.07" y="710.32" x="-607.13"></rect>
                        <rect id="rect6118" height="3.8568" width="35.07" y="724.66" x="-607.13"></rect>
                        <rect id="rect6120" height="3.8568" width="35.07" y="739" x="-607.13"></rect>
                        <rect id="rect6122" height="3.8568" width="35.07" y="753.34" x="-607.13"></rect>
                        <rect id="rect6124" height="3.8568" width="35.07" y="767.68" x="-607.13"></rect>
                        <rect id="rect6126" height="3.8568" width="35.07" y="782.02" x="-607.13"></rect>
                        <rect id="rect6128" height="3.8568" width="35.07" y="796.36" x="-607.13"></rect>
                        <rect id="rect6130" height="3.8568" width="35.07" y="839.39" x="-607.85"></rect>
                        <rect id="rect6132" height="3.8568" width="35.07" y="810.71" x="-607.13"></rect>
                        <rect id="rect6134" height="3.8568" width="35.07" y="825.05" x="-607.13"></rect>
                    </g>
                </g>
                <g id="g6136" transform="matrix(1.0115 0 0 1.1496 772.23 -107.33)">
                    <rect id="rect6138" transform="scale(-1,1)" height="239.72" width="16.553" stroke="#000000" y="580.42" x="-276.95" stroke-width="4.0447" fill="#ffffff"></rect>
                    <g fill="#000000">
                        <rect id="rect6140" transform="scale(-1,1)" height="3.8568" width="14.769" y="596.22" x="-276.51"></rect>
                        <rect id="rect6142" transform="scale(-1,1)" height="3.8568" width="14.769" y="610.57" x="-276.51"></rect>
                        <rect id="rect6144" transform="scale(-1,1)" height="3.8568" width="14.769" y="624.91" x="-276.51"></rect>
                        <rect id="rect6146" transform="scale(-1,1)" height="3.8568" width="14.769" y="639.25" x="-276.51"></rect>
                        <rect id="rect6148" transform="scale(-1,1)" height="3.8568" width="14.769" y="653.59" x="-276.51"></rect>
                        <rect id="rect6150" transform="scale(-1,1)" height="3.8568" width="14.769" y="667.93" x="-276.51"></rect>
                        <rect id="rect6152" transform="scale(-1,1)" height="3.8568" width="14.769" y="682.27" x="-276.51"></rect>
                        <rect id="rect6154" transform="scale(-1,1)" height="3.8568" width="14.769" y="696.61" x="-276.51"></rect>
                        <rect id="rect6156" transform="scale(-1,1)" height="3.8568" width="14.769" y="710.95" x="-276.51"></rect>
                        <rect id="rect6158" transform="scale(-1,1)" height="3.8568" width="14.769" y="725.29" x="-276.51"></rect>
                        <rect id="rect6160" transform="scale(-1,1)" height="3.8568" width="14.769" y="739.63" x="-276.51"></rect>
                        <rect id="rect6162" transform="scale(-1,1)" height="3.8568" width="14.769" y="782.65" x="-276.81"></rect>
                        <rect id="rect6164" transform="scale(-1,1)" height="3.8568" width="14.769" y="753.97" x="-276.51"></rect>
                        <rect id="rect6166" transform="scale(-1,1)" height="3.8568" width="14.769" y="768.31" x="-276.51"></rect>
                    </g>
                </g>
                <g id="g6072" transform="matrix(1.3254 0 0 1.6976 1773.6 -657.59)">
                    <rect id="rect6074" fill-opacity=".99608" height="239.63" width="60.523" stroke="#000000" y="639.25" x="-620.62" stroke-width="3.9207" fill="#1941df"></rect>
                    <g fill="#000000">
                        <rect id="rect6076" height="3.8568" width="35.07" y="652.96" x="-607.13"></rect>
                        <rect id="rect6078" height="3.8568" width="35.07" y="667.3" x="-607.13"></rect>
                        <rect id="rect6080" height="3.8568" width="35.07" y="681.64" x="-607.13"></rect>
                        <rect id="rect6082" height="3.8568" width="35.07" y="695.98" x="-607.13"></rect>
                        <rect id="rect6084" height="3.8568" width="35.07" y="710.32" x="-607.13"></rect>
                        <rect id="rect6086" height="3.8568" width="35.07" y="724.66" x="-607.13"></rect>
                        <rect id="rect6088" height="3.8568" width="35.07" y="739" x="-607.13"></rect>
                        <rect id="rect6090" height="3.8568" width="35.07" y="753.34" x="-607.13"></rect>
                        <rect id="rect6092" height="3.8568" width="35.07" y="767.68" x="-607.13"></rect>
                        <rect id="rect6094" height="3.8568" width="35.07" y="782.02" x="-607.13"></rect>
                        <rect id="rect6096" height="3.8568" width="35.07" y="796.36" x="-607.13"></rect>
                        <rect id="rect6098" height="3.8568" width="35.07" y="839.39" x="-607.85"></rect>
                        <rect id="rect6100" height="3.8568" width="35.07" y="810.71" x="-607.13"></rect>
                        <rect id="rect6102" height="3.8568" width="35.07" y="825.05" x="-607.13"></rect>
                    </g>
                </g>
                <path id="path4311" d="m674.58 579.88-75.238 253.22 145.32.9689z" stroke="#000000" stroke-width="10.175" fill="none"></path>
                <ellipse id="path4315" rx="30.82" ry="30.647" stroke="#0b0b0b" cy="581.87" cx="674.65" stroke-width="10.431" fill="#1941df"></ellipse>
                <g id="g6240" transform="matrix(.95054 0 0 .94521 59.143 45.95)">
                    <path id="path4918" d="m547.86 820.5v-333.56l-58.275 53.029v280.53z" fill-rule="evenodd" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)" stroke="#000000" stroke-width="4.6861" fill="#ffffff"></path>
                    <path id="path4874" d="m559.84 820.05v-326.28l-81.904 73.247v253.04z" fill-rule="evenodd" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)" stroke="#000000" stroke-width="5.3271" fill="#1941df"></path>
                    <g stroke="#000000" stroke-width="5.3271" fill="none">
                        <path id="path4876" d="m518.52 604.92 41.84-37.69" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4878" d="m518.52 670.08 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4880" d="m518.52 686.37 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4882" d="m518.52 702.65 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4884" d="m518.52 718.94 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4886" d="m518.52 735.23 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4888" d="m518.52 751.52 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4890" d="m518.52 767.81 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4908" d="m518.52 621.21 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4910" d="m518.52 637.5 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4912" d="m518.52 653.79 41.835-37.685" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4914" d="m477.53 592.21 81.336-74.154" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4916" d="m478.19 618.18 81.34-74.15" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                    </g>
                    <path id="path4952" d="m505.01 820.97v-199.62l-47.498 43.453v156.16z" fill-rule="evenodd" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)" stroke="#000000" stroke-width="5.4602" fill="#f5f5f5"></path>
                    <g stroke="#000000" stroke-width="5.3271" fill="none">
                        <path id="path4954" d="m473.17 668.86 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4956" d="m473.17 736.04 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4958" d="m473.17 752.84 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4960" d="m473.17 769.64 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4962" d="m473.17 786.43 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4964" d="m473.17 803.23 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4970" d="m473.17 685.66 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4972" d="m473.17 702.45 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                        <path id="path4974" d="m473.17 719.25 32.017-28.841" transform="matrix(1.3946 0 0 1.3946 72.106 -310.12)"></path>
                    </g>
                    <rect id="rect6183" height="88" width="18.444" y="750.06" x="1189.5" fill="#000000"></rect>
                </g>
                <path id="path4531" fill="#000000" d="m-430.41 400.01c.22123.016.44649.063.66834.14768.85387.32588 1.2366 1.1736.91156 2.016-.64875 1.6811-2.8026 1.9272-3.7353.42646-.78258-1.2592.6068-2.7026 2.1554-2.5901z"></path>
                <g id="g4759" transform="matrix(1.3421 0 0 1.719 995.36 -676.09)">
                    <rect id="rect4684" height="239.63" width="60.523" stroke="#000000" y="639.25" x="-620.62" stroke-width="3.9207" fill="#1941df"></rect>
                    <g fill="#000000">
                        <rect id="rect4697" height="3.8568" width="35.07" y="652.96" x="-607.13"></rect>
                        <rect id="rect4733" height="3.8568" width="35.07" y="667.3" x="-607.13"></rect>
                        <rect id="rect4735" height="3.8568" width="35.07" y="681.64" x="-607.13"></rect>
                        <rect id="rect4737" height="3.8568" width="35.07" y="695.98" x="-607.13"></rect>
                        <rect id="rect4739" height="3.8568" width="35.07" y="710.32" x="-607.13"></rect>
                        <rect id="rect4741" height="3.8568" width="35.07" y="724.66" x="-607.13"></rect>
                        <rect id="rect4743" height="3.8568" width="35.07" y="739" x="-607.13"></rect>
                        <rect id="rect4745" height="3.8568" width="35.07" y="753.34" x="-607.13"></rect>
                        <rect id="rect4747" height="3.8568" width="35.07" y="767.68" x="-607.13"></rect>
                        <rect id="rect4749" height="3.8568" width="35.07" y="782.02" x="-607.13"></rect>
                        <rect id="rect4751" height="3.8568" width="35.07" y="796.36" x="-607.13"></rect>
                        <rect id="rect4753" height="3.8568" width="35.07" y="839.39" x="-607.85"></rect>
                        <rect id="rect4755" height="3.8568" width="35.07" y="810.71" x="-607.13"></rect>
                        <rect id="rect4757" height="3.8568" width="35.07" y="825.05" x="-607.13"></rect>
                    </g>
                </g>
                <rect id="rect4776" height="249.89" width="32.862" stroke="#000000" y="585.11" x="129.01" stroke-width="5.3974" fill="#f5f5f5"></rect>
                <rect id="rect6179" opacity="0.29" height="83.069" width="1760.2" y="669.17" x="-333.35" fill="#1941df"></rect>
                <g id="train" transform="matrix(1.2297,0,0,-1.22279,662.1030333151332,827.88)" data-svg-origin="-1169.1802978515625 64.3114013671875" style="z-index: 0;">
                    <g id="g11188" fill="#000000">
                        <circle id="path11164" cx="-822.25" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11166" cx="-852.52" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11168" cx="-882.8" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11170" cx="-913.08" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11172" cx="-943.36" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11174" cx="-973.63" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11176" cx="-1003.9" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11178" cx="-1034.2" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11180" cx="-1064.5" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11182" cx="-1094.7" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11184" cx="-1125" cy="-69.608" r="5.2966" transform="scale(1,-1)"></circle>
                        <circle id="circle11186" cx="-1155" cy="-69.662" r="5.2966" transform="scale(1,-1)"></circle>
                    </g>
                    <g id="g11115" transform="translate(3.8136,2.1186)">
                        <path id="path918-4" fill="#8dc63f" d="m-921.35 95.627v-3.818c0-3.2055-2.6249-5.8304-5.8304-5.8304h-1.909v15.487h1.909c3.2055 0 5.8304-2.6249 5.8304-5.8383"></path>
                        <path id="path922-2" fill="#8dc63f" d="m-954.75 84.364v-3.818c0-3.2135-2.6249-5.8304-5.8304-5.8304h-1.909-1.909c-3.2135 0-5.8383 2.6169-5.8383 5.8304v3.818c0 2.943 2.2112 5.4008 5.0668 5.7747.25453.03977.50906.05568.77155.05568h3.818c3.2055 0 5.8304-2.6249 5.8304-5.8304"></path>
                        <g id="g321" stroke-linejoin="round" stroke="#231f20" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2.3862" fill="none">
                            <path id="path934-9" d="m-947.13 84.976-7.0155 7.0235"></path>
                            <path id="path938-8" d="m-947.13 78.947 7.0155 7.0155"></path>
                            <path id="path950-3" d="m-965.17 90.138c.25453.03977.50906.05568.77155.05568h3.818c3.2055 0 5.8304-2.6249 5.8304-5.8304v-3.818c0-3.2135-2.6249-5.8304-5.8304-5.8304h-1.909-1.909c-3.2135 0-5.8383 2.6169-5.8383 5.8304v3.818c0 2.943 2.2112 5.4008 5.0668 5.7747z"></path>
                        </g>
                        <path id="path1098-0" fill="#1c75bc" d="m-1014.1 87.84v-19.647h-16.95v19.647c0 2.0363 1.6544 3.6907 3.6986 3.6907h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907"></path>
                        <path id="path1102-8" fill="#1c75bc" d="m-1147.8 87.84v-19.647h-16.95v19.647c0 2.0363 1.6545 3.6907 3.6987 3.6907h9.5529c2.0442 0 3.6986-1.6545 3.6986-3.6907"></path>
                        <path id="path1106-8" d="m-1121.1 81.254v6.586c0 2.0363-1.6624 3.6907-3.6987 3.6907h-9.5608c-2.0363 0-3.6907-1.6545-3.6907-3.6907v-6.586c0-2.0442 1.6544-3.6987 3.6907-3.6987h9.5608c2.0363 0 3.6987 1.6545 3.6987 3.6987m26.742 0v6.586c0 2.0363-1.6545 3.6907-3.6907 3.6907h-9.5608c-2.0363 0-3.6987-1.6545-3.6987-3.6907v-6.586c0-2.0442 1.6624-3.6987 3.6987-3.6987h9.5608c2.0362 0 3.6907 1.6545 3.6907 3.6987m26.75 0v6.586c0 2.0363-1.6545 3.6907-3.6987 3.6907h-9.5529c-2.0442 0-3.6986-1.6545-3.6986-3.6907v-6.586c0-2.0442 1.6544-3.6987 3.6986-3.6987h9.5529c2.0442 0 3.6987 1.6545 3.6987 3.6987m26.75 0v6.586c0 2.0363-1.6544 3.6907-3.6986 3.6907h-9.5529c-2.0442 0-3.6987-1.6545-3.6987-3.6907v-6.586c0-2.0442 1.6545-3.6987 3.6987-3.6987h9.5529c2.0442 0 3.6986 1.6545 3.6986 3.6987m53.499 0v6.586c0 2.0363-1.6544 3.6907-3.6987 3.6907h-9.5529c-2.0442 0-3.6987-1.6545-3.6987-3.6907v-6.586c0-2.0442 1.6545-3.6987 3.6987-3.6987h9.5529c2.0442 0 3.6987 1.6545 3.6987 3.6987m26.75 0v6.586c0 2.0363-1.6544 3.6907-3.6987 3.6907h-9.5529c-2.0442 0-3.6987-1.6545-3.6987-3.6907v-6.586c0-2.0442 1.6545-3.6987 3.6987-3.6987h9.5529c2.0442 0 3.6987 1.6545 3.6987 3.6987m26.75 0v6.586c0 2.0363-1.6545 3.6907-3.6987 3.6907h-9.5529c-2.0442 0-3.6987-1.6545-3.6987-3.6907v-6.586c0-2.0442 1.6544-3.6987 3.6987-3.6987h9.5529c2.0442 0 3.6987 1.6545 3.6987 3.6987m26.75 0v6.586c0 2.0363-1.6544 3.6907-3.6987 3.6907h-9.5529c-2.0442 0-3.6987-1.6545-3.6987-3.6907v-6.586c0-2.0442 1.6544-3.6987 3.6987-3.6987h9.5529c2.0442 0 3.6987 1.6545 3.6987 3.6987m53.491 0v6.586c0 2.0363-1.6545 3.6907-3.6907 3.6907h-9.5608c-2.0362 0-3.6907-1.6545-3.6907-3.6907v-6.586c0-2.0442 1.6544-3.6987 3.6907-3.6987h9.5608c2.0362 0 3.6907 1.6545 3.6907 3.6987m49.825-13.061h-76.566v19.647c0 2.0363-1.6624 3.6907-3.6987 3.6907h-9.5608c-2.0362 0-3.6907-1.6545-3.6907-3.6907v-19.647h-116.8v19.647c0 2.0363-1.6545 3.6907-3.6987 3.6907h-9.5529c-2.0442 0-3.6986-1.6545-3.6986-3.6907v-19.647h-116.79v19.647c0 2.0363-1.6544 3.6907-3.6986 3.6907h-9.5529c-2.0442 0-3.6987-1.6545-3.6987-3.6907v-19.647h-1.4158c-3.6589 0-6.6178 2.9589-6.6178 6.6178v18.446c0 3.6589 2.9589 6.6178 6.6178 6.6178h44.376 19.193 103.18 19.193 103.18 19.193 12.87v-9.9426c0-6.8405 5.544-12.377 12.377-12.377h27.45c.91472-2.9589 1.4079-6.1008 1.4079-9.362" fill="#1941df"></path>
                        <path id="path1110-4" fill="#ffffff" stroke="#000000" d="m-805.2 77.555h-27.45c-6.8326 0-12.377 5.5361-12.377 12.377v9.9426h9.5449c8.7495 0 16.672-3.5475 22.407-9.2824 3.6032-3.5953 6.3394-8.0575 7.8746-13.037"></path>
                        <path id="path1114-9" fill="#27aae1" d="m-853.61 87.84v-6.586c0-2.0442-1.6545-3.6987-3.6907-3.6987h-9.5608c-2.0362 0-3.6907 1.6545-3.6907 3.6987v6.586c0 2.0363 1.6544 3.6907 3.6907 3.6907h9.5608c2.0362 0 3.6907-1.6545 3.6907-3.6907"></path>
                        <path id="path1118-9" fill="#ef4136" d="m-857.89 104.28v-4.4066h-19.193v4.4066h9.5927 9.6006z"></path>
                        <path id="path1122-2" fill="#ff1493" d="m-880.35 87.84v-19.647h-16.95v19.647c0 2.0363 1.6545 3.6907 3.6907 3.6907h9.5608c2.0362 0 3.6987-1.6545 3.6987-3.6907"></path>
                        <g id="g333" fill="#27aae1">
                            <path id="path1126-4" d="m-907.1 87.84v-6.586c0-2.0442-1.6544-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6544 3.6907 3.6987 3.6907h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907"></path>
                            <path id="path1130-9" d="m-933.85 87.84v-6.586c0-2.0442-1.6545-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6544 3.6907 3.6987 3.6907h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907"></path>
                            <path id="path1134-3" d="m-960.6 87.84v-6.586c0-2.0442-1.6544-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6545 3.6907 3.6987 3.6907h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907"></path>
                        </g>
                        <path id="path1138-0" fill="#ef4136" d="m-980.27 104.28v-4.4066h-19.193v4.4066h9.6006 9.5926z"></path>
                        <g id="g339" fill="#27aae1">
                            <path id="path1142-0" d="m-987.35 87.84v-6.586c0-2.0442-1.6544-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6545 3.6907 3.6987 3.6907h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907"></path>
                            <path id="path1146-9" d="m-1040.9 87.84v-6.586c0-2.0442-1.6544-3.6987-3.6986-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6545 3.6907 3.6987 3.6907h9.5529c2.0442 0 3.6986-1.6545 3.6986-3.6907"></path>
                            <path id="path1150-3" d="m-1067.6 87.84v-6.586c0-2.0442-1.6545-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6986 1.6545-3.6986 3.6987v6.586c0 2.0363 1.6544 3.6907 3.6986 3.6907h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907"></path>
                            <path id="path1154-1" d="m-1094.4 87.84v-6.586c0-2.0442-1.6545-3.6987-3.6907-3.6987h-9.5608c-2.0363 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6624 3.6907 3.6987 3.6907h9.5608c2.0362 0 3.6907-1.6545 3.6907-3.6907"></path>
                        </g>
                        <path id="path1158-4" fill="#ef4136" d="m-1102.6 104.28v-4.4066h-19.193v4.4066h9.6006 9.5926z"></path>
                        <path id="path1162-1" fill="#27aae1" d="m-1121.1 87.84v-6.586c0-2.0442-1.6624-3.6987-3.6987-3.6987h-9.5608c-2.0363 0-3.6907 1.6545-3.6907 3.6987v6.586c0 2.0363 1.6544 3.6907 3.6907 3.6907h9.5608c2.0363 0 3.6987-1.6545 3.6987-3.6907"></path>
                        <g id="g347" stroke-linejoin="round" stroke="#000000" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2.3862">
                            <path id="path1230-8" fill="none" d="m-1122 99.874h-44.376c-3.6589 0-6.6179-2.9589-6.6179-6.6178v-18.446c0-3.6589 2.959-6.6178 6.6179-6.6178h1.4158 16.95 116.79 16.95 116.8 16.95 76.566c0 3.2612-.49315 6.4031-1.4079 9.362-1.5351 4.9793-4.2714 9.4415-7.8746 13.037-5.7349 5.7349-13.657 9.2824-22.407 9.2824h-9.5449-12.87"></path>
                            <path id="path1234-9" fill="#000000" d="m-999.63 99.874h-103.18"></path>
                            <path id="path1238-3" fill="none" d="m-877.25 99.874h-103.18"></path>
                            <path id="path1242-3" fill="#f5f5f5" d="m-877.25 99.874v4.4066h9.5926 9.6006v-4.4066h-19.193z"></path>
                            <path id="path1246-3" fill="none" d="m-867.66 104.28-21.802 21.81"></path>
                            <path id="path1250-6" fill="#f5f5f5" d="m-999.63 99.874v4.4066h9.6006 9.5926v-4.4066h-19.193z"></path>
                            <path id="path1254-2" fill="none" d="m-990.02 104.28-21.81 21.81"></path>
                            <path id="path1258-5" fill="#f5f5f5" d="m-1122 99.874v4.4066h9.6006 9.5927v-4.4066h-19.193z"></path>
                            <path id="path1262-7" fill="none" d="m-1112.4 104.28-21.81 21.81"></path>
                        </g>
                        <g id="g358" stroke-linejoin="round" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2.3862">
                            <path id="path1270-4" fill="none" stroke="#231f20" d="m-845.2 99.874v-9.9426c0-6.8405 5.544-12.377 12.377-12.377h27.45"></path>
                            <path id="path1274-0" fill="#ffffff" stroke="#000000" d="m-867.04 91.53h9.5608c2.0362 0 3.6907-1.6545 3.6907-3.6907v-6.586c0-2.0442-1.6545-3.6987-3.6907-3.6987h-9.5608c-2.0362 0-3.6907 1.6545-3.6907 3.6987v6.586c0 2.0363 1.6544 3.6907 3.6907 3.6907z"></path>
                            <path id="path1278-8" fill="#f5f5f5" stroke="#000000" d="m-897.47 68.193v19.647c0 2.0363 1.6544 3.6907 3.6907 3.6907h9.5608c2.0362 0 3.6987-1.6545 3.6987-3.6907v-19.647"></path>
                        </g>
                        <g stroke-linejoin="round" stroke="#000000" stroke-linecap="round" stroke-miterlimit="10" stroke-width="2.3862">
                            <g id="g363" fill="#ffffff">
                                <path id="path1282-0" d="m-920.52 91.53h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907v-6.586c0-2.0442-1.6545-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6545 3.6907 3.6987 3.6907z"></path>
                                <path id="path1286-6" d="m-947.28 91.53h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907v-6.586c0-2.0442-1.6545-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6545 3.6907 3.6987 3.6907z"></path>
                                <path id="path1290-4" d="m-974.02 91.53h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907v-6.586c0-2.0442-1.6545-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6544 3.6907 3.6987 3.6907z"></path>
                                <path id="path1294-9" d="m-1000.8 91.53h9.5529c2.0442 0 3.6987-1.6545 3.6987-3.6907v-6.586c0-2.0442-1.6544-3.6987-3.6987-3.6987h-9.5529c-2.0442 0-3.6986 1.6545-3.6986 3.6987v6.586c0 2.0363 1.6544 3.6907 3.6986 3.6907z"></path>
                            </g>
                            <path id="path1298-9" d="m-1031.2 68.193v19.647c0 2.0363 1.6544 3.6907 3.6987 3.6907h9.5528c2.0442 0 3.6987-1.6545 3.6987-3.6907v-19.647" fill="#f5f5f5"></path>
                            <g id="g370" fill="#ffffff">
                                <path id="path1302-8" d="m-1054.3 91.53h9.5529c2.0442 0 3.6986-1.6545 3.6986-3.6907v-6.586c0-2.0442-1.6544-3.6987-3.6986-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6545 3.6907 3.6987 3.6907z"></path>
                                <path id="path1306-0" d="m-1081 91.53h9.5529c2.0442 0 3.6986-1.6545 3.6986-3.6907v-6.586c0-2.0442-1.6544-3.6987-3.6986-3.6987h-9.5529c-2.0442 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6545 3.6907 3.6987 3.6907z"></path>
                                <path id="path1310-7" d="m-1107.8 91.53h9.5608c2.0363 0 3.6907-1.6545 3.6907-3.6907v-6.586c0-2.0442-1.6544-3.6987-3.6907-3.6987h-9.5608c-2.0363 0-3.6987 1.6545-3.6987 3.6987v6.586c0 2.0363 1.6624 3.6907 3.6987 3.6907z"></path>
                                <path id="path1314-9" d="m-1134.5 91.53h9.5608c2.0362 0 3.6986-1.6545 3.6986-3.6907v-6.586c0-2.0442-1.6624-3.6987-3.6986-3.6987h-9.5608c-2.0363 0-3.6908 1.6545-3.6908 3.6987v6.586c0 2.0363 1.6545 3.6907 3.6908 3.6907z"></path>
                            </g>
                            <path id="path1318-5" d="m-1165 68.193v19.647c0 2.0363 1.6545 3.6907 3.6987 3.6907h9.5529c2.0442 0 3.6986-1.6545 3.6986-3.6907v-19.647" fill="#f5f5f5"></path>
                        </g>
                    </g>
                </g>
                <g fill="#000000">
                    <rect id="rect6010" height="8.2288" width="1759.6" y="749.98" x="-331.04"></rect>
                    <rect id="rect6021" height="2.366" width="1759.1" stroke="#000000" y="668.59" x="-330.86" stroke-width="1.0796"></rect>
                    <rect id="rect6185" height="80.505" width="16.302" y="752.05" x="482.73"></rect>
                    <rect id="rect6187" height="83.179" width="16.73" y="754.13" x="144.41"></rect>
                    <rect id="rect6189" height="78.452" width="17.11" y="757.91" x="-205.78"></rect>
                    <rect id="rect5709" height="6.0572" width="1772.4" y="830.15" x="-339.76"></rect>
                    <rect id="rect8535" height="80.505" width="16.302" y="752.8" x="830.36"></rect>
                </g>
            </g>
        </svg>
    `;
}