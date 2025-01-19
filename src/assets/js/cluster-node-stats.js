import { __html, loadDependencies } from './helpers.js'
import { getClusterKubeconfig } from './cluster-kubernetes-helpers.js'
import { run_script } from './dev-tools.js'

/**
 * Class representing the statistics of a cluster node.
 */
export class ClusterNodeStats {

    /**
     * Create a ClusterNodeStats instance.
     * @param {Object} cluster - The cluster object.
     */
    constructor(cluster) {

        this.range = { cpu: "0", memory: "0" };
        this.chart = { index: 19, cpu: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0], [17, 0], [18, 0], [19, 0]], memory: [[0, 0.01], [1, 0.01], [2, 0.01], [3, 0.01], [4, 0.01], [5, 0.01], [6, 0.01], [7, 0.01], [8, 0.01], [9, 0.01], [10, 0.01], [11, 0.01], [12, 0.01], [13, 0.01], [14, 0.01], [15, 0.01], [16, 0.01], [17, 0.01], [18, 0.01], [19, 0.01]] };
        this.selector = "cluster-node-stats";
        this.cluster = cluster;
    }

    /**
     * Generate the HTML view for the cluster node stats.
     * @returns {string} The HTML string.
     */
    view() {

        return `
            <div class="col-sm-7 pt-3 pt-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h5 class="card-title">${__html('Usage')}</h5>
                    <span class="d-flex" role="status" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-circle card-title ms-3 me-2 po text-primary  d-none" data-bs-toggle="modal" data-bs-target=".modal" viewBox="0 0 16 16" data-action="add" >
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"></path>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"></path>
                        </svg>
                    </span>
                </div>
                <p class="form-text">${__html('Total  nodes\' resource consumption.')}</p>
                <div class="d-flex align-items-center justify-content-start mb-2">
                    <div class="container">
                        <div class="row">
                            <div class="col-6">
                                <div class="cpu-stats px-0 me-0" style="max-width:100%">

                                </div>
                            </div>
                            <div class="col-6">
                                <div class="ram-stats px-0" style="max-width:100%">

                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="clearfix"></div>
            </div>
            `;
    }

    /**
     * Set up event listeners for the cluster node stats.
     */
    listeners() {


    }

    /**
     * Refresh the charts with the latest data.
     */
    refreshCharts() {

        let self = this;

        let kubeconfig = getClusterKubeconfig(this.cluster.id);

        if (!kubeconfig) return;

        if (self.statsInterval) clearInterval(self.statsInterval);

        let cb = (data) => { }

        self.statsInterval = setInterval(() => {

            this.data = "";

            if (!document.querySelector(".cpu-stats")) { clearInterval(self.statsInterval); return; }

            let proc = run_script('kubectl top nodes --kubeconfig=' + kubeconfig, [], () => { }, false);

            proc.stdout.on('data', (data) => {

                this.data += data.toString();

                // console.log(`Cluster Node Stats: ${this.data}`);
            });

            proc.stdout.on('error', (data) => {

                // console.error(`Cluster Node Stats Error: ${data}`);
            });

            proc.on('close', (code) => {

                // Extract rows from the output
                const rows = this.data.trim().split('\n').slice(1); // Skip the header row
                let totalCPU = 0;
                let totalCPU_ = 0;
                let totalMemory = 0;
                let totalMemory_ = 0;

                rows.forEach(row => {
                    const columns = row.trim().split(/\s+/); // Split by whitespace
                    if (columns.length >= 3) {
                        const cpu = self.parseCPU(columns[1]);
                        const cpu_ = self.parseCPU_(columns[2]);
                        const memory = self.parseMemory(columns[3]);
                        const memory_ = self.parseMemory_(columns[4]);
                        totalCPU += cpu;
                        totalCPU_ += Math.floor(cpu / cpu_ * 100);
                        totalMemory += memory;
                        totalMemory_ += memory / memory_ * 100;
                    }
                });

                this.range.cpu = totalCPU_;
                this.range.memory = totalMemory_;

                if (isNaN(totalCPU) || isNaN(totalMemory)) return;

                this.chart.cpu.push([this.chart.index, totalCPU]);
                this.chart.memory.push([this.chart.index, totalMemory]);

                this.chart.index += 1;

                if (this.chart.cpu.length > 20) {
                    this.chart.cpu.shift();
                }

                if (this.chart.memory.length > 20) {
                    this.chart.memory.shift();
                }

                // console.log(`Total CPU: ${totalCPU}m`);
                // console.log(`Total Memory: ${totalMemory}Mi`);

                self.drawCharts(self);
            });

        }, 1000);
    }

    /**
     * Parse memory usage and convert units to GiB.
     * @param {string} memory - The memory usage string (e.g., "512Mi").
     * @returns {number} The memory usage in GiB.
     */
    parseMemory(memory) {
        const unit = memory.slice(-2); // Get the unit (Mi, Gi, etc.)
        const value = parseFloat(memory.slice(0, -2)); // Get the numeric part
        const factor = { Ki: 1 / (1024 * 1024), Mi: 1 / 1024, Gi: 1 }[unit] || 0;
        return value * factor; // Convert to GiB
    }

    /**
     * Parse memory usage percentage.
     * @param {string} memory - The memory usage percentage string (e.g., "50%").
     * @returns {number} The memory usage percentage.
     */
    parseMemory_(memory) {
        if (memory.endsWith('%')) {
            return parseFloat(memory.slice(0, -1)); // Convert millicores directly
        }
    }

    /**
     * Parse CPU usage and convert to cores.
     * @param {string} cpu - The CPU usage string (e.g., "500m").
     * @returns {number} The CPU usage in cores.
     */
    parseCPU(cpu) {
        if (cpu.endsWith('m')) {
            return parseFloat(cpu.slice(0, -1)) / 1000; // Convert millicores to cores
        }
        return parseFloat(cpu); // Return cores directly
    }

    /**
     * Parse CPU usage percentage.
     * @param {string} cpu - The CPU usage percentage string (e.g., "50%").
     * @returns {number} The CPU usage percentage.
     */
    parseCPU_(cpu) {
        if (cpu.endsWith('%')) {
            return parseFloat(cpu.slice(0, -1)); // Convert percentage to cores
        }
    }

    /**
     * Draw the charts for CPU and memory usage.
     * @param {ClusterNodeStats} self - The instance of ClusterNodeStats.
     */
    drawCharts(self) {

        google.charts.load('current', { 'packages': ['corechart'], });

        if (self.chart.cpu.length == 0) return;

        google.charts.setOnLoadCallback(() => {

            let cpuUsage = Math.round(100 * ((self.chart.cpu).reduce((acc, curr) => acc + curr[1], 0) / self.chart.cpu.length) / self.range.cpu);

            let data = google.visualization.arrayToDataTable([
                ['Time', 'CPU ' + cpuUsage + '% of ' + Math.floor(self.range.cpu) + ' cores'],
                ...self.chart.cpu
            ]);

            let options = {
                // title: 'CPU Usage Over Time',
                legend: { position: 'bottom' },
                backgroundColor: '#f8f9fa',
                chartArea: { left: 30, right: 20, top: 20, bottom: 60 },
                colors: cpuUsage > 99 ? ['#f75fb4'] : ['#20c997'],
                lineWidth: 2,
                pointSize: 0,
                hAxis: {
                    title: 'Time',
                    gridlines: { color: '#e9ecef' },
                    textPosition: 'none' // Hide h axis digits
                },
                vAxis: {
                    title: '',
                    gridlines: { color: '#e9ecef' },
                    viewWindow: {
                        min: 0,
                        max: self.range.cpu
                    }
                },
                isStacked: true,
                areaOpacity: 0.2
            };

            let chart = new google.visualization.AreaChart(document.querySelector(".cpu-stats"));
            chart.draw(data, options);

            let ramUsage = Math.round(100 * ((self.chart.memory).reduce((acc, curr) => acc + curr[1], 0) / self.chart.memory.length) / self.range.memory);

            // RAM
            data = google.visualization.arrayToDataTable([
                ['Time', 'RAM ' + ramUsage + '% of ' + Math.round(self.range.memory) + 'Gi'],
                ...self.chart.memory
            ]);

            let options2 = {
                // title: 'RAM Usage Over Time',
                legend: { position: 'bottom' },
                backgroundColor: '#f8f9fa',
                chartArea: { left: 30, right: 20, top: 20, bottom: 60 },
                colors: ramUsage > 99 ? ['#f75fb4'] : ['#1941df'],
                lineWidth: 2,
                pointSize: 0, // Hide chart dots
                hAxis: {
                    title: 'Time',
                    gridlines: { color: '#e9ecef' },
                    textPosition: 'none' // Hide h axis digits
                },
                vAxis: {
                    title: '',
                    gridlines: { color: '#e9ecef' },
                    viewWindow: {
                        min: 0,
                        max: self.range.memory
                    }
                },
                isStacked: true,
                areaOpacity: 0.2
            };

            let chart2 = new google.visualization.AreaChart(document.querySelector(".ram-stats"));
            chart2.draw(data, options2);
        });
    }

    /**
     * Initialize the cluster node stats view and start refreshing charts.
     */
    init() {

        let self = this;

        document.querySelector(this.selector).innerHTML = this.view();

        // draw regions
        loadDependencies("https://www.gstatic.com/charts/loader.js", () => self.drawCharts(self));

        this.refreshCharts();

        this.listeners();
    }
}
