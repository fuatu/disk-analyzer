// Worker thread for scanning a directory tree
const { parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

let cancelled = false;

// Listen for cancellation messages from main process
parentPort.on('message', (data) => {
  if (data.type === 'cancel') {
    console.log('Worker received cancellation request');
    cancelled = true;
  }
});

async function scanDirectory(directoryPath, enableProgress = false) {
  // Check for cancellation at the start of each directory scan
  if (cancelled) {
    parentPort.postMessage({ type: 'cancelled' });
    process.exit(0);
  }
  
  let totalSize = 0;
  const children = [];
  
  try {
    const files = await fs.readdir(directoryPath, { withFileTypes: true });
    
    // Count directories in this level for progress reporting
    let foundDirs = 0;
    for (const file of files) {
      if (file.isDirectory()) {
        foundDirs++;
      }
    }
    
    // Report directories found and current scanning location
    if (enableProgress && foundDirs > 0) {
      parentPort.postMessage({ 
        type: 'progress', 
        currentPath: path.basename(directoryPath),
        found: foundDirs,
        processed: 0
      });
    }
    
    let processedDirs = 0;
    for (const file of files) {
      // Check for cancellation before processing each file/directory
      if (cancelled) {
        parentPort.postMessage({ type: 'cancelled' });
        process.exit(0);
      }
      
      const fullPath = path.join(directoryPath, file.name);
      try {
        if (file.isDirectory()) {
          // Recursively scan subdirectory in this worker
          const subDir = await scanDirectory(fullPath, enableProgress);
          
          // Validate subdirectory size
          if (isNaN(subDir.size) || subDir.size < 0) {
            console.warn(`Invalid size for directory ${fullPath}: ${subDir.size}`);
            subDir.size = 0;
          }
          
          totalSize += subDir.size;
          children.push({
            name: file.name,
            path: fullPath,
            size: subDir.size,
            type: 'directory',
            children: subDir.children,
          });
          
          processedDirs++;
          // Report progress after processing each directory
          if (enableProgress) {
            parentPort.postMessage({ 
              type: 'progress', 
              currentPath: file.name,
              found: 0,
              processed: 1
            });
          }
        } else {
          const stats = await fs.stat(fullPath);
          let fileSize = Number(stats.size);
          
          // For very large files (>10GB), check if it's a sparse file using du
          if (fileSize > 10 * 1024 * 1024 * 1024) { // > 10GB
            try {
              // Use du without -B1 flag for better macOS compatibility
              const duResult = await new Promise((resolve, reject) => {
                const du = spawn('du', ['-k', fullPath]); // Get size in KB
                let output = '';
                
                du.stdout.on('data', (data) => {
                  output += data.toString();
                });
                
                du.on('close', (code) => {
                  if (code === 0) {
                    const sizeInKB = parseInt(output.split('\t')[0]);
                    const actualSize = sizeInKB * 1024; // Convert KB to bytes
                    resolve(actualSize);
                  } else {
                    resolve(fileSize); // Fallback to stat size
                  }
                });
                
                du.on('error', () => {
                  resolve(fileSize); // Fallback to stat size
                });
                
                // Timeout after 5 seconds to avoid hanging
                setTimeout(() => {
                  du.kill();
                  resolve(fileSize);
                }, 5000);
              });
              
              if (duResult < fileSize && duResult > 0) {
                console.log(`Sparse file detected: ${file.name}, logical: ${(fileSize / (1024*1024*1024)).toFixed(2)} GB, actual: ${(duResult / (1024*1024*1024)).toFixed(2)} GB`);
                fileSize = duResult;
              }
            } catch (e) {
              console.warn(`Error running du for ${file.name}: ${e.message}`);
              // Fallback to blocks if available
              if (stats.blocks !== undefined && stats.blocks > 0) {
                const diskUsage = stats.blocks * 512; // blocks are typically 512 bytes
                if (diskUsage < fileSize) {
                  console.log(`Using block size for ${file.name}: ${(diskUsage / (1024*1024*1024)).toFixed(2)} GB instead of ${(fileSize / (1024*1024*1024)).toFixed(2)} GB`);
                  fileSize = diskUsage;
                }
              }
            }
          }
          
          // Validate file size
          if (isNaN(fileSize) || fileSize < 0) {
            console.warn(`Invalid file size for ${file.name}: ${fileSize}, using 0`);
            fileSize = 0;
          }
          
          totalSize += fileSize;
          children.push({
            name: file.name,
            path: fullPath,
            size: fileSize,
            type: 'file',
          });
        }
      } catch (error) {
        // Ignore errors for individual files
      }
    }
  } catch (error) {
    // Ignore errors for directory
    console.warn(`Error scanning directory ${directoryPath}: ${error.message}`);
  }
  
  // Final validation of total size
  if (isNaN(totalSize) || totalSize < 0) {
    console.warn(`Invalid total size for ${directoryPath}: ${totalSize}, resetting to 0`);
    totalSize = 0;
  }
  
  // Debug: Log directory sizes for troubleshooting
  if (totalSize > 100 * 1024 * 1024) { // > 100MB
    console.log(`Directory: ${path.basename(directoryPath)}, size: ${(totalSize / (1024*1024)).toFixed(2)} MB, children: ${children.length}`);
  }
  
  return {
    name: path.basename(directoryPath),
    path: directoryPath,
    size: totalSize,
    type: 'directory',
    children,
  };
}

(async () => {
  try {
    const result = await scanDirectory(workerData.directoryPath, workerData.enableProgress);
    if (!cancelled) {
      parentPort.postMessage({ type: 'result', result });
    }
  } catch (error) {
    if (!cancelled) {
      throw error;
    }
  }
})();
