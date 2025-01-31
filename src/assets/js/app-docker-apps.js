
import global from "./global.js"
import { __html, html, onClick, toast, showLoader, hideLoader, parseError, onKeyUp } from './helpers.js'
import { dockerApps } from './app-settings-helpers.js'
import "../scss/docker-apps.css"

export class DockerApps {

    constructor(global) {

        this.global = global;

        this.app = this.global.state.app;

        this.selected = {};

        this.global.images = dockerApps().summaries;

        this.sort('popularity', this.global.images);

        this.global.images = this.global.images.slice(0, 10);

        if (!this.app) this.app = { clusters: [] };
    }

    view() {

        return `
            <div class="col-sm-7 pt-3">
                <h5 class="card-title">${__html('Images')}</h5>
                <p class="form-text">${__html('Choose official docker image to build your app.')}</p>
                <div class="map-regions- mb-3">
                    <div class="mb-3">
                        <input type="text" class="form-control" id="image-search" placeholder="${html('Search image')}" value="" style="max-width:100%;" >
                    </div>
                    <table class="table table-hover table-borderless align-middle table-striped table-list mb-0" style="min-width: 600px;">


                    </table>
                </div>
                <div class="clearfix"></div>
            </div>`;
    }

    render() {

        document.querySelector(".table-list").innerHTML = this.global.images.map((im, i) => {

            return `
            <tr>
                <td>
                    <div id="im${i}" data-id="${im.id}" class="image-picker d-flex ember-view px-1 py-1 ${this.app.clusters.includes('nyc') ? 'selected' : ''}" > 
                        <img src="${html(im.logo_url.small ? im.logo_url.small : im.logo_url.large ? im.logo_url.large : "https://cdn.kenzap.com/loading.png")}" class="img-fluid rounded" onerror="this.onerror=null;this.src='https://cdn.kenzap.com/loading.png';">
                        <div class="ms-3 mt-1">
                            <span role="button" class="name" >
                                ${html(im.name)}
                                <a href="#${html(im.slug)}" target="_blank" class="open-docker-hub" data-slug="${html(im.slug)}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor text-dark" class="bi bi-link-45deg po" viewBox="0 0 16 16">
                                        <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"></path>
                                        <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243z"></path>
                                    </svg>
                                </a>
                            </span> 
                            <div class="form-text">${html(im.short_description)}</div>
                        </div>
                    </div>
                </td>
            </tr>
            `

        }).join('');

        // open docker hub
        onClick('.open-docker-hub', e => {

            e.preventDefault();

            require('electron').shell.openExternal("https://hub.docker.com/_/" + e.currentTarget.dataset.slug);

            return false;
        });

        // select docker image
        onClick('.image-picker', e => {

            e.preventDefault();

            let image = dockerApps().summaries.filter(im => im.id == e.currentTarget.dataset.id)[0];

            toast(__html('%1$ image selected', image.name));

            global.state.editor.setValue(image.dockerfile ? image.dockerfile : "FROM " + image.slug + ":latest")
            this.selected = { id: image.id, slug: image.slug, name: image.name, tag: "latest", logo: image.logo_url.small ? image.logo_url.small : image.logo_url.large ? image.logo_url.large : "https://cdn.kenzap.com/loading.png" }

            return false;
        });
    }

    listeners() {

        // data center picker
        onKeyUp('#image-search', e => {

            e.preventDefault();

            this.global.images = dockerApps().summaries.filter(im => ((im.name.toLowerCase().indexOf(e.currentTarget.value.toLowerCase()) != -1 || im.short_description.toLowerCase().indexOf(e.currentTarget.value.toLowerCase()) != -1) && im.architectures ? im.architectures.filter(e => e.name === 'arm64').length > 0 : false))

            this.sort('popularity', this.global.images)

            this.global.images = this.global.images.slice(0, 10);

            this.render();
        });
    }

    get() {

        return this.selected;
    }

    init() {

        document.querySelector('docker-apps').innerHTML = this.view();

        this.render();

        this.listeners();
    }

    sort(valuePath, array) {

        let path = valuePath.split('.')

        return array.sort((a, b) => {
            return getValue(b, path) - getValue(a, path)
        });

        function getValue(obj, path) {
            path.forEach(path => obj = obj[path])
            return obj;
        }
    }

    // https://hub.docker.com/api/content/v1/products/search?image_filter=official&page=1&page_size=200&q=&type=image
}