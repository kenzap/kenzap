import { run_script } from './dev-tools.js'
import { __html, attr, html, onClick, getSetting, toast, onChange, showLoader, hideLoader, API, loadDependencies, log } from './helpers.js'
const exec = require('child_process').exec;
const os = require('os');

export function installLocalCluster(cb) {

    const platform = os.platform();

    log(`Detected OS: ${platform}`);
    if (platform === 'linux') {
        toast('Running on a Linux-based system.', 'info');
    } else if (platform === 'darwin') {
        toast('Running on macOS.', 'info');
        installLocalClusterMac(cb);
    } else if (platform === 'win32') {
        toast('Running on Windows.', 'info');
    } else {
        toast('Unsupported operating system.', 'error');
        if (cb) cb(false);
        return;
    }
}

export function installLocalClusterMac(cb) {

    let step1 = () => {

        log('brew --version');

        exec('brew --version', (error, stdout, stderr) => {
            if (error) {
                logModal('Installing Homebrew...');
                installHomebrew(cb);
                return;
            }
            // toast('Homebrew is installed.', 'success');
            step2();
        });
    }

    let step2 = () => {

        log('brew install ubuntu/microk8s/microk8s');

        logModal('Installing MicroK8s...');

        exec('brew install ubuntu/microk8s/microk8s', (error, stdout, stderr) => {

            if (error) {

                if (error.toString().includes('already installed')) {
                    log('MicroK8s is already installed.', 'success');
                    step3();
                    return;
                }

                log('Error installing MicroK8s: ', error.toString());
                return;
            }

            log('MicroK8s is installed.', 'success');
            step4();
        });
    }

    let step3 = () => {

        log('microk8s install');

        exec('microk8s install', (error, stdout, stderr) => {
            if (error) {
                // toast('MicroK8s is not installed or not running locally.', 'error');
                if (cb) cb(false);
                return;
            }
            log('MicroK8s is installed and running locally.', 'success');
            step4();
        });
    }

    let step4 = () => {

        log('multipass --version');

        exec('multipass --version', (error, stdout, stderr) => {
            if (error) {

                log('Multipass is not installed.');
                logModal('Installing multipass...');

                exec('brew install --cask multipass', (error, stdout, stderr) => {
                    if (error) {
                        log('Error installing multipass: ', error.toString());
                        logModal('Failed to install multipass. ' + error.toString());
                        if (cb) cb(false);
                        return;
                    }
                    log('Multipass installation output: ', stdout.toString());
                    log('Multipass installation errors (if any): ', stderr.toString());
                    logModal('Multipass installed successfully.');
                    step5();
                });
                return;
            }

            log('Multipass is already installed.', 'success');
            step5();
        });
    }


    let step5 = () => {

        log('microk8s enable dashboard dns registry istio');

        logModal('Enabling MicroK8s modules...');

        exec('microk8s enable dashboard dns registry istio', (error, stdout, stderr) => {
            if (error) {

                log('Error enabling MicroK8s addons: ', error.toString());

                if (error.toString().includes('multipass')) {

                    log('Installing multipass');

                    logModal('Installing multipass...');

                    exec('brew install --cask multipass', (error, stdout, stderr) => {

                        if (error) {
                            log('Error installing multipass: ', error.toString());
                            logModal('Failed to install multipass. ' + error.toString());
                            if (cb) cb(false);
                            return;
                        }
                        logModal('Multipass installed successfully.');
                        step4();
                    });
                    return
                }

                if (cb) cb(true);
                return;
            }

            log('microk8s enable dashboard dns registry istio');

            logModal('MicroK8s successfully installed.');

            if (cb) cb(true);
        });
    }

    step1();
}

export function installHomebrew(cb) {

    const script = `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`;

    run_script(script, [], () => {
        log('Homebrew installed successfully.');
        installLocalClusterMac(cb);
    }, 0, (error) => {
        log('Error installing Homebrew: ', error.toString());
        // toast('Failed to install Homebrew.', 'error');
        if (cb) cb(false);
    }, (data) => {
        log('Homebrew installation output: ', data.toString());
    });

    // const script = `$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)`;

    // run_script(script, [], () => { log(`Homebrew installed`); step2(); }, 0, (error) => { log('Cluster 1 E: ', error.toString()); }, (data) => { log('Cluster O: ', data.toString()); });
}

export function logModal(msg) {

    if (document.querySelector('console-output-modal')) document.querySelector('console-output-modal').innerHTML = `
        <div class="console-line form-text text-center text-secondary my-5">
            ${msg}
        </div>
    `;
}