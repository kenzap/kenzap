'use strict'

import * as path from 'path'
import { format as formatUrl } from 'url'
import global from '../assets/js/global.js'
import { mainMenu } from '../assets/js/menu.js'
import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import { getTemplatesPath } from '../assets/js/dev-tools.js'
import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';


const isDevelopment = process.env.NODE_ENV !== 'production'

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow

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

  mainWindow = createMainWindow();

  global.state.dialog = dialog;

  Menu.setApplicationMenu(mainMenu);

  // electron folder picker dialog
  ipcMain.handle("pick-folder", async (event, options) => {

    const {
      name, //the name showed for the extension/s
      extensions,
      fileName
    } = options;
    // let filters = [{ name: name, extensions: Array.isArray(extensions) ? extensions : [extensions] }];
    var returnValue = await dialog.showSaveDialog(
      null,
      {
        title: "Choose folder",
        properties: ['openDirectory'],
        buttonLabel: "Choose",
        nameFieldLabel: "",
        // name: [name],
        // filters: filters,
        icon: 'main.ico',
        defaultPath: "*/app.kenzap"
        // defaultPath: (fileName || name) + '.' + extensions
      }
    );
    return returnValue;
  });

  // electron file picker dialog
  ipcMain.handle("pick-file", async (event, options) => {
    const {
      name, // the name showed for the extension/s
      extensions,
      fileName
    } = options;
    let filters = [{ name: name, extensions: Array.isArray(extensions) ? extensions : [extensions] }];
    var returnValue = await dialog.showOpenDialog(
      null,
      {
        title: "Choose file",
        properties: ['openFile'],
        buttonLabel: "Choose",
        filters: filters,
        defaultPath: (fileName || name) + '.' + (extensions ? extensions[0] : '')
      }
    );
    return returnValue;
  });

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