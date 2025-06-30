const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI',
  {
    scanDirectory: (directoryPath) => ipcRenderer.invoke('scan-directory', directoryPath),
    openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
    onScanProgress: (callback) => ipcRenderer.on('scan-progress', (event, message) => callback(message)),
    onDirectorySelected: (callback) => ipcRenderer.on('directory-selected', (event, directoryPath) => callback(directoryPath)),
    openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
    deletePath: (filePath) => ipcRenderer.invoke('delete-path', filePath),
    cancelScan: () => ipcRenderer.invoke('cancel-scan'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url)
  }
);

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
});