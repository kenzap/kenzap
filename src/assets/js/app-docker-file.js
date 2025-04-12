import global from "./global.js"
import { __html, getDefaultAppPath } from './helpers.js'
import "../scss/docker-apps.css"
import * as ace from 'ace-builds/src-noconflict/ace';
import 'ace-builds/webpack-resolver'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/mode-javascript'
import fs from "fs"
import { log } from "console";

export class DockerFile {

    constructor(global) {
        this.global = global;
        this.app = this.global.state.app;
        if (!this.app) this.app = { dtc: [], docker: "" };
        this.dockerFiles = [];
        this.dockerFileOriginals = {};
    }

    view() {
        return `
            <div class="col-sm-7 pt-3 mb-3">
                <h5 class="card-title">${__html('Docker Files')}</h5>
                <p class="form-text">${__html('Edit Docker files below.')}</p>
                <div id="docker-files-container">
                    ${this.dockerFiles.map(file => `
                        <div class="docker-editor mb-3">
                            <textarea id="${file}" type="text" value="" autocomplete="off" rows="10" class="form-control monospace"></textarea>
                        </div>
                    `).join('')}
                </div>
                <div class="clearfix"></div>
            </div>
        `;
    }

    render() {

        this.dockerFiles.forEach(file => {
            const filePath = this.basePath + file;

            global.state.editors = global.state.editors || {};
            global.state.editors[file] = ace.edit(file, {
                maxLines: 20,
                minLines: 10,
                fontSize: 14,
                theme: 'ace/theme/terminal',
                mode: 'ace/mode/sh',
                tabSize: 4
            });

            global.state.editors[file].setValue("");
            global.state.editors[file].clearSelection();

            if (fs.existsSync(filePath)) {
                try {
                    global.state.editors[file].setValue(fs.readFileSync(filePath, 'utf8'));
                    global.state.editors[file].clearSelection();
                } catch (e) {
                    console.error(e);
                }
            }

            this.dockerFileOriginals[file] = global.state.editors[file].getValue();
        });
    }

    save() {
        const basePath = getDefaultAppPath() + require('path').sep + this.app.id + require('path').sep;

        this.dockerFiles.forEach(file => {
            const editor = global.state.editors[file];
            if (this.dockerFileOriginals[file] === editor.getValue()) {
                log(`${file} not changed`);
                return;
            }

            log(`Saving Dockerfile ${file}`);

            try {
                fs.writeFileSync(basePath + file, editor.getValue(), 'utf-8');
            } catch (e) {
                console.error(e);
            }
        });
    }

    init() {

        this.basePath = getDefaultAppPath() + require('path').sep + this.app.id + require('path').sep;
        this.dockerFiles = fs.readdirSync(this.basePath).filter(file => file.startsWith('Dockerfile'));


        document.querySelector('docker-file').innerHTML = this.view();
        this.render();

        this.interval = setInterval(() => {
            this.dockerFiles.forEach(file => {
                const filePath = this.basePath + file;

                if (fs.existsSync(filePath)) {
                    try {
                        const dockerFileContent = fs.readFileSync(filePath, 'utf8');
                        if (this.dockerFileOriginals[file] === dockerFileContent) return;

                        log(`Updating ${file} from file`);
                        global.state.editors[file].setValue(dockerFileContent);
                        global.state.editors[file].clearSelection();
                    } catch (e) {
                        console.error(e);
                    }
                }

                this.dockerFileOriginals[file] = global.state.editors[file].getValue();
            });
        }, 5000);
    }

    get() {
        return Object.entries(this.dockerFileOriginals).map(([key, value]) => ({
            name: key,
            content: value
        }));
    }

    destroy() {
        if (this.interval) clearInterval(this.interval);
    }
}
