
import global from "./global.js"
import { __html, hideLoader, API, parseError, getKenzapSettings, saveKenzapSettings, getToken } from './helpers.js'

/**
 * Fetches the application registry from the Kenzap API and processes the response.
 * 
 * @param {Function} cb - A callback function to be executed if the request is successful. 
 *                        The registry data will be passed as an argument to this function.
 * 
 * @returns {void}
 */
export function getAppRegistry(cb) {

    let settings = getKenzapSettings();

    if (!settings.id) settings.id = getToken(12);

    // get free registry https://api.kenzap-apps.app.kenzap.cloud/v2/?cmd=get_free_registry&app_id=Y4uR3s&app_slug=app-39987
    fetch(API() + "?cmd=get_free_registry&app_id=" + settings.id + "&app_slug=kenzap-app", {
        method: 'post',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Kenzap-Locale': "en",
            'Kenzap-Token': localStorage.getItem("kenzap_token")
        }
    })
        .then(response => response.json())
        .then(response => {

            global.state.loading = false;

            // console.log(response);

            // parse response
            if (response.success) {

                if (cb) cb(response.registry);

                saveKenzapSettings({ id: settings.id, registry: response.registry });

            } else {

                hideLoader();

                switch (response.code) {

                    case 411:

                        alert(__html('Application with the same name already exists'))
                        break;
                    default:
                        parseError(response);
                        break;
                }
            }
        })
        .catch(error => {

            parseError(error);
        });
}