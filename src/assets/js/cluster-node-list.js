import global from "./global.js"
import { __html, attr, html, onClick, getSetting, toast, onChange, showLoader, hideLoader, API, loadDependencies, parseError } from './helpers.js'
import { getClusterKubeconfig } from './cluster-kubernetes-helpers.js'
import { run_script } from './dev-tools.js'
import { formatClusterNode } from './cluster-list-helpers.js'

/**
 * Cluster Node List
 * 
 * @name ClusterNodeList
 **/
export class ClusterNodeList {

    constructor(cluster) {

        this.range = { cpu: "0", memory: "0" };
        this.chart = { index: 19, cpu: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0], [17, 0], [18, 0], [19, 0]], memory: [[0, 0.01], [1, 0.01], [2, 0.01], [3, 0.01], [4, 0.01], [5, 0.01], [6, 0.01], [7, 0.01], [8, 0.01], [9, 0.01], [10, 0.01], [11, 0.01], [12, 0.01], [13, 0.01], [14, 0.01], [15, 0.01], [16, 0.01], [17, 0.01], [18, 0.01], [19, 0.01]] };
        this.selector = "cluster-node-list";
        this.cluster = cluster;
    }

    view() {

        return `
            <div class="col-sm-7 pt-3 pt-3">
                <div class="d-flex align-items-center justify-content-between d-none">
                    <h5 class="card-title">${__html('Nodes')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary  d-none" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                </div>
                <p class="form-text d-none">${__html('List of all cluster nodes')}</p>
                <div class="table-responsive">
                    <table class="table table-hover table-borderless align-middle table-striped- table-p-list mb-0" style="min-width:300px;">
                        <thead>
                            <tr class="d-none-">
                                <th class="fw-normal">${__html('Server')}</th>
                                <th class="fw-normal">${__html('Status')}</th>
                                <th class="fw-normal">${__html('Version')}</th>
                                <th class="fw-normal">${__html('Cores')}</th>
                                <th class="fw-normal">${__html('Memory')}</th>
                            </tr>
                        </thead>
                        <tbody class="cluster-node-list">

                        </tbody>
                    </table>
                </div>
                <div class="clearfix"></div>
            </div>
            `;
    }

    listeners() {


    }

    refreshCharts() {

        if (this.statsInterval) clearInterval(this.statsInterval);

        this.statsInterval = setInterval(() => { this.renderTable(); }, 60000);

        this.renderTable();
    }

    renderTable() {

        let kubeconfig = getClusterKubeconfig(this.cluster.id);

        if (!kubeconfig) return;

        this.data = "";

        if (!document.querySelector("cluster-node-list")) { clearInterval(this.statsInterval); return; }

        let proc = run_script('kubectl get nodes -o json --kubeconfig=' + kubeconfig, [], () => { }, false);

        proc.stdout.on('data', (data) => {

            this.data += data.toString();

            // console.log(`Cluster Node Stats: ${this.data}`);
        });

        proc.stdout.on('error', (data) => {

            // console.error(`Cluster Node Stats Error: ${data}`);
        });

        proc.on('close', (code) => {

            let data = JSON.parse(this.data);

            document.querySelector(".cluster-node-list").innerHTML = `

                ${data.items.map(item =>
                `<tr>
                        <td style="min-width: 250px;">
                            <div class="mb-0">${item.metadata.name}</div>
                            <div class="form-text my-0">${item.status.addresses[0].address}</div>
                        </td>
                        <td class="form-text">${formatClusterNode({ status: "ready" })}</td>
                        <td>
                            <div>${item.status.nodeInfo.kubeletVersion}</div>
                            <div class="form-text my-0 d-none-">${item.status.nodeInfo.architecture}</div>
                            <div class="form-text d-none">${item.status.nodeInfo.osImage}</div>
                        </td>
                        <td>
                            <div class="d-flex- align-items-center-">
                                <div class="d-flex align-items-center me-3">
                                    <div class="me-1">${item.status.capacity.cpu}</div>
                                    <div class="form-text text-secondary"><sub>CPUs</sub></div> 
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="d-flex- align-items-center-">
                                <div class="d-flex align-items-center">
                                    <div class="me-1">${Math.round((parseFloat(item.status.capacity.memory) / 1024 / 1024).toFixed(2))}</div>
                                    <div class="form-text text-secondary"><sub>Gi RAM</sub></div>
                                </div>
                            </div>
                        </td>
                    </tr>`
            ).join('')}
            `;

            document.querySelector(".cluster-node-list").innerHTML += `
                <tr>
                    <td>
                    
                    </td>
                    <td>

                    </td>
                    <td>

                    </td>
                    <td>
                        <div class="d-flex align-items-center ">
                            <div class="me-1">${data.items.reduce((total, item) => total + parseInt(item.status.capacity.cpu), 0)}</div>
                            <div class="form-text text-secondary"><sub>CPUs</sub></div>
                        </div>
                    </td>
                    <td>
                        <div class="d-flex align-items-center ">
                            <div class="me-1">${Math.round((data.items.reduce((total, item) => total + Math.round((parseInt(item.status.capacity.memory) / 1024 / 1024).toFixed(2)), 0)))}</div>
                            <div class="form-text text-secondary"><sub>Gi RAM</sub></div>
                        </div>
                    </td>
                </tr>
                `;
        });
    }

    // Helper function to parse memory and convert units to GiB
    parseMemory(memory) {
        const unit = memory.slice(-2); // Get the unit (Mi, Gi, etc.)
        const value = parseFloat(memory.slice(0, -2)); // Get the numeric part
        const factor = { Ki: 1 / (1024 * 1024), Mi: 1 / 1024, Gi: 1 }[unit] || 0;
        return value * factor; // Convert to GiB
    }

    // Helper function to parse CPU percentage
    parseMemory_(memory) {
        if (memory.endsWith('%')) {
            return parseFloat(memory.slice(0, -1)); // Convert millicores directly
        }
    }

    // Helper function to parse CPU and convert to cores
    parseCPU(cpu) {
        if (cpu.endsWith('m')) {
            return parseFloat(cpu.slice(0, -1)) / 1000; // Convert millicores to cores
        }
        return parseFloat(cpu); // Return cores directly
    }

    // Helper function to parse CPU percentage
    parseCPU_(cpu) {
        if (cpu.endsWith('%')) {
            return parseFloat(cpu.slice(0, -1)); // Convert percentage to cores
        }
    }

    init() {

        document.querySelector(this.selector).innerHTML = this.view();

        this.refreshCharts();

        this.listeners();
    }
}
