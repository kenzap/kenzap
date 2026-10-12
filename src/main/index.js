'use strict'

import * as path from 'path'
import { format as formatUrl } from 'url'
import global from '../assets/js/global.js'
import { mainMenu } from '../assets/js/menu.js'
import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import { getTemplatesPath } from '../assets/js/templates-path.js'
import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import { ClusterConnections } from './cluster-connections.js';
import { ClusterMonitor } from './cluster-monitor.js';
import { EndpointDeployer } from './endpoint-deployer.js';
import { PodConsole } from './pod-console.js';
import { AppPublisher } from './app-publisher.js';
import { AppSync } from './app-sync.js';


const isDevelopment = process.env.NODE_ENV !== 'production'

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow
let clusterConnections
let clusterMonitor
let endpointDeployer
let podConsole
let appPublisher
let appSync

function registerClusterConnectionHandlers() {
  clusterConnections = new ClusterConnections({
    baseDir: path.join(os.homedir(), 'Kenzap'),
    runtimeDir: path.join(app.getPath('userData'), 'cluster-connections'),
    confirmHost: async ({ endpoint, fingerprint }) => {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question', title: 'Verify SSH server',
        message: `Trust the SSH server at ${endpoint}?`,
        detail: `Fingerprint: ${fingerprint}\n\nCompare this fingerprint with one obtained from your server administrator or server console. Future connections will require this same key.`,
        buttons: ['Cancel', 'Trust server'], defaultId: 0, cancelId: 0, noLink: true
      });
      return result.response === 1;
    },
    onStatus: status => {
      if (clusterMonitor) clusterMonitor.invalidate(status.id);
      if (endpointDeployer) endpointDeployer.invalidate(status.id);
      if (podConsole) podConsole.invalidate(status.id);
      if (appPublisher) appPublisher.invalidate(status.id);
      if (appSync) appSync.connectionChanged(status);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('cluster-connection-status', status);
    }
  });
  clusterMonitor = new ClusterMonitor({ connections: clusterConnections });
  endpointDeployer = new EndpointDeployer({ monitor: clusterMonitor });
  podConsole = new PodConsole({ monitor: clusterMonitor });
  appPublisher = new AppPublisher({ monitor: clusterMonitor, onUpdate: update => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app-publish-update', update);
  } });
  appSync = new AppSync({ monitor: clusterMonitor,
    canStart: appId => !appPublisher.list().some(job => job.appId === appId && job.running),
    onUpdate: update => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app-sync-update', update);
    }
  });

  const handle = (channel, callback) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, id) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unknown connection request.');
      try { return { ok: true, value: await callback(id) }; }
      catch (error) { return { ok: false, error: error.message, code: error.code || '' }; }
    });
  };
  handle('cluster-connection-list', () => clusterConnections.list(true));
  handle('cluster-monitor-read', request => clusterMonitor.read(request));
  handle('app-endpoints-deploy', request => endpointDeployer.deploy(request && request.appId));
  handle('app-pod-console-open', request => podConsole.open(request));
  handle('app-publish-start', request => {
    if (request && appSync.isBusy(request.appId)) throw new Error('Stop live sync before publishing this app.');
    return appPublisher.start(request);
  });
  handle('app-publish-cancel', request => appPublisher.cancel(request));
  handle('app-publish-list', () => appPublisher.list());
  handle('app-sync-start', request => appSync.start(request));
  handle('app-sync-stop', request => appSync.stop(request));
  handle('app-sync-list', () => appSync.list());
  handle('cluster-connection-connect', id => clusterConnections.connect(id));
  handle('cluster-connection-disconnect', id => clusterConnections.disconnect(id));
  handle('cluster-connection-export', async id => {
    const connection = clusterConnections.list().find(item => item.id === id && item.state === 'connected');
    if (!connection) throw new Error('Connect this cluster via SSH before exporting its kubeconfig.');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export SSH kubeconfig', defaultPath: `kubeconfig-${id}-ssh.yaml`,
      filters: [{ name: 'YAML', extensions: ['yaml'] }]
    });
    if (result.canceled) return null;
    fs.writeFileSync(result.filePath, fs.readFileSync(connection.kubeconfigPath), { mode: 0o600 });
    fs.chmodSync(result.filePath, 0o600);
    return result.filePath;
  });
}

function getDialogOwnerWindow(event) {
  const ownerWindow = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  return ownerWindow || mainWindow || null;
}

function normalizeDialogOptions(options) {
  if (!options || Array.isArray(options)) return {};
  return options;
}

function getDialogFilters(options = {}) {
  if (Array.isArray(options.filters)) return options.filters;

  const extensions = Array.isArray(options.extensions) ? options.extensions : [options.extensions];
  const normalizedExtensions = extensions
    .filter(Boolean)
    .map(extension => extension.replace(/^\./, ''));

  if (!normalizedExtensions.length) return [];

  return [{ name: options.name || 'Files', extensions: normalizedExtensions }];
}

function getDialogDefaultPath(options = {}) {
  if (options.defaultPath) return options.defaultPath;

  const baseName = options.fileName || options.name;
  if (!baseName) return undefined;

  const extension = Array.isArray(options.extensions) ? options.extensions[0] : options.extensions;
  const normalizedExtension = extension ? `.${String(extension).replace(/^\./, '')}` : '';

  return `${baseName}${normalizedExtension}`;
}

function registerDialogHandlers() {
  ipcMain.removeHandler("pick-folder");
  ipcMain.handle("pick-folder", async (event, rawOptions) => {

    const options = normalizeDialogOptions(rawOptions);
    const {
      title = "Choose folder",
      buttonLabel = "Choose",
      nameFieldLabel = "",
      defaultPath = "*/app.kenzap"
    } = options;

    return dialog.showSaveDialog(
      getDialogOwnerWindow(event),
      {
        title,
        properties: ['openDirectory'],
        buttonLabel,
        nameFieldLabel,
        icon: 'main.ico',
        defaultPath
      }
    );
  });

  ipcMain.removeHandler("pick-file");
  ipcMain.handle("pick-file", async (event, rawOptions) => {
    const options = normalizeDialogOptions(rawOptions);
    const {
      title = "Choose file",
      properties = ['openFile'],
      buttonLabel = "Choose"
    } = options;

    const dialogOptions = {
      title,
      properties: Array.isArray(properties) && properties.length ? properties : ['openFile'],
      buttonLabel
    };

    const filters = getDialogFilters(options);
    if (filters.length) dialogOptions.filters = filters;

    const defaultPath = getDialogDefaultPath(options);
    if (defaultPath) dialogOptions.defaultPath = defaultPath;

    return dialog.showOpenDialog(getDialogOwnerWindow(event), dialogOptions);
  });
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "assets", "img", "icon"),
    webPreferences: { nodeIntegration: true, contextIsolation: false, preload: path.join(__dirname, 'preload.js') }
  })

  window.setTitle("KENZAP");

  window.on('page-title-updated', function (e) {
    e.preventDefault()
  });

  // console.log("createMainWindow");
  console.log("KENZAP_DEBUG" + process.env.KENZAP_DEBUG);

  // auto open browser inspect 
  // if (process.env.KENZAP_DEBUG == "1") {
  window.webContents.openDevTools()
  // }

  window.webContents.once('did-finish-load', () => {
    clusterConnections.restore().catch(error => console.error('Cannot restore SSH connections:', error.message));
  });

  if (isDevelopment) {
    window.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`)
  } else {
    window.loadURL(formatUrl({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file',
      slashes: true
    }))
  }

  window.on('closed', () => {
    mainWindow = null
  })

  window.webContents.on('devtools-opened', () => {
    window.focus()
    setImmediate(() => {
      window.focus()
    })
  })

  return window
}

function setupProductionPaths() {
  if (process.platform !== 'darwin') return;

  const homeDir = os.homedir();
  const pathFile = path.join(app.getPath('userData'), 'resolved_paths.json');

  // Try to load cached paths
  // let cachedPaths;
  // // try {
  // //   cachedPaths = JSON.parse(fs.readFileSync(pathFile, 'utf8'));
  // //   if (Array.isArray(cachedPaths?.paths) && cachedPaths.timestamp > Date.now() - 86400000) {
  // //     process.env.PATH = cachedPaths.paths.join(':');
  // //     return;
  // //   }
  // // } catch { }

  // Build fresh path list
  const extraPaths = [
    // User-specific paths
    `${homeDir}/.nvm/versions/node/v19.9.0/bin`,
    `${homeDir}/.nvm/versions/node/v19.9.0/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin`,
    `${homeDir}/opt/anaconda3/bin`,
    `${homeDir}/.dotnet/tools`,

    // System paths
    '/usr/local/bin',
    '/usr/local/sbin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/opt/homebrew/opt/ruby/bin',
    '/usr/local/MacGPG2/bin',
    '/usr/local/share/dotnet',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/opt/local/bin',
    '/opt/local/sbin',
    '/Library/Apple/usr/bin',
    '/Library/Frameworks/Mono.framework/Versions/Current/Commands',
    '/Applications/Docker.app/Contents/Resources/bin',
    '/usr/local/kubebuilder/bin'
  ];

  const existingPaths = extraPaths.filter(p => fs.existsSync(p));
  const currentPaths = process.env.PATH.split(':');
  const combinedPaths = [...new Set([...existingPaths, ...currentPaths])];

  // Cache the resolved paths
  fs.writeFileSync(pathFile, JSON.stringify({
    paths: combinedPaths,
    timestamp: Date.now()
  }));

  process.env.PATH = combinedPaths.join(':');

  // Verify command availability
  // verifyCommands();
}

registerDialogHandlers();

function verifyCommands() {
  const requiredCommands = {
    docker: ['docker --version', 'Docker'],
    brew: ['brew --version', 'Homebrew'],
    devspace: ['devspace --version', 'DevSpace'],
    kubectl: ['kubectl version --client', 'Kubernetes CLI'],
    which: ['which which', 'Which utility']
  };

  const missing = [];

  for (const [cmd, [test, name]] of Object.entries(requiredCommands)) {
    try {
      execSync(test, { stdio: 'ignore' });
    } catch {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    dialog.showErrorBox(
      'Missing Dependencies',
      `The following required tools were not found: ${missing.join(', ')}\n\n` +
      'Please install them and ensure they are in your PATH.'
    );
  }
}

// cors issue
// app.on('web-contents-created', (_, contents) => {
//   contents.session.webRequest.onHeadersReceived((details, callback) => {
//     callback({
//       responseHeaders: {
//         ...details.responseHeaders,
//         'Access-Control-Allow-Origin': ['*'],
//       },
//     });
//   });
// });

// quit application when all windows are closed
app.on('window-all-closed', () => {
  // on macOS it is common for applications to stay open until the user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (appSync) appSync.close();
  if (appPublisher) appPublisher.close();
  if (podConsole) podConsole.close();
  if (endpointDeployer) endpointDeployer.close();
  if (clusterMonitor) clusterMonitor.close();
  if (clusterConnections) clusterConnections.close();
})

app.on('activate', () => {
  // on macOS it is common to re-create a window even after all windows have been closed
  if (mainWindow === null) {
    mainWindow = createMainWindow()
  }
})

// create main BrowserWindow when electron is ready
app.on('ready', () => {

  // At the start of your main process
  // if (process.platform === 'darwin') {
  //   process.env.PATH = [
  //     '/usr/local/bin',
  //     '/Applications/Docker.app/Contents/Resources/bin',
  //     '/opt/homebrew/bin',
  //     process.env.PATH
  //   ].join(':');
  // }

  if (process.env.NODE_ENV === 'production') setupProductionPaths();

  registerClusterConnectionHandlers();

  mainWindow = createMainWindow();

  global.state.dialog = dialog;

  Menu.setApplicationMenu(mainMenu);

  // Function to load plugins dynamically
  async function loadPlugin(pluginName) {
    try {
      const pluginPath = path.resolve(path.join(getTemplatesPath(), "apps", pluginName, "1", "actions", "index.js"));

      const { Actions } = require(pluginPath).default || require(pluginPath);

      // console.log(Actions);

      // const plugin = require(pluginPath);
      return Actions;
    } catch (error) {
      console.error(`Failed to load plugin: ${pluginName}`, error);
      return null;
    }
  }

  // Handle requests to load a plugin dynamically
  ipcMain.handle("load-plugin", async (event, pluginName) => {
    const plugin = await loadPlugin(pluginName);
    return plugin ? plugin.name : null;
  });

  ipcMain.handle("run-plugin-action", async (event, pluginName, action, data) => {
    const plugin = await loadPlugin(pluginName);
    if (plugin && typeof plugin[action] === "function") {
      return plugin[action](data);
    } else {
      return `Action ${action} not found in ${pluginName}`;
    }
  });
})
