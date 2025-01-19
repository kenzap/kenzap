'use strict';

import { __html, getDefaultAppPath } from './helpers.js'
import * as path from 'path';
import fs from "fs"

/**
 * Retrieves first kubeconfig-xx.yaml file path for a given ID.
 *
 * @param {string} id - The identifier used to locate the kubeconfig file.
 * @returns {string|null} The full path to the kubeconfig file if found, otherwise null.
 */
export function getAppKubeconfig(id) {

    if (!id) return null;

    const appPath = path.join(getDefaultAppPath(), id);
    const files = fs.readdirSync(appPath);
    const kubeconfigFile = files.find(file => file.startsWith('kubeconfig'));
    return kubeconfigFile ? path.join(appPath, kubeconfigFile) : null;
}