
import { __html, onClick } from './helpers.js'
import { appList } from '../../renderer/app-list.js'
import logo from '../img/kenzap.svg';
import avatar from '../img/avatar.jpg';

/**
 * Class representing the navigation header.
 */
export class NavigationHeader {

    /**
     * Create a navigation header.
     * @param {Object} global - The global object containing the state.
     */
    constructor(global) {

        this.global = global;

        this.app = this.global.state.app;

        if (!this.app) this.app = { dtc: [] };
    }

    /**
     * Generate the HTML for the navigation header.
     * @returns {string} The HTML string for the navigation header.
     */
    html() {

        return `
            <nav class="navbar navbar-expand-md navbar-light fixed-top bg-white shadow-sm">
                <div class="container">
                    <div class="d-flex align-items-center">
                        <a class="navbar-brand nav-back d-flex align-items-center me-sm-2 me-1" href="https://dashboard.kenzap.cloud">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#212529" class="bi bi-arrow-left me-2 d-none" viewBox="0 0 16 16">
                                <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"></path>
                            </svg>
                            <img style="max-height: 22px;" src="${logo}" alt="Kenzap Logo">
                        </a>
                        <div class="ms-sm-2 ms-0 dropdown d-none">
                            <button class="btn btn-sm btn-outline-secondary dropdown-toggle border-0 h-space" type="button" id="spaceSelect" data-bs-toggle="dropdown" aria-expanded="false" data-id="1000000">Nuremberg</button>
                            <ul class="dropdown-menu spaceSelectList" aria-labelledby="spaceSelect">
                                <li>
                                    <a data-id="1000000" class="spw dropdown-item" href="https://sg.cluster.kenzap.cloud:10443/">Singapore</a>
                                </li>
                                <li>
                                    <a data-id="1000409" class="spw dropdown-item" href="https://nur.cluster.kenzap.cloud:10443/">Nuremberg</a>
                                </li>
                            </ul>
                        </div>
                        <div class="d-none">
                            <a target="_blank" class="open-cluster-dashboard" href="https://nur.cluster.kenzap.cloud:10443/">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bar-chart-line my-0 po form-text ms-1" viewBox="0 0 16 16">
                                    <path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1zm1 12h2V2h-2zm-3 0V7H7v7zm-5 0v-3H2v3z"/>
                                </svg>
                            </a>
                        </div>
                    </div>
                    <div class="d-flex flex-column align-items-end" id="navbarCollapse">
                        <ul class="navbar-nav me-auto mb-0 mb-md-0">
                            <li class="nav-item dropdown">
                                <a class="" href="https://account.kenzap.cloud/" id="nav-account" data-bs-toggle="dropdown" aria-expanded="false"><img src="${this.getAvatar()}" style="height:40px;width:40px;border-radius:50%;" alt="profile"></a>
                                <ul class="dropdown-menu dropdown-menu-end" data-popper-placement="left-start" aria-labelledby="nav-account" style="position: absolute;">
                                    <li><a class="dropdown-item open-dashboard" href="https://dashboard.kenzap.cloud/">${__html('Dashboard')}</a></li>
                                    <li><a class="dropdown-item open-profile" href="https://account.kenzap.cloud/profile/">${__html('My profile')}</a></li>
                                    <li><a class="dropdown-item choose-lang d-none" href="#">Language</a></li>
                                    <li><a class="dropdown-item sign-in" href="#">Sign in</a></li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>`;
    }

    /**
     * Add event listeners to the navigation header elements.
     */
    listeners() {

        // open dashboard
        onClick('.open-cluster-dashboard', e => {

            e.preventDefault();

            require('electron').shell.openExternal("https://nur.cluster.kenzap.cloud:10443/");

            return false;
        });

        // open dashboard
        onClick('.open-dashboard', e => {

            e.preventDefault();

            require('electron').shell.openExternal("https://dashboard.kenzap.cloud/");

            return false;
        });

        // open dashboard
        onClick('.open-profile', e => {

            e.preventDefault();

            require('electron').shell.openExternal("https://account.kenzap.cloud/profile/");

            return false;
        });

        // sign out
        onClick('.sign-out', e => {

            e.preventDefault();

            localStorage.removeItem('kenzap_token');

            appList();
            return false;
        });

    }

    getAvatar() {

        return localStorage.getItem('avatar') ? localStorage.getItem('avatar') : avatar;
    }

    /**
     * Initialize the navigation header by setting the inner HTML and adding listeners.
     */
    init() {

        document.querySelector('navigation-header').innerHTML = this.html();

        this.listeners();
    }
}