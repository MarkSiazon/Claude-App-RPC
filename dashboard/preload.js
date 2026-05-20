const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  pickConfig: () => ipcRenderer.invoke('pick-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  daemonStatus: () => ipcRenderer.invoke('daemon-status'),
  daemonRestart: () => ipcRenderer.invoke('daemon-restart'),
});
