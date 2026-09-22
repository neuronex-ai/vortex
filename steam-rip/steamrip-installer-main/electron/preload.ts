import { ipcRenderer, contextBridge } from 'electron'
import type { InstallGamePayload, InstallGameResult, InstallProgress } from '../src/types'

// --------- Expose some API to the Renderer process ---------
// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('api', {
  getRunners: () => ipcRenderer.invoke('get-runners'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  installGame: (payload: InstallGamePayload): Promise<InstallGameResult> =>
    ipcRenderer.invoke('install-game', payload),
  openHeroic: () => ipcRenderer.invoke('open-heroic'),
  onInstallProgress: (callback: (progress: InstallProgress) => void) => {
    const subscription = (_event: unknown, value: InstallProgress) => callback(value);
    ipcRenderer.on('install-progress', subscription);
    return () => ipcRenderer.removeListener('install-progress', subscription);
  },
  onInstallLog: (callback: (log: string) => void) => {
    const subscription = (_event: unknown, value: string) => callback(value);
    ipcRenderer.on('install-log', subscription);
    return () => ipcRenderer.removeListener('install-log', subscription);
  }
})
