'use strict';

import global from "./global.js"
import { __html, getKenzapSettings, saveKenzapSettings } from './helpers.js'
import { installKubernetes, joinKubernetes } from './cluster-kubernetes-helpers.js'

/**
 * Class representing the status of a cluster.
 */
export class ClusterStatus {

    /**
     * Create a ClusterStatus instance.
     * @param {Object} g - Global object.
     */
    constructor(g) {

        this.global = g;
    }

    /**
     * Initialize the cluster status monitoring.
     * Sets up a periodic check for cluster status if not already set.
     */
    init() {

        if (!global.clusterStatusTimeout) { global.clusterStatusTimeout = setInterval(() => { this.getClusterStatus(); }, 30 * 1000); } else { console.log("skip getClusterStatus call"); }

        this.getClusterStatus();
    }

    /**
     * Get latest status of running nodes in the cluster.
     * Mark frontend as online, pending, offline.
     * To optmise performance get only UI visible app state
     * 
     * @name getClusterStatus
     * @param {Function} callback - callback function
     */
    getClusterStatus() {

        this.settings = getKenzapSettings();

        this.settings.clusters.map(cluster => {

            if (cluster.status == "creating") this.checkClusterState(cluster);

            if (cluster.status == "creating") return;

            if (cluster.status == "error") return;
        });
    }

    /**
     * Check if all nodes in the cluster are ready.
     * @param {Object} cluster - The cluster object.
     * @returns {boolean} True if all nodes are ready, false otherwise.
     */
    areAllNodesReady(cluster) {

        return cluster.servers.every(server => server.status === 'ready');
    }

    /**
     * Check if all nodes in the cluster are active.
     * @param {Object} cluster - The cluster object.
     * @returns {boolean} True if all nodes are active, false otherwise.
     */
    areAllNodesActive(cluster) {

        return cluster.servers.every(server => server.status === 'active');
    }

    /**
     * Check and update the state of the cluster.
     * If all nodes are ready, mark the cluster as ready.
     * If all nodes are active, mark the cluster as active.
     * Install Kubernetes on the first server that is not ready or active and not connected.
     * Join Kubernetes on the first server that is ready and not connected.
     * @param {Object} cluster - The cluster object.
     */
    checkClusterState(cluster) {

        // check if all nodes are ready
        if (this.areAllNodesReady(cluster)) {

            if (cluster.status != 'ready' && cluster.status != 'active') {

                cluster.status = 'ready';

                this.settings.clusters = this.settings.clusters.map(c => c.id === cluster.id ? cluster : c);

                saveKenzapSettings(this.settings);

                this.global.state.refreshClusters();
            }
        }

        // check if all nodes are active
        if (this.areAllNodesActive(cluster)) {

            if (cluster.status != 'active') {

                cluster.status = 'active';

                this.settings.clusters = this.settings.clusters.map(c => c.id === cluster.id ? cluster : c);

                saveKenzapSettings(this.settings);

                this.global.state.refreshClusters();
            }
        }

        // get first server to install kubernetes
        const serverToInstall = cluster.servers.find(server => server.status != 'ready' && server.status != 'active' && !server.connected);

        if (serverToInstall) installKubernetes(cluster, serverToInstall);

        // get first server to unite with kubernetes cluster
        const serverToConnect = cluster.servers.find(server => server.status === 'ready' && !server.connected);

        if (serverToConnect) joinKubernetes(cluster, serverToConnect);
    }
}
