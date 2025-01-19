import { __html, onClick, version } from './helpers.js'

export class Footer {

    constructor(global) {

        this.global = global;
        this.app = this.global.state.app;
    }

    html() {

        return `
            <footer class="container bg-light- mt-4 mb-4">
                <div class="row">
                    <div class="d-sm-flex justify-content-center justify-content-sm-between">
                        <span class="text-muted text-center text-sm-left d-block d-sm-inline-block">${__html('Kenzap %3$. %1$GPLv2%2$. ❤️', '<a class="text-muted" href="https://kenzap.com/" target="_blank">', '</a>', version)}</span>
                        <span class="float-none float-sm-right d-block mt-1 mt-sm-0 text-center text-muted"></span>
                    </div>
                </div>
            </footer>

            <div class="modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header border-0">
                            <h5 class="modal-title"></h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">

                        </div>
                        <div class="modal-footer border-0">
                            <button type="button" class="btn btn-primary btn-modal"></button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"></button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="position-fixed bottom-0 p-2 m-4 end-0 align-items-center">
                <div class="toast hide align-items-center text-white bg-dark border-0" role="alert" aria-live="assertive"
                    aria-atomic="true" data-bs-delay="3000">
                    <div class="d-flex">
                        <div class="toast-body"></div>
                        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"
                            aria-label="Close"></button>
                    </div>
                </div>
            </div>
            
            <div class="loader" style="display:block;">
                <div class="dots">
                <span></span>
                <span></span>
                <span></span>
                </div>
            </div>
        `;
    }

    listeners() {

        // open dashboard
        onClick('.open-dashboard', e => {

            e.preventDefault();

            require('electron').shell.openExternal("https://dashboard.kenzap.cloud/");

            return false;
        });
    }

    init() {

        // if(!)
        document.querySelector('app-footer').innerHTML = this.html();

        this.listeners();
    }
}