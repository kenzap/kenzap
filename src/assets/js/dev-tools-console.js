
import global from "./global.js"
import { __html, attr, onClick, getSetting, log, toast } from './helpers.js'
import { validPath } from './dev-tools.js'
import { ipcRenderer } from 'electron'
import fs from "fs"

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

            document.querySelector('.devToolsConsoleCont[data-id=' + id + '] ul').innerHTML += `<li><a class="dropdown-item po dev-tools-console-start" data-file="${attr(file)}" href="#">` + attr(file.replace('devspace-', '').replace('.yaml', '')) + `</a></li>`;
        });

        if (devspaceFiles.length == 0) return;

        if (devspaceFiles.length == 1) {

            this.openConsole(app, devspaceFiles[0]);

            // Close the dropdown menu
            const dropdownMenu = document.querySelector('.devToolsConsoleCont[data-id=' + id + '] .dropdown-menu.show');
            if (dropdownMenu) {
                dropdownMenu.classList.remove('show');
            }
        }

        if (devspaceFiles.length > 1) {

            onClick('.devToolsConsoleCont[data-id=' + id + '] .dev-tools-console-start', e => {

                e.preventDefault();

                let file = e.currentTarget.dataset.file;

                this.openConsole(app, file);

                // Close the dropdown menu
                const dropdownMenu = document.querySelector('.devToolsConsoleCont[data-id=' + id + '] .dropdown-menu.show');
                if (dropdownMenu) {
                    dropdownMenu.classList.remove('show');
                }
            });
        }
    }

    async openConsole(app, file) {
        try {
            if (!app) throw new Error(__html('Select an app before opening its terminal.'));
            const result = await ipcRenderer.invoke('app-pod-console-open', { appId: app.id, file });
            if (!result || !result.ok) throw new Error(result && result.error || __html('Unable to open the pod terminal.'));
        } catch (error) {
            toast(error.message);
        }
    }
}
