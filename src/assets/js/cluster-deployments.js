
import { __html, attr, formatDeploymentStatus } from './helpers.js'
import { run_script, getKubectlPath } from './dev-tools.js'
import { getClusterKubeconfig } from './cluster-kubernetes-helpers.js'
import yaml from 'js-yaml';

export class ClusterDeployments {

    constructor(cluster) {

        this.cluster = cluster;
    }

    view() {

        document.querySelector('cluster-deployments').innerHTML = `
            <div class="col-sm-7 pt-3 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Apps')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary add-user" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-arrow-clockwise po sync-endpoints d-none" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                    </svg>
                </div>
                <p class="form-text">${__html('A list of all deployments returned by the cluster.')}</p>
                <div class="table-responsive">
                    <table class="table table-hover table-borderless align-middle table-striped table-p-list mb-0" style="min-width:300px;">
                        <thead>
                            <tr class="d-none">
                                <th class="fw-normal">${__html('Endpoint')}</th>
                                <th class="fw-normal">${__html('Status')}</th>
                                <th class="fw-normal">${__html('Action')}</th>
                            </tr>
                        </thead>
                        <tbody class="deployment-list">

                        </tbody>
                    </table>
                </div>
            </div>
            `;
    }

    render() {

        if (!this.deployments.length) { document.querySelector('.deployment-list').innerHTML = `<tr><td colspan="2">${__html("No deployments to display.")}</td></tr>`; }

        document.querySelector('.deployment-list').innerHTML = this.deployments.map((deployment, i) => {

            let workingSince = deployment.spec.template.metadata.annotations ? deployment.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] : ''
            if (!workingSince) workingSince = deployment.metadata.creationTimestamp;
            workingSince = new Date(workingSince).toLocaleString();

            let status = deployment.status ? deployment.status.readyReplicas : 0;
            if (status == 0) status = 'Failed';
            if (status > 0) status = 'Available';

            return `
                <tr>
                    <td style="min-width:200px;">
                        <div class="d-flex">
                            <div class="d-flex- align-items-center- ms-0">
                                <div class="my-0">${attr(deployment.metadata.name)}</div>
                                <div class="form-text my-0 d-none-">${attr(workingSince)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="form-text">${formatDeploymentStatus(status)}</td>
                    <td class="text-end">
                        <div class="dropdown endpointsActionsCont">
                            <svg id="endpointsActions${i}" data-bs-toggle="dropdown" data-boundary="viewport" aria-expanded="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-three-dots-vertical dropdown-toggle po" viewBox="0 0 16 16">
                                <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                            </svg>
                            <ul class="dropdown-menu" aria-labelledby="endpointsActions${i}" style="">
                                <li><a class="dropdown-item po endpoint-edit add-endpoint d-none" href="#" data-action="edit" data-i="${attr(i)}" data-id="${attr(deployment.metadata.uid)}" data-bs-toggle="modal" data-bs-target=".modal">${__html('Edit')}</a></li>
                                <li><hr class="dropdown-divider d-none"></li>
                                <li><a class="dropdown-item po user-delete" href="#" data-i="${attr(i)}" data-id="${attr(deployment.metadata.uid)}" >${__html('Remove')}</a></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            `

        }).join('');
    }

    listeners() {

    }

    init() {

        this.view();

        let cb = () => { }

        let kubeconfig = getClusterKubeconfig(this.cluster.id);

        let kubectl = getKubectlPath();

        let proc = run_script(kubectl + ' get deployments -A --kubeconfig=' + kubeconfig + ' -o yaml', [], cb, false);

        this.data = '';

        proc.stdout.on('data', (data) => {

            this.data += data.toString();
        });

        proc.stderr.on('data', (data) => {

            console.error(`ClusterDeployments stderr: ${data}`);
        });

        proc.on('close', (code) => {

            let parsed = yaml.loadAll(this.data.toString(), 'utf8');

            this.deployments = parsed[0].items;

            this.render();
        });

        this.listeners();
    }
}