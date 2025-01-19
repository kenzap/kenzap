
import global from "./global.js"
import { __html, attr, onClick, toast, getToken, getKenzapSettings, saveKenzapSettings, onKeyUp, onChange } from './helpers.js'
import * as ace from 'ace-builds/src-noconflict/ace';
import 'ace-builds/webpack-resolver'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/mode-javascript'
import fs from "fs"
import { AppList } from '../../renderer/app-list.js'
import "../scss/docker-apps.css"

export class AppProjects {

    constructor(global) {

        global.state.settings = getKenzapSettings();

        this.app = global.state.app;

        this.projects = global.state.settings.projects;

        global.cb = () => { new AppList(); }
    }

    render() {

        // add variable
        onClick('.add-project', e => {

            e.preventDefault();

            // get modal html
            this.modal = document.querySelector(".modal");

            // set wide screen
            document.querySelector(".modal-dialog").classList.add("modal-wide");

            // set product modal title
            document.querySelector(".modal-title").innerHTML = __html("Add New Project");

            // buttons
            document.querySelector(".modal-footer").innerHTML =
                `
            <div class="btn-group" role="group" aria-label="Basic example">
                <button id="btn-middle" type="button" class="btn btn-outline-dark close-modal" data-bs-dismiss="modal" tabindex="-1">${__html("Close")}</button>
                <button id="btn-primary" type="button" class="btn btn-outline-primary save-projects" data-bs-dismiss="modal" tabindex="-1">${__html("Save changes")}</button>
            </div>
            `;

            let html = `
            <div class="form-cont">
                <div class="form-group- mt-3">
                    <div class="form-group- mt-1">
                        <div class="name-cont form-group">
                            <label for="env-name">${__html('Project Name')}</label>
                            <div class="input-name mb-0">
                                <div class="card-title d-flex align-items-center justify-content-between bd-highlight">
                                    <input id="project-name" type="text" class="project-name form-control" value="${""}" >
                                    <div class="d-flex ms-2 po " role="status" aria-hidden="true">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-plus-circle po add-project-btn ms-2 form-text" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16">
                                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                                        </svg>
                                    </div>
                                </div
                                <div class="invalid-feedback env-name-notice"></div>
                                <p class="form-text d-none-">${__html("Name of the project to organise apps.")}</p>
                            </div>
                        </div>
                        <div class="projects-cont mb-3">
                            <div class="table-responsive">
                                <table class="table table-hover table-borderless align-middle table-striped table-p-list mb-0" style="min-width: 400px;">
                                    <tbody class="project-list">
        
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;

            this.modal.querySelector(".modal-body").innerHTML = html;
            this.modal.querySelector("#project-name").focus();

            // render HTML
            this.table();

            onClick(".add-project-btn", e => {

                let name = document.querySelector("#project-name").value.trim();

                if (name.length < 2) { alert(__html('Project name is too short')); return; }

                this.projects.push({ id: getToken(5), "project": name, apps: [], current: false });

                this.table();
            });

            onClick(".save-projects", e => {

                global.state.projects = this.projects;

                setTimeout(() => { toast("Changes applied"); }, 100);

                saveKenzapSettings({ "projects": this.projects });

                if (typeof global.cb === 'function') global.cb();
            });
        });
    }

    listeners() {

        onChange(".project-select", e => {

            this.projects.forEach((project, i) => {

                project.current = false;

                if (project.id == e.currentTarget.value) { this.projects[i].current = true; }
            });

            saveKenzapSettings({ "projects": this.projects });

            if (typeof global.cb === 'function') global.cb();
        });
    }

    table() {

        this.modal.querySelector(".project-list").innerHTML = this.projects.map((project, i) => {

            return `
                <tr>
                    <td class="text-start" style="min-width:50px;">
                        <span class="project-name-row p-1" data-id="${attr(project.id)}" data-i="${i}" contenteditable="true">${(project.project)}</span>
                    </td>
                    <td class="text-end">
                        <div class="dropdown ${i == 0 ? "d-none" : ""}">
                            <svg id="projectAction${i}" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-three-dots-vertical dropdown-toggle po" viewBox="0 0 16 16">
                                <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                            </svg>
                            <ul class="dropdown-menu" aria-labelledby="projectAction${i}" style="">
                                <li class="d-none"><a class="dropdown-item po add-env-var" href="#" data-bs-toggle="modal" data-bs-target=".modal" data-action="edit" data-id="${i}" >${__html('Edit')}</a></li>
                                <li class="d-none"><hr class="dropdown-divider "></li>
                                <li><a class="dropdown-item po project-remove form-text" href="#" data-type="remove" data-id="${attr(project.id)}" >${__html('Remove')}</a></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            `;

        }).join('');

        onClick('.project-remove', e => {

            this.projects = this.projects.filter(project => { return project.id != e.currentTarget.dataset.id });

            this.table();
        });

        onKeyUp('.project-name-row', e => {

            this.projects.forEach((project, i) => { if (project.id == e.currentTarget.dataset.id) { this.projects[i].project = e.currentTarget.innerHTML.trim() } });
        });

        onChange('.project-name-row', e => {

            this.projects.forEach((project, i) => { if (project.id == e.currentTarget.dataset.id) { this.projects[i].project = e.currentTarget.innerHTML.trim() } });

            // this.table();
        });
    }

    selected() {

        console.log("selected" + (this.projects.find(project => project.current) || {}).id || "");
        return (this.projects.find(project => project.current) || {}).id || "";
    }

    get() {

        let path = getDefaultAppPath() + require('path').sep + '.kenzapsettings';

        if (fs.existsSync(path)) {

            try {

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

        return this.projects;
    }

    init() {

        this.render();

        this.listeners();
    }
}