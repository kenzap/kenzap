'use strict';

import { __html, getDefaultAppPath, getSetting, log } from './helpers.js'
import fs from 'fs';
import path from 'path';
import simpleIcons from '../libs/simple-icons.json';

/**
 * Retrieves a list of application directories that contain an 'app.yaml' file.
 * [{"id":"204984fae451d5322814a5b2aa73d7be03d6bdaf","app":{"id":"1ae86987-df14-4741-9433-d9602a4da995","tag":"latest","logo":"https:\/\/d1q6f0aelx0por.cloudfront.net\/product-logos\/library-python-logo.png","name":"python","slug":"python","dockerfile":"FROM python:latest\n\nWORKDIR \/usr\/src\/app\n\nRUN pip install Flask\n\nCOPY _ .\n\nCMD [\"python\", \".\/app.py\"]"},"dtc":["nur"],"img":[],"kid":"4829","new":true,"sid":"100000","cats":[],"path":"","slug":"3dfactory-assistant","title":"3DFactory Assistant","users":[],"status":"published","dns_add":false,"project":"zlfCt","keywords":"","registry":{"id":"d4ed64b4da13a7c235ac239a371cb48f0f753648","aid":"","uid":"","pass":"EXY88FGaCjDoJMQOL9B4LG60o9cyFSohGltl622GyFROf8AUAMfu5DJfjnulFqRZbZnZny0u","port":27605,"slug":"app-27605","user":"uqmdagdynuyyru3bmwaqu34jy","domain":"app-27605.eu-registry.kenzap.com","region":"eu","status":"created","created":1714590002},"services":[{"host":"3dfactory-assistant.app.kenzap.cloud","name":"app","port":"3001","slug":"3dfactory-assistant","private":"app.3dfactory-assistant","active_public":1,"active_private":1}],"endpoints":{"nur_3dfactory-assistant.app":{"id":3946806,"dtc":"nur","host":"3dfactory-assistant.app","port":80},"nur_app.3dfactory-assistant":{"id":4264002,"dtc":"nur","host":"app.3dfactory-assistant","port":80}},"user_name":"Kenzap ","user_slug":"uqmdagdynuyyru3bmwaqu34jy","description":"","registry_add":false},{"id":"b0d78d184fd00f792e8805ea939bf15951d2d5da","
 *
 * @returns {string[]} An array of directory names that contain an 'app.yaml' file.
 */
export function getAppList() {

    // /Users/username/Kenzap
    const baseDir = getDefaultAppPath();

    function getDirectories(srcPath) {
        return fs.readdirSync(srcPath).filter(file => fs.statSync(path.join(srcPath, file)).isDirectory());
    }

    const directories = getDirectories(baseDir);
    const appList = [];

    directories.forEach(dir => {
        const appYamlPath = path.join(baseDir, dir, 'app.yaml');
        if (fs.existsSync(appYamlPath)) {

            appList.push(getSetting(dir.toString()));
        }
    });

    return appList;
}

/**
 * Retrieves the icon for the specified application.
 *  
 * @param {string} app - The application object.
 * @returns {string} The icon for the specified application.
 */
export function getAppIcon(app) {

    let conversions = { "httpd": "apache", "node": "nodedotjs" };
    let slug = conversions[app.app.slug] || app.app.slug;
    let url = `https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/${slug}.svg`;

    // log(simpleIcons)

    let icon = simpleIcons.find(i => i.slug === slug) ||
        simpleIcons.find(i => i.title.toLowerCase() === slug.toLowerCase()) ||
        simpleIcons.find(i => i.title.toLowerCase().includes(slug.toLowerCase()));

    let officialColor = (icon && icon.hex) ? icon.hex : "000000";

    // log(app.id + " - " + officialColor);

    fetch(url)
        .then(response => response.text())
        .then(svgText => {
            let parser = new DOMParser();
            let doc = parser.parseFromString(svgText, "image/svg+xml");
            let svg = doc.querySelector("svg");

            svg.setAttribute("fill", "#" + officialColor);
            document.querySelector(".timgc[data-id='" + app.id + "']").innerHTML = svg.outerHTML;
        });
}
