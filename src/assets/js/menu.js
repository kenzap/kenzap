import { app, Menu } from 'electron'

const isMac = process.platfom === 'darwin'

const template = [

    ...(isMac ? [{
        label: app.name,
        submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'quit' }
        ]
    }] : []),
    {
        label: 'File',
        submenu: [
            {
                label: 'About Kenzap',
                click: async () => {
                    require('electron').shell.openExternal("https://kenzap.com");
                }
            },
            {
                label: 'Contact Support',
                click: async () => {
                    require('electron').shell.openExternal("https://kenzap.com/kenzap-cloud/");
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Quit Kenzap',
                role: 'quit'
            }
        ]
    },
    {
        label: "Edit",
        submenu: [
            { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
            { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
            { type: "separator" },
            { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
            { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
            { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
            { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
        ]
    }
]

export const mainMenu = Menu.buildFromTemplate(template);