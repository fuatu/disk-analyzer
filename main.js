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
