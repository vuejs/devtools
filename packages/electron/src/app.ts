import path from 'node:path'
import { URL } from 'node:url'
import { app, BrowserWindow } from 'electron'
import { init as initServer } from './server'

initServer()

let mainWindow: BrowserWindow | null = null
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, '../icons/128.png'),
    webPreferences: {
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      // @TODO: enabled in dev mode
      devTools: false,
    },
  })
  const appEntryPath = path.join(__dirname, '../app.html')
  const url = new URL(`file://${appEntryPath}`).toString()
  mainWindow.setMenu(null)
  mainWindow.loadURL(new URL(url).toString())

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})

app.on('activate', () => {
  if (mainWindow === null)
    createWindow()
})
