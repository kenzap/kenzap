
import global from "./global.js"
import { __html, attr, onClick, getDefaultAppPath, toast, getToken, getKenzapSettings, saveKenzapSettings, onKeyUp, onChange, log } from './helpers.js'
import { AppCreateTemplate } from './app-create-template.js'

/**
 * Class representing a series of App Creation Dialogs
 */
export class AppCreate {

    constructor(global) {

        this.app = { ui: 'dialog' };

        this.init();
    }

    init() {

        new AppCreateTemplate(this.app);
    }
}