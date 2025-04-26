
import global from "./global.js"
import { __html, attr, onClick, getSetting, log } from './helpers.js'
import { getAppKubeconfig } from './app-status-helpers.js'
import { validPath, getDevspacePath, run_script } from './dev-tools.js'
import child_process from "child_process"
import fs from "fs"
import yaml from 'js-yaml';

export class DevToolsConsole {

    constructor(global) {

        this.global = global;
    }

    init() {

        this.listeners();
    }

    listeners() {

        // start console
        onClick('.start-terminal', e => {

            e.preventDefault();

            this.console(e.currentTarget.dataset.id);
        });
    }

    console(id) {

        let cache = getSetting(id);

        let app = global.state.apps.filter(app => app.id == id)[0];

        if (!validPath(cache)) return;

        document.querySelector('.devToolsConsoleCont[data-id=' + id + '] ul').innerHTML = "";

        const devspaceFiles = fs.readdirSync(cache.path).filter(file => file.startsWith('devspace') && file.endsWith('.yaml'));

        log(`Found devspace files: ${devspaceFiles}`);

        devspaceFiles.forEach(file => {

            document.querySelector('.devToolsConsoleCont[data-id=' + id + '] ul').innerHTML += `<li><a class="dropdown-item po dev-tools-console-start" data-file="${file}" href="#">` + file.replace('devspace-', '').replace('.yaml', '') + `</a></li>`;
        });

        if (devspaceFiles.length == 0) return;

        if (devspaceFiles.length == 1) {

            this.openConsole(app, devspaceFiles[0]);

            // Close the dropdown menu
            const dropdownMenu = document.querySelector('.devToolsConsoleCont .dropdown-menu.show');
            if (dropdownMenu) {
                dropdownMenu.classList.remove('show');
            }
        }

        if (devspaceFiles.length > 1) {

            onClick('.dev-tools-console-start', e => {

                e.preventDefault();

                let file = e.currentTarget.dataset.file;

                this.openConsole(app, file);

                // Close the dropdown menu
                const dropdownMenu = document.querySelector('.devToolsConsoleCont .dropdown-menu.show');
                if (dropdownMenu) {
                    dropdownMenu.classList.remove('show');
                }
            });
        }
    }

    openConsole(app, file) {

        let kubeconfig = getAppKubeconfig(app.id);

        if (!kubeconfig && app.clusters[0] != 'local') return;

        if (app.clusters[0] == 'local') kubeconfig = "";

        let cache = getSetting(app.id);

        let cb = () => { };

        let app_file = file.replace('devspace-', 'app-').replace('devspace', 'app');

        let container = "";

        if (fs.existsSync(`${cache.path}/${app_file}`)) {

            let app = yaml.loadAll(fs.readFileSync(`${cache.path}/${app_file}`, 'utf8'));

            if (app[0].metadata.name.length > 1) {

                container = app[0].metadata.name;
            }

        } else {
            log(`File ${app_file} does not exist in path ${cache.path}`);
        }

        let args = [];

        if (kubeconfig == "") child_process.spawn(
            `echo "cd ${cache.path} && kubectl config use-context minikube && devspace -n ${app.id} ${container.length ? '-c ' + container : ""} enter --config=${file}; rm /tmp/console.sh" > /tmp/console.sh; chmod +x /tmp/console.sh; open -a Terminal /tmp/console.sh`,
            args,
            {
                encoding: 'utf8',
                stdio: 'pipe',
                env: { ...process.env, FORCE_COLOR: true },
                shell: true
            }
        );

        log(`echo "cd ${cache.path} && devspace -n ${app.id} enter --config=${file} --kubeconfig=${kubeconfig}; rm /tmp/console.sh" > /tmp/console.sh; chmod +x /tmp/console.sh; open -a Terminal /tmp/console.sh`)

        if (kubeconfig != "") child_process.spawn(
            `echo "cd ${cache.path} && devspace -n ${app.id} ${container.length ? '-c ' + container : ""} enter --config=${file} --kubeconfig=${kubeconfig}; rm /tmp/console.sh" > /tmp/console.sh; chmod +x /tmp/console.sh; open -a Terminal /tmp/console.sh`,
            args,
            {
                encoding: 'utf8',
                stdio: 'pipe',
                env: { ...process.env, FORCE_COLOR: true },
                shell: true
            }
        );
    }
}

