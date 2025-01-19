'use strict';

import { __html, getDefaultAppPath } from './helpers.js'

/**
 * Retrieves a list of application directories that contain an 'app.yaml' file.
 * [{"id":"204984fae451d5322814a5b2aa73d7be03d6bdaf","app":{"id":"1ae86987-df14-4741-9433-d9602a4da995","tag":"latest","logo":"https:\/\/d1q6f0aelx0por.cloudfront.net\/product-logos\/library-python-logo.png","name":"python","slug":"python","dockerfile":"FROM python:latest\n\nWORKDIR \/usr\/src\/app\n\nRUN pip install Flask\n\nCOPY _ .\n\nCMD [\"python\", \".\/app.py\"]"},"dtc":["nur"],"img":[],"kid":"4829","new":true,"sid":"100000","cats":[],"path":"","slug":"3dfactory-assistant","title":"3DFactory Assistant","users":[],"status":"published","dns_add":false,"project":"zlfCt","keywords":"","registry":{"id":"d4ed64b4da13a7c235ac239a371cb48f0f753648","aid":"","uid":"","pass":"EXY88FGaCjDoJMQOL9B4LG60o9cyFSohGltl622GyFROf8AUAMfu5DJfjnulFqRZbZnZny0u","port":27605,"slug":"app-27605","user":"uqmdagdynuyyru3bmwaqu34jy","domain":"app-27605.eu-registry.kenzap.com","region":"eu","status":"created","created":1714590002},"services":[{"host":"3dfactory-assistant.app.kenzap.cloud","name":"app","port":"3001","slug":"3dfactory-assistant","private":"app.3dfactory-assistant","active_public":1,"active_private":1}],"endpoints":{"nur_3dfactory-assistant.app":{"id":3946806,"dtc":"nur","host":"3dfactory-assistant.app","port":80},"nur_app.3dfactory-assistant":{"id":4264002,"dtc":"nur","host":"app.3dfactory-assistant","port":80}},"user_name":"Kenzap ","user_slug":"uqmdagdynuyyru3bmwaqu34jy","description":"","registry_add":false},{"id":"b0d78d184fd00f792e8805ea939bf15951d2d5da","
 *
 * @returns {string[]} An array of directory names that contain an 'app.yaml' file.
 */
export function getClusterList(state) {

    let clusterList = [];

    clusterList = state.settings.clusters || [];

    return clusterList;
}

/**
 * Format status
 * 
 * @name cacheSettings
 * @param {String} app - app data Object
 */
export function formatClusterStatus(cluster) {

    switch (cluster.status) {

        case 'ready':
            return `<div class="badge dev-badge bg-warning fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center">${__html('Ready')}</div></div>`;
        case 'active':
            return `<div class="badge dev-badge bg-primary fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center">${__html('Active')}</div></div>`;
        case 'error':
            return `<div class="badge dev-badge bg-danger fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center">${__html('Error')}</div></div>`;
        case 'creating':
            return `<div class="badge dev-badge bg-warning fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Creating')}</div></div>`;
        case 'unpublished':
            return `<div class="badge dev-badge bg-dark fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center">${__html('Unpublished')}</div></div>`;
        case 'published':
            return cluster.status == 'sync' ? `<div class="badge dev-badge bg-danger fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div>` : `<div class="badge dev-badge bg-primary fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`;
        default:
            return cluster.status == 'sync' ? `<div class="badge dev-badge bg-danger fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div>` : `<div class="badge dev-badge bg-primary fw-light po" data-id="${cluster.id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`;
    }
}

/**
 * Format status
 * 
 * @name cacheSettings
 * @param {String} app - app data Object
 */
export function formatClusterNode(node) {

    switch (node.status) {

        case 'ready':
            return `<div class="badge dev-badge bg-primary fw-light po" data-id="${node.id}"><div class="d-flex align-items-center">${__html('Ready')}</div></div>`;
        case 'active':
            return `<div class="badge dev-badge bg-primary fw-light po" data-id="${node.id}"><div class="d-flex align-items-center">${__html('Active')}</div></div>`;
        case 'error':
            return `<div class="badge dev-badge bg-danger fw-light po" data-id="${node.id}"><div class="d-flex align-items-center">${__html('Error')}</div></div>`;
        case 'creating':
            return `<div class="badge dev-badge bg-warning fw-light po" data-id="${node.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Creating')}</div></div>`;
        case 'unpublished':
            return `<div class="badge dev-badge bg-dark fw-light po" data-id="${node.id}"><div class="d-flex align-items-center">${__html('Unpublished')}</div></div>`;
        case 'published':
            return node.status == 'sync' ? `<div class="badge dev-badge bg-danger fw-light po" data-id="${node.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div>` : `<div class="badge dev-badge bg-primary fw-light po" data-id="${node.id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`;
        default:
            return node.status == 'sync' ? `<div class="badge dev-badge bg-danger fw-light po" data-id="${node.id}"><div class="d-flex align-items-center"><span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ${__html('Syncing')}</div></div>` : `<div class="badge dev-badge bg-primary fw-light po" data-id="${node.id}"><div class="d-flex align-items-center">${__html('Published')}</div></div>`;
    }
}