const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let scanCanceled = false;

let scanStats = { processed: 0, total: 0 };

async function countDirectories(directoryPath) {
  let count = 0;
  try {
    const files = await fs.readdir(directoryPath, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) {
        count++;
        const fullPath = path.join(directoryPath, file.name);
        try {
          count += await countDirectories(fullPath);
        } catch (error) {
          // Continue counting even if some directories are inaccessible
        }
      }
    }
  } catch (error) {
    // Continue if directory is inaccessible
  }
  return count;
}

async function scanDirectoryTree(event, directoryPath, isRoot = false) {
  if (scanCanceled) {
    return { canceled: true };
  }
  
  if (isRoot) {
    // Count total directories for progress tracking
    event.sender.send('scan-progress', { message: 'Counting directories...', percentage: 0 });
    scanStats.total = await countDirectories(directoryPath);
    scanStats.processed = 0;
  }
  
  let totalSize = 0;
  const children = [];

  try {
    const files = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(directoryPath, file.name);
      try {
        if (file.isDirectory()) {
          scanStats.processed++;
          const percentage = scanStats.total > 0 ? Math.round((scanStats.processed / scanStats.total) * 100) : 0;
          event.sender.send('scan-progress', { 
            message: `Scanning: ${file.name}`, 
            percentage: Math.min(percentage, 100)
          });
          
          const subDir = await scanDirectoryTree(event, fullPath, false);
          if (subDir.canceled) return { canceled: true }; // Propagate cancellation
          totalSize += subDir.size;
          children.push({
            name: file.name,
            path: fullPath,
            size: subDir.size,
            type: 'directory',
            children: subDir.children,
          });
        } else {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
          children.push({
            name: file.name,
            path: fullPath,
            size: stats.size,
            type: 'file',
          });
        }
      } catch (error) {
        console.error(`Error accessing ${fullPath}: ${error.message}`);
        // Continue scanning other files even if one fails
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${directoryPath}: ${error.message}`);
  }
  return {
    name: path.basename(directoryPath),
    path: directoryPath,
    size: totalSize,
    type: 'directory',
    children: children,
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  // win.webContents.openDevTools(); // Removed to prevent dev tools from opening automatically
  win.on('closed', () => {
    app.quit(); // Quit the app when the window is closed
  });
}

ipcMain.handle('open-directory-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle('open-path', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error(`Failed to open path ${filePath}: ${error.message}`);
    return { error: error.message };
  }
});

ipcMain.handle('scan-directory', async (event, directoryPath) => {
  console.log(`Scanning directory: ${directoryPath}`);
  scanCanceled = false; // Reset cancellation flag for new scan
  try {
    const tree = await scanDirectoryTree(event, directoryPath, true);
    return tree;
  } catch (error) {
    console.error(`Failed to scan directory ${directoryPath}: ${error.message}`);
    return { error: error.message };
  }
});

ipcMain.handle('cancel-scan', () => {
  scanCanceled = true;
  console.log('Scan cancelled by user.');
});

ipcMain.handle('delete-path', async (event, itemPath) => {
  const options = {
    type: 'warning',
    buttons: ['Yes', 'No'],
    defaultId: 1,
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete ${itemPath}? This action cannot be undone.`,
  };

  const response = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), options);

  if (response.response === 0) { // 'Yes' button clicked
    try {
      await fs.rm(itemPath, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      console.error(`Failed to delete ${itemPath}: ${error.message}`);
      return { success: false, error: error.message };
    }
  } else {
    return { success: false, cancelled: true };
  }
});

let creditsWin = null;

function createCreditsWindow() {
  if (creditsWin) {
    creditsWin.focus();
    return;
  }

  creditsWin = new BrowserWindow({
    width: 400,
    height: 400, // Adjusted height to ensure close button is visible
    parent: BrowserWindow.getFocusedWindow(),
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
    },
  });

  creditsWin.loadFile(path.join(__dirname, 'Credits.html'));

  creditsWin.once('ready-to-show', () => {
    creditsWin.show();
  });

  creditsWin.on('closed', () => {
    creditsWin = null;
  });
}

app.whenReady().then(() => {
  app.setName('DiskAnalyzer');
  createWindow();

  const template = [
    {
      label: app.name,
      submenu: [
        {
          label: 'About ' + app.name,
          click: () => {
            app.showAboutPanel();
          }
        },
        {
          label: 'Credits',
          click: () => {
            createCreditsWindow();
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
