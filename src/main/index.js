'use strict'

import * as path from 'path'
import { format as formatUrl } from 'url'
import global from '../assets/js/global.js'
import { mainMenu } from '../assets/js/menu.js'
import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'

const isDevelopment = process.env.NODE_ENV !== 'production'

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: __dirname + '/assets/img/icon',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })

  window.setTitle("Kenzap");

  window.on('page-title-updated', function (e) {
    e.preventDefault()
  });

  // if (isDevelopment) {
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

  mainWindow = createMainWindow();

  global.state.dialog = dialog;

  // console.log(global.state.dialog);
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
})