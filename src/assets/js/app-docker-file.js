
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
    }

    view() {

        return `
            <div class="col-sm-7 pt-3 mb-3">
                <h5 class="card-title">${__html('Docker File')}</h5>
                <p class="form-text">${__html('Edit docker file below.')}</p>
                <div class="docker-editor">   
                    <textarea id="appDocker" type="text" value="" autocomplete="off"  rows="10" class="form-control monospace"></textarea>
                </div>
                <div class="clearfix"></div>
            </div>
        `;
    }

    render() {

        let path = getDefaultAppPath() + require('path').sep + this.app.id + require('path').sep + 'Dockerfile';

        // console.log("render Dockerfile path" + path);

        global.state.editor = ace.edit("appDocker", {
            maxLines: 20,
            minLines: 10,
            fontSize: 14,
            theme: 'ace/theme/terminal',
            mode: 'ace/mode/sh',
            tabSize: 4
        });

        global.state.editor.setValue("");
        global.state.editor.clearSelection();

        // read docker file
        if (fs.existsSync(path)) {

            try {

                // available settings
                // ace.config.set('basePath', '/node_modules/ace-builds/src-min-noconflict');
                // ace.config.set('basePath', 'http://localhost:9080/js/ace/');
                // global.state.editor.setValue("test", null, 2);
                // global.state.editor.getSession().setMode("json");
                // global.state.editor.setTheme("ace/theme/monokai");
                global.state.editor.setValue(fs.readFileSync(path, 'utf8'));
                global.state.editor.clearSelection();

            } catch (e) {

            }
        }

        this.dockerFileOriginal = global.state.editor.getValue();
    }

    listeners() {

    }

    save() {

        if (this.dockerFileOriginal == global.state.editor.getValue()) { log("Docker file not changed"); return; }

        log("Saving docker file")

        let path = getDefaultAppPath() + require('path').sep + this.app.slug;

        try { fs.writeFileSync(path + '/Dockerfile', global.state.editor.getValue(), 'utf-8'); } catch (e) { console.log(e); }
    }

    get() {

        return global.state.editor.getValue();
    }

    init() {

        document.querySelector('docker-file').innerHTML = this.view();

        this.render();

        this.listeners();

        // check docker file for changes
        this.interval = setInterval(() => {

            let path = getDefaultAppPath() + require('path').sep + this.app.id + require('path').sep + 'Dockerfile';

            // console.log("render Dockerfile path" + path);

            // read docker file
            if (fs.existsSync(path)) {

                try {

                    let dockerFile = fs.readFileSync(path, 'utf8');

                    if (this.dockerFileOriginal == dockerFile) return;

                    log("Updating docker file from file");

                    global.state.editor.setValue(fs.readFileSync(path, 'utf8'));
                    global.state.editor.clearSelection();

                } catch (e) {

                }
            }

            this.dockerFileOriginal = global.state.editor.getValue();

        }, 5000);
    }

    destroy() {

        if (this.interval) clearInterval(this.interval);
    }
}