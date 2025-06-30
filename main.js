const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { Worker } = require('worker_threads');

let currentWorker = null;

// Multi-threaded scan using worker threads for the root directory
async function scanDirectoryTreeWithWorkers(event, directoryPath) {
  return new Promise((resolve, reject) => {
    let lastUpdate = Date.now();
    let totalDirectories = 0;
    let processedDirectories = 0;
    let estimatedTotal = 1; // Start with at least 1 to avoid division by zero
    
    const worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { directoryPath, enableProgress: true }
    });
    
    // Store the current worker for cancellation
    currentWorker = worker;
    
    worker.on('message', (data) => {
      if (data.type === 'progress') {
        const now = Date.now();
        
        if (data.found) {
          // Update our estimate of total directories as we discover them
          totalDirectories += data.found;
          estimatedTotal = Math.max(estimatedTotal, totalDirectories + Math.floor(totalDirectories * 0.1)); // Add 10% buffer for undiscovered dirs
        }
        
        if (data.processed) {
          processedDirectories += data.processed;
        }
        
        // Throttle progress updates to every 200ms to avoid overwhelming the UI
        if (now - lastUpdate > 200) {
          const percentage = Math.min(Math.floor((processedDirectories / estimatedTotal) * 100), 95);
          event.sender.send('scan-progress', { 
            message: `Scanning: ${data.currentPath}`, 
            percentage: percentage
          });
          lastUpdate = now;
        }
      } else if (data.type === 'result') {
        currentWorker = null; // Clear reference when done
        resolve(data.result);
      } else if (data.type === 'cancelled') {
        currentWorker = null; // Clear reference when cancelled
        resolve({ canceled: true });
      }
    });
    
    worker.on('error', (err) => {
      currentWorker = null; // Clear reference on error
      reject(err);
    });
    
    worker.on('exit', (code) => {
      currentWorker = null; // Clear reference on exit
      if (code !== 0 && code !== 1) { // Exit code 1 is expected for cancelled workers
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

function getAppIcon() {
  // For window icons, PNG works better across all platforms
  const iconPath = path.join(__dirname, 'assets', 'icons', 'icon.png');

  console.log(`Platform: ${process.platform}`);
  console.log(`Looking for icon at: ${iconPath}`);

  // Check if icon file exists, return undefined if not (Electron will use default)
  try {
    const fs = require('fs');
    fs.accessSync(iconPath, fs.constants.F_OK);
    console.log(`✅ Icon file found: ${iconPath}`);
    return iconPath;
  } catch (error) {
    console.log(`❌ Icon file not found: ${iconPath}. Using default system icon.`);
    console.log(`Error: ${error.message}`);
    return undefined;
  }
}

function createWindow() {
  let iconPath;

  // Try to get the icon path, but don't fail if it doesn't work
  try {
    iconPath = getAppIcon();
  } catch (error) {
    console.log('Error getting app icon:', error.message);
    iconPath = undefined;
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: iconPath, // Use the resolved icon path (or undefined for default)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    show: false, // Don't show until ready
  });

  win.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // Show window when ready to prevent flash
  win.once('ready-to-show', () => {
    win.show();
  });

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
  try {
    // Use worker thread for scanning with real-time progress
    event.sender.send('scan-progress', { message: 'Starting scan...', percentage: 0 });
    const tree = await scanDirectoryTreeWithWorkers(event, directoryPath);
    if (tree.canceled) {
      event.sender.send('scan-progress', { message: 'Scan cancelled.', percentage: 0 });
      return tree;
    }
    
    // Log final result for debugging
    console.log(`Scan completed for ${directoryPath}. Total size: ${tree.size} bytes (${(tree.size / (1024*1024*1024)).toFixed(2)} GB)`);
    
    event.sender.send('scan-progress', { message: 'Scan completed!', percentage: 100 });
    return tree;
  } catch (error) {
    console.error(`Failed to scan directory ${directoryPath}: ${error.message}`);
    return { error: error.message };
  }
});

ipcMain.handle('cancel-scan', () => {
  console.log('Scan cancellation requested by user.');
  if (currentWorker) {
    // Send cancel message to worker
    currentWorker.postMessage({ type: 'cancel' });
    console.log('Cancel message sent to worker.');
  }
  return { success: true };
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

ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error(`Failed to open external URL ${url}: ${error.message}`);
    return { error: error.message };
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

function createMenu() {
  const template = [
    {
      label: 'DiskAnalyzer',
      submenu: [
        // {
        //   label: 'Credits',
        //   click: () => {
        //     createCreditsWindow();
        //   }
        // },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Directory...',
          accelerator: process.platform === 'darwin' ? 'Cmd+O' : 'Ctrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory']
            });
            if (!result.canceled && result.filePaths.length > 0) {
              // Send the selected directory to the renderer process
              const focusedWindow = BrowserWindow.getFocusedWindow();
              if (focusedWindow) {
                focusedWindow.webContents.send('directory-selected', result.filePaths[0]);
              }
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About DiskAnalyzer',
          click: () => {
            createCreditsWindow();
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    // Add About menu item at the beginning for macOS (standard macOS behavior)
    template[0].submenu.unshift({
      label: 'About DiskAnalyzer',
      click: () => {
        createCreditsWindow();
      }
    });

    // Window menu adjustments for macOS
    template[3].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  app.setName('DiskAnalyzer');
  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
