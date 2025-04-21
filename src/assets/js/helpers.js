import bootstrap from "bootstrap"
import * as path from 'path';
import os from 'os';
import fs from 'fs';

// version control variable, only one digit after dot, wrong: 1.0.19, 1.10.1
export const version = "1.0.7";

// cross platform Kenzap home directory
export const kenzapdir = path.join(process.platform === "win32" ? process.env.HOMEPATH : process.env.HOME, 'Kenzap');

/**
 * @name API
 * @description Return API URL, product or development
 */
export function API() {

    return "https://api.kenzap-apps.kenzap.cloud/v2/";
}

/**
 * @name log
 * @description Universal logging function that displays logs during development mode only.
 * @param {...any} args - Arguments to log.
 */
export function log(...args) {
    if (process.env.NODE_ENV === 'development') {
        // console.log(...args);
    }

    // TODO: add logging to file
    console.log(...args);
}

export function consoleUI(...args) {

    let data = args.join('<br>');

    if (document.querySelector('.console-output')) document.querySelector('.console-output').innerHTML = data;
}

/**
 * @name showLoader
 * @description Initiates full screen three dots loader.
 */
export function showLoader() {

    let el = document.querySelector(".loader");
    if (el) el.style.display = 'block';
}

/**
 * @name hideLoader
 * @description Removes full screen three dots loader.
 */
export function hideLoader() {

    let el = document.querySelector(".loader");
    if (el) el.style.display = 'none';
}

/**
 * @name getState
 * @deprecated
 * @description Get latest app state. Useful to restore after refresh.
 */
export function getState() {

    let struct = { dev: {}, ui: true, response: null, targetLanguage: "eng", projects: [{ id: "allapps", "project": __html("All Apps"), apps: [], current: true }] };

    if (Object.keys(global.state).length === 0) global.state = localStorage.getItem("state-" + localStorage.getItem('user-id')) ? JSON.parse(localStorage.getItem("state-" + localStorage.getItem('user-id'))) : struct;

    if (!global.state) global.state = struct;

    return global.state
}

/**
 * @name cacheState
 * @deprecated
 * @description Cache latest app state. Useful to restore after refresh or navigation to a new page.
 */
export function cacheState() {

    // only cache allowed properties
    let obj = { projects: global.state.projects };
    localStorage.setItem("state-" + localStorage.getItem('user-id'), JSON.stringify(obj));
}

/**
 * Get app settings from localstorage
 * @deprecated
 * 
 * @name cacheSettings
 * @param {String} id - app ID
 * @returns {Object} - settings object
 */
export function getSettingCache(id) {

    // init defaults
    let cache = localStorage.getItem("appsCache-" + localStorage.getItem('user-id'));
    if (!cache) cache = '{}'; cache = JSON.parse(cache);
    if (!cache[id]) cache[id] = {};
    cache[id].id = id;

    return cache[id];
}

/**
 * Get app settings locally.
 * 
 * @name cacheSettings
 * @param {String} id - app ID
 * @returns {Object} - settings object
 */
export function getSetting(id) {

    // init defaults
    let appPath = getDefaultAppPath() + require('path').sep + id + require('path').sep + ".kenzap";

    // console.log(appPath);

    let settings = {};

    try {

        if (fs.existsSync(appPath)) {

            settings = JSON.parse(fs.readFileSync(appPath, 'utf8'));
            settings.path = settings.path ? settings.path : getDefaultAppPath() + require('path').sep + id;
            settings.project = settings.project ? settings.project : "";
            settings.registry = settings.registry ? settings.registry : {};
            settings.id = settings.id ? settings.id : settings.title;
        }
    } catch (e) {

        console.log(e);
    }

    if (!settings.id)
        settings = {
            "id": id,
            "slug": id,
            "title": id,
            "registry": {},
            "path": getDefaultAppPath() + require('path').sep + id,
        }

    return settings;
}

/**
 * Get master Kenzap settings.
 * 
 * @name getKenzapSettings
 * @param {String} id - app ID
 * @returns {Object} - settings object
 */
export function getKenzapSettings() {

    // init defaults
    let appFolder = getDefaultAppPath() + require('path').sep + '.kenzap';
    let appPath = appFolder + require('path').sep + '.config';
    let settings = {
        "projects": [{ id: "", "project": __html("All Apps"), apps: [], current: true, clusters: [] }],
    };

    try {

        if (fs.existsSync(appPath)) {

            settings = JSON.parse(fs.readFileSync(appPath, 'utf8'));
        }
    } catch (e) {

        console.log(e);
    }

    if (!settings.clusters) settings.clusters = [];

    settings.clusters.push({ id: "local", "name": __html("Minikube"), status: 'active', servers: [{ id: "minikube", status: "active", type: "minikube", server: "127.0.0.1" }] });

    return settings;
}

/**
 * Save master Kenzap settings.
 * 
 * @name saveKenzapSettings
 * @param {Object} obj - key val setting pair
 * @returns {Object} - settings object
 */
export function saveKenzapSettings(obj) {

    // init defaults
    let appFolder = getDefaultAppPath() + require('path').sep + '.kenzap';
    let appPath = appFolder + require('path').sep + '.config';

    if (!fs.existsSync(appFolder)) {
        fs.mkdirSync(appFolder, { recursive: true });
    }

    let settings = {};

    try { if (fs.existsSync(appPath)) settings = JSON.parse(fs.readFileSync(appPath, 'utf8')); } catch (e) { console.log(e); }

    Object.keys(obj).forEach(key => {
        settings[key] = obj[key];
    });

    try { fs.writeFileSync(appPath, JSON.stringify(settings), 'utf-8'); } catch (e) { console.log(e); }

    return settings;
}

/**
 * Get app default app path based on previously created apps.
 * Return empty string if no apps created yet.
 * Return most popular app path.
 * 
 * @name getDefaultAppPath
 * @returns {String} - project path to directory
 */

export function getDefaultAppPath() {

    return os.homedir() + require('path').sep + "Kenzap";
}

/**
 * Get app default app path based on previously created apps.
 * Return empty string if no apps created yet.
 * Return most popular app path.
 * 
 * @deprecated
 * @name cacheSettings
 * @returns {String} - project path to directory
 */
export function getDefaultAppPathLegacy() {

    // init defaults
    let cache = localStorage.getItem("appsCache-" + localStorage.getItem('user-id'));
    if (!cache) cache = '{}'; cache = JSON.parse(cache);
    let pathArr = {};
    Object.keys(cache).map(id => {

        let path = "";
        if (cache[id]) if (cache[id].path) { path = cache[id].path; path = path.slice(0, path.lastIndexOf("/")); }
        if (pathArr[path]) { pathArr[path] += 1; } else { pathArr[path] = 1; }
    });

    let index = Object.keys(pathArr).sort((a, b) => { return a - b });

    return index[0];
}

/**
 * @name simulateClick
 * @description Trigger on click event without user interaction.
 * @param {string} elem - HTML selector, id, class, etc.
 */
export const simulateClick = (elem) => {

    // create our event (with options)
    let evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
    });

    // if cancelled, don't dispatch the event
    !elem.dispatchEvent(evt);
};

/**
 * @name onClick
 * @description One row click event listener declaration. Works with one or many HTML selectors.
 * @param {string} sel - HTML selector, id, class, etc.
 * @param {string} fn - callback function fired on click event.
 */
export const onClick = (sel, fn) => {

    if (document.querySelector(sel)) for (let e of document.querySelectorAll(sel)) {

        e.removeEventListener('click', fn, true);
        e.addEventListener('click', fn, true);
    }
}

/**
 * @name onKeyUp
 * @description One row key up event listener declaration. Works with one or many HTML selectors.
 * @param {string} sel - HTML selector, id, class, etc.
 * @param {string} fn - callback function fired on click event.
 */
export const onKeyUp = (sel, fn) => {

    if (document.querySelector(sel)) for (let e of document.querySelectorAll(sel)) {

        e.removeEventListener('keyup', fn, true);
        e.addEventListener('keyup', fn, true);
    }
}

/**
 * @name onChange
 * @description One row change event listener declaration. Works with one or many HTML selectors.
 * @param {string} sel - HTML selector, id, class, etc.
 * @param {string} fn - callback function fired on click event.
 */
export const onChange = (sel, fn) => {

    if (document.querySelector(sel)) for (let e of document.querySelectorAll(sel)) {

        e.removeEventListener('change', fn, true);
        e.addEventListener('change', fn, true);
    }
}

/**
 * Remove app settings locally.
 * 
 * @name cacheSettings
 * @param {String} id - app ID
 */
export function removeSetting(id) {

    // init defaults
    let cache = localStorage.getItem("appsCache-" + localStorage.getItem('user-id'));
    if (!cache) cache = '{}'; cache = JSON.parse(cache);
    if (!cache[id]) cache[id] = {};

    delete cache[id];

    localStorage.setItem("appsCache-" + localStorage.getItem('user-id'), JSON.stringify(cache));
}

/**
 * Format status
 * 
 * @name cacheSettings
 * @param {String} app - app data Object
 */
export function formatStatus(app, status) {

    switch (app.status) {

        case 'unpublished':
            return `<div class="badge dev-badge bg-dark fw-light po" data-id="${app.id}"><div class="d-flex align-items-center">${__html('Unpublished')}</div></div>`;
        case 'published':
            return status == 'sync' ? `<div class="badge dev-badge bg-danger fw-light po" data-id="${app.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div>` : `<div class="badge dev-badge bg-primary fw-light po" data-id="${app.id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`;
        default:
            return status == 'sync' ? `<div class="badge dev-badge bg-danger fw-light po" data-id="${app.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div>` : `<div class="badge dev-badge bg-primary fw-light po" data-id="${app.id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`;
    }
}

/**
 * Format status
 * 
 * @name cacheSettings
 * @param {String} app - app data Object
 */
export function formatDeploymentStatus(status) {

    switch (status) {

        case 'Progressing':
            return `<div class="badge dev-badge bg-warning fw-light po" data-id="${status}"><div class="d-flex align-items-center">${__html('Progressing')}</div></div>`;
        case 'Available':
            return `<div class="badge dev-badge bg-primary fw-light po" data-id="${status}"><div class="d-flex align-items-center">${__html('Available')}</div></div>`;
        case 'Failed':
            return `<div class="badge dev-badge bg-danger fw-light po" data-id="${status}"><div class="d-flex align-items-center">${__html('Failed')}</div></div>`;
        default:
            return `<div class="badge dev-badge bg-dark fw-light po" data-id="${status}"><div class="d-flex align-items-center">${__html('Unavailable')}</div></div>`;
    }
}

/**
 * Cache app settings locally for user environmental configurations such as app executable paths. 
 * @depricated
 * @name cacheSettings
 * @param {Object} data - Contains app object. Ex.: { id: d3fn732d3d.., title: Cloud API, keywords: ... }
 */
export function cacheSettings(data) {

    // init defaults
    let appPath = getDefaultAppPath() + require('path').sep + data.id + require('path').sep + ".kenzap";

    // update settings file
    if (fs.existsSync(appPath)) {

        let existingData = JSON.parse(fs.readFileSync(appPath, 'utf8'));
        data = { ...existingData, ...data };
    }

    fs.writeFileSync(appPath, JSON.stringify(data), 'utf8');

    // log("App settings file updated");

    return true;
}

/**
 * Cache app settings locally for user environmental configurations such as app executable paths. 
 * @depricated
 * @name cacheSettings
 * @param {Object} data - Contains app object. Ex.: { id: d3fn732d3d.., title: Cloud API, keywords: ... }
 */
export function cacheSettingsLegacy(data) {

    // init defaults
    let cache = localStorage.getItem("appsCache-" + localStorage.getItem('user-id'));
    if (!cache) cache = '{}'; cache = JSON.parse(cache);
    if (!cache[data.id]) cache[data.id] = {};

    // add data
    cache[data.id] = {
        title: data.title,
        description: data.description,
        project: data.project,
        keywords: data.keywords,
        path: data.path,
        dtc: data.dtc,
        event: data.event ? data.event : "",
        log: data.log ? data.log : "",
    }

    // console.log(cache);

    localStorage.setItem("appsCache-" + localStorage.getItem('user-id'), JSON.stringify(cache));
}

/**
 * @name initBreadcrumbs
 * @description Render ui breadcrumbs.
 * @param {array} data - List of link objects containing link text and url. If url is missing then renders breadcrumb as static text. Requires html holder with .bc class.
 */
export function initBreadcrumbs(data) {

    let html = '<ol class="breadcrumb mt-2 mb-0">';
    for (let bc of data) {

        if (typeof (bc.link) === 'undefined') {

            html += `<li class="breadcrumb-item">${bc.text}</li>`;
        } else {

            html += `<li class="breadcrumb-item"><a data-href="${bc.link}" href="${bc.link}">${bc.text}</a></li>`;
        }
    }
    html += '</ol>';

    document.querySelector(".bc").innerHTML = html;

    [...document.querySelectorAll('.breadcrumb-item')].forEach(el => el.addEventListener('click', e => {

        e.preventDefault();

        // console.log(e.target.dataset.href);

        for (let bc of data) {

            if (typeof (bc.link) !== 'undefined') {

                // console.log(e.target.dataset.href + " " + bc.link);
                if (e.target.dataset.href == bc.link)
                    if (typeof bc.cb === 'function')
                        bc.cb();
            }
        }
    }));
}

/**
 * @name getToken
 * @description Generate random roken.
 * @param {string} length - Token length.
 */
export function getToken(length) {

    //edit the token allowed characters
    var a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890".split("");
    var b = [];
    for (var i = 0; i < length; i++) {
        var j = (Math.random() * (a.length - 1)).toFixed(0);
        b[i] = a[j];
    }
    return b.join("");
}

/**
 * @name toast
 * @description Triggers toast notification. Adds toast html to the page if missing.
 * @param {string} text - Toast notification.
 */
export function toast(text) {

    // only add once
    if (!document.querySelector(".toast")) {

        let html = `
        <div class="toast-cont position-fixed bottom-0 p-2 m-4 end-0 align-items-center" style="z-index:10000;">
            <div class="toast hide align-items-center text-white bg-dark border-0" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="3000">
                <div class="d-flex">
                    <div class="toast-body"></div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        </div>`;
        if (document.querySelector('body > div')) document.querySelector('body > div').insertAdjacentHTML('afterend', html);
    }

    let toast = new bootstrap.Toast(document.querySelector('.toast'));
    document.querySelector('.toast .toast-body').innerHTML = text;
    toast.show();
}

/**
 * Load additional JS or CSS depencies from sites/js/controls folder
 *
 * @param    dep       dependecy. Ex.: hiebee.min.js 
 * @param    cb        function to call after script is loaded (optional)       
 * @return 	{Boolen} 	result status 
 * 
 */
export function loadDependencies(dep, cb) {

    // dependency already loaded, skip
    if (document.getElementById(dep)) { if (typeof cb === 'function') cb.call(); return; }

    // detect dependency type
    let t = dep.split('.').slice(-1)[0];
    switch (t) {
        case 'js':

            let js = document.createElement("script");
            js.setAttribute("src", dep);
            js.id = dep;
            js.onload = js.onreadystatechange = function () {

                if (!this.readyState || this.readyState == 'complete')
                    if (typeof cb === 'function') cb.call();
            };
            document.body.appendChild(js);

            break;
        case 'css':

            var head = document.getElementsByTagName('head')[0];
            var css = document.createElement('link');
            css.id = dep;
            css.rel = 'stylesheet';
            css.type = 'text/css';
            css.href = dep;
            head.appendChild(css);

            break;
    }

    return true;
}

/**
 * @name parseApiError
 * @description Parse and log app errors. Notify UI. 
 * @param {Object} error - Error object from try catch block.
 */
export function parseError(error) {

    console.log(error);

    if (!error) error = {};

    if (error.code) switch (error.code) {

        case 404:

            // global.state.auth = new Auth(global);
            // global.state.auth.init();

            return;
        default:

            break;
    }

    switch (error.message) {

        case 'Failed to fetch':

            // toast("No Internet connection");
            console.log("No Internet connection");
            break;
        default:

            break;
    }
}

/**
 * Translates string based on preloaded i18n locale values.
 * 
 * @param text {String} text to translate
 * @param cb {Function} callback function to escape text variable
 * @param p {String} list of parameters, to be replaced with %1$, %2$..
 * @returns {String} - text
 */
export function __esc(text, cb, ...p) {

    let match = (input, pa) => {

        pa.forEach((p, i) => { input = input.replace('%' + (i + 1) + '$', p); });

        return input;
    }

    if (typeof window.i18n === 'undefined') return match(text, p);
    if (window.i18n.state.locale.values[text] === undefined) return match(text, p);

    return match(cb(window.i18n.state.locale.values[text]), p);
}

/**
 * Converts special characters `&`, `<`, `>`, `"`, `'` to HTML entities and does translations
 * 
 * @param text {String}  text
 * @returns {String} - text
 */
export function __html(text, ...p) {

    text = String(text);

    if (text.length === 0) {
        return '';
    }

    let cb = (text) => {

        return text.replace(/[&<>'"]/g, tag => (
            {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&apos;',
                '"': '&quot;'
            }[tag]));
    }

    return __esc(text, cb, ...p);
}

/**
 * Converts special characters `&`, `<`, `>`, `"`, `'` to HTML entities.
 * 
 * @param text {String}  text
 * @returns {String} - text
 */
export function html(text) {

    text = String(text);

    if (text.length === 0) {
        return '';
    }

    return text.replace(/[&<>'"]/g, tag => (
        {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&apos;',
            '"': '&quot;'
        }[tag]));
}

/**
 * Converts special characters `&`, `<`, `>`, `"`, `'` to HTML entities.
 * 
 * @param text {String}  text
 * @returns {String} - text
 */
export function attr(text) {

    text = String(text);

    if (text.length === 0) {
        return '';
    }

    return text.replace(/[&<>'"]/g, tag => (
        {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&apos;',
            '"': '&quot;'
        }[tag]));
}

/**
 * Converts special characters `&`, `<`, `>`, `"`, `'` to HTML entities and does translation
 * 
 * @param text {String}  text
 * @returns {String} - text
 */
export function __attr(text, ...p) {

    text = String(text);

    if (text.length === 0) {
        return '';
    }

    let cb = (text) => {

        return text.replace(/[<>'"]/g, tag => (
            {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&apos;',
                '"': '&quot;'
            }[tag]));
    }

    return __esc(text, cb, ...p);
}