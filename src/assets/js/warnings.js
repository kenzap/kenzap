'use strict';
import global from "./global.js"
import { __html, attr, getDefaultAppPath, getSetting, log } from './helpers.js'

/**
 * showWarning
 * @returns {string[]} An array of directory names that contain an '.kenzap' file.
 */
export function warning(code, text) {

    if (!global.warnings) global.warnings = {};

    // skip if the warning is already shown
    if (global.warnings[code]) {
        return;
    }

    switch (code) {

        case 'RSRC_DOCKER_STORAGE':

            document.querySelector('.app-warnings').innerHTML = `
                <div class="alert alert-danger alert-dismissible fade show" role="alert" data-id="36a32a9f35bded87c712ee89d75cae032e1ad58d">
                    <div class="d-flex align-items-center-">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-square flex-shrink-0 me-2" viewBox="0 0 16 16">
                            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"></path>
                            <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"></path>
                        </svg>
                        <div class="alert-msg p-2">
                            <pre style="display: block;font-family: monospace;white-space: pre;margin: 1em 0;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                        </div>
                    </div>
                    <button type="button" class="btn-close btn-dismiss-notify" data-bs-dismiss="alert" aria-label="Close" data-id="36a32a9f35bded87c712ee89d75cae032e1ad58d"></button>
                </div>
            `;
            break;
    }

    global.warnings[code] = Date.now();
}
