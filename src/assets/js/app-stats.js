import { __html, getSetting, loadDependencies, parseError } from './helpers.js'
import fs from "fs"
import yaml from 'js-yaml';
import * as path from 'path';
import { run_script } from './dev-tools.js'
import { getAppKubeconfig } from './app-status-helpers.js'

/**
 * Class representing application statistics.
 */
export class AppStats {

    /**
     * Create an instance of AppStats.
     * @param {Object} global - The global object containing application state.
     */
    constructor(global) {

        this.range = { cpu: "1000", memory: "1000" };
        this.chart = { index: 19, cpu: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0], [17, 0], [18, 0], [19, 0]], memory: [[0, 0.01], [1, 0.01], [2, 0.01], [3, 0.01], [4, 0.01], [5, 0.01], [6, 0.01], [7, 0.01], [8, 0.01], [9, 0.01], [10, 0.01], [11, 0.01], [12, 0.01], [13, 0.01], [14, 0.01], [15, 0.01], [16, 0.01], [17, 0.01], [18, 0.01], [19, 0.01]] };
        this.selector = "app-stats";
        this.global = global;
    }

    /**
     * Generate the HTML view for the application statistics.
     * @returns {string} The HTML string for the view.
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
                <p class="form-text">${__html('Your app`s resource consumption.')}</p>
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
     * Convert docker CPU to OPS (operations per second per code)
     * Benchmark examples: https://www.vpsbenchmarks.com/compare/hetzner
     * Ex.: CPX31, AMD 4 vCPU = 5,700 ops/s, 1425
     * @name getOps
     * @param {Integer} cpu - docker cpu value
     * @param {Function} callback - callback function
     */
    getOps(cpu) {

        return 1425 * 1000 / parseInt(cpu);
    }

    /**
     * Retrieve and normalize the resource range (CPU and memory) from the application configuration.
     */
    getResourceRange() {

        let self = this;

        let cache = getSetting(this.global.state.app.id);

        let read = false;

        // read endpoints
        if (cache.path) if (fs.existsSync(path.join(cache.path, 'app.yaml'))) {

            try {

                const appYaml = yaml.loadAll(fs.readFileSync(path.join(cache.path, 'app.yaml'), 'utf8'));

                this.range.cpu = self.normalizeCPU(appYaml[0].spec.template.spec.containers[0].resources.requests.cpu);
                this.range.memory = self.normalizeRAM(appYaml[0].spec.template.spec.containers[0].resources.requests.memory);

                console.log("CPU", this.range.cpu);
                console.log("RAM", this.range.memory);


                read = true;

            } catch (err) {

                console.log(err);

                parseError(err);
            }
        }
    }

    /**
     * Normalize the CPU value by removing the 'm' suffix.
     * @param {string} cpu - The CPU value with 'm' suffix.
     * @returns {string} The normalized CPU value.
     */
    normalizeCPU(cpu) {

        return cpu.replace("m", "");
    }

    /**
     * Normalize the RAM value by removing the 'Mi' suffix.
     * @param {string} ram - The RAM value with 'Mi' suffix.
     * @returns {string} The normalized RAM value.
     */
    normalizeRAM(ram) {

        return ram.replace("Mi", "");
    }

    /**
     * Refresh the charts by fetching the latest resource usage data and updating the charts.
     */
    refreshCharts() {

        let self = this;

        let app = this.global.state.app;

        self.cache = getSetting(app.id);

        let kubeconfig = getAppKubeconfig(app.id);

        if (!kubeconfig) return;

        if (self.statsInterval) clearInterval(self.statsInterval);

        self.getResourceRange();

        let cb = (data) => {

        }

        self.statsInterval = setInterval(() => {

            if (!document.querySelector(".cpu-stats")) { clearInterval(self.statsInterval); return; }

            let proc = run_script('cd ' + self.cache.path + ' && kubectl top pods -n ' + app.id + ' --kubeconfig=' + kubeconfig + ' --sum=true', [], cb, false);

            proc.stdout.on('data', (data) => {

                let output = data.toString();

                // console.log(stats);
                // Extract rows from the output
                const rows = output.trim().split('\n').slice(1); // Skip the header row
                let totalCPU = 0;
                let totalMemory = 0;

                rows.forEach(row => {
                    const columns = row.trim().split(/\s+/); // Split by whitespace
                    if (columns.length >= 3) {
                        const cpu = columns[1];
                        const memory = columns[2];
                        totalCPU += self.parseCPU(cpu);
                        totalMemory += self.parseMemory(memory);
                    }
                });

                // const currentTime = new Date().toLocaleTimeString([], { second: '2-digit',  });
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
     * Parse the memory value and convert it to MiB.
     * @param {string} memory - The memory value with unit suffix.
     * @returns {number} The memory value in MiB.
     */
    parseMemory(memory) {
        const unit = memory.slice(-2); // Get the unit (Mi, Gi, etc.)
        const value = parseFloat(memory.slice(0, -2)); // Get the numeric part
        const factor = { Ki: 1 / 1024, Mi: 1, Gi: 1024 }[unit] || 0;
        return value * factor; // Convert to MiB
    }

    /**
     * Parse the CPU value and convert it to millicores.
     * @param {string} cpu - The CPU value with unit suffix.
     * @returns {number} The CPU value in millicores.
     */
    parseCPU(cpu) {
        if (cpu.endsWith('m')) {
            return parseFloat(cpu.slice(0, -1)); // Convert millicores directly
        }
        return parseFloat(cpu) * 1000; // Convert cores to millicores
    }

    /**
     * Draw the CPU and RAM usage charts using Google Charts.
     * @param {AppStats} self - The instance of AppStats.
     */
    drawCharts(self) {

        google.charts.load('current', { 'packages': ['corechart'], });

        if (self.chart.cpu.length == 0) return;

        google.charts.setOnLoadCallback(() => {

            if (!document.querySelector(".cpu-stats")) if (self.statsInterval) clearInterval(self.statsInterval);

            let cpuUsage = Math.round(100 * ((self.chart.cpu).reduce((acc, curr) => acc + curr[1], 0) / self.chart.cpu.length) / self.range.cpu);

            let data = google.visualization.arrayToDataTable([
                ['Time', 'CPU Usage ' + cpuUsage + '%'],
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
                ['Time', 'RAM Usage ' + ramUsage + '%'],
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
     * Initialize the application statistics view and start refreshing the charts.
     */
    init() {

        let self = this;

        document.querySelector(this.selector).innerHTML = this.view();

        // draw regions
        loadDependencies("https://www.gstatic.com/charts/loader.js", () => self.drawCharts(self));

        this.refreshCharts();
    }
}
