const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI',
  {
    scanDirectory: (directoryPath) => ipcRenderer.invoke('scan-directory', directoryPath),
    openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
    onScanProgress: (callback) => ipcRenderer.on('scan-progress', (event, message) => callback(message)),
    openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
    deletePath: (filePath) => ipcRenderer.invoke('delete-path', filePath),
    cancelScan: () => ipcRenderer.invoke('cancel-scan')
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
