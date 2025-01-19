
import global from "./global.js"
import { __html, version, onClick } from './helpers.js'

/**
 * Class representing version control for the Kenzap App.
 */
export class VersionControl {

    /**
     * Create a VersionControl instance.
     * @param {Object} global - The global state object.
     */
    constructor(global) {

        this.global = global;
    }

    /**
     * Render the version control warnings and updates.
     */
    render() {

        // update force
        if (this.compareversion(version, global.state.version.required)) {

            document.querySelector('.app-warnings').innerHTML = `
                <div class="alert alert-danger alert-dismissible fade show" role="alert" data-id="36a32a9f35bded87c712ee89d75cae032e1ad58d">
                    <div class="d-flex align-items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-square flex-shrink-0 me-2 d-none" viewBox="0 0 16 16">
                            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"></path>
                            <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"></path>
                        </svg>
                        <div class="alert-msg">
                            <h4 class="alert-heading">${__html("Update")}</h4>
                            <pre>${__html("Update Kenzap App to the latest version %1$.", global.state.version.latest)}</pre>
                            <hr>
                            <p class="mb-0"><button type="button" class="btn btn-light update-now">${__html("Update now")}</button></p>
                        </div>
                    </div>
                    <button type="button" class="btn-close btn-dismiss-notify" data-bs-dismiss="alert" aria-label="Close" data-id="36a32a9f35bded87c712ee89d75cae032e1ad58d"></button>
                </div>
                `;

            document.querySelector('.app-create').setAttribute("disabled", "");
            document.querySelector('.app-cont').classList.add("blocked");

            return;
        }

        // update warning
        if (this.compareversion(version, global.state.version.latest)) {

            document.querySelector('.app-warnings').innerHTML = `
                <div class="alert alert-danger alert-dismissible fade show" role="alert" data-id="36a32a9f35bded87c712ee89d75cae032e1ad58d">
                    <div class="d-flex align-items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-square flex-shrink-0 me-2 d-none" viewBox="0 0 16 16">
                            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"></path>
                            <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"></path>
                        </svg>
                        <div class="alert-msg">
                            <h4 class="alert-heading">${__html("Update")}</h4>
                            <pre>${__html("Update Kenzap App to the latest version %1$.", global.state.version.latest)}</pre>
                            <hr>
                            <p class="mb-0"><button type="button" class="btn btn-light update-now">${__html("Update now")}</button></p>
                        </div>
                    </div>
                    <button type="button" class="btn-close btn-dismiss-notify" data-bs-dismiss="alert" aria-label="Close" data-id="36a32a9f35bded87c712ee89d75cae032e1ad58d"></button>
                </div>
                `;
        }
    }

    /**
     * Add event listeners for the version control actions.
     */
    listeners() {

        onClick(".update-now", e => {

            e.preventDefault();

            require('electron').shell.openExternal("https://kenzap.cloud");
        });
    }

    /**
     * Get the current version.
     * @returns {string} The current version.
     */
    get() {

        return version;
    }

    /**
     * Compare two version strings.
     * @param {string} version1 - The first version string.
     * @param {string} version2 - The second version string.
     * @returns {boolean} True if version1 is less than version2, otherwise false.
     */
    compareversion(version1, version2) {

        var result = false;

        if (typeof version1 !== 'object') { version1 = version1.toString().split('.'); }
        if (typeof version2 !== 'object') { version2 = version2.toString().split('.'); }

        for (var i = 0; i < (Math.max(version1.length, version2.length)); i++) {

            if (version1[i] == undefined) { version1[i] = 0; }
            if (version2[i] == undefined) { version2[i] = 0; }

            if (Number(version1[i]) < Number(version2[i])) {
                result = true;
                break;
            }
            if (version1[i] != version2[i]) {
                break;
            }
        }
        return (result);
    }

    /**
     * Initialize the version control by rendering and adding listeners.
     */
    init() {

        this.render();

        this.listeners();
    }
}