import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../style.css';

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (nodeType, fileName = '') => {
  if (nodeType === 'directory') {
    return '📁';
  }
  
  // Get file extension
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  // Return appropriate icon based on file type
  switch (ext) {
    case 'pdf': return '📄';
    case 'doc':
    case 'docx': return '📝';
    case 'xls':
    case 'xlsx': return '📊';
    case 'ppt':
    case 'pptx': return '📈';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg': return '🖼️';
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'mkv': return '🎬';
    case 'mp3':
    case 'wav':
    case 'flac': return '🎵';
    case 'zip':
    case 'rar':
    case '7z': return '📦';
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx': return '⚡';
    case 'html':
    case 'css': return '🌐';
    case 'py': return '🐍';
    case 'java': return '☕';
    case 'cpp':
    case 'c': return '⚙️';
    case 'txt': return '📃';
    default: return '📄';
  }
};

const getSizeBarColor = (percentage) => {
  if (percentage > 80) return '#ef4444'; // Red
  if (percentage > 60) return '#f59e0b'; // Orange
  if (percentage > 40) return '#eab308'; // Yellow
  if (percentage > 20) return '#22c55e'; // Green
  return '#3b82f6'; // Blue
};

const DirectoryTree = ({ node, parentSize = 0, onDelete, level = 0 }) => {
  const [isOpen, setIsOpen] = useState(level === 0); // Only expand root level (level 0)

  const toggleOpen = () => {
    if (node.type === 'directory') {
      setIsOpen(!isOpen);
    }
  };

  const sortedChildren = node.children ? [...node.children].sort((a, b) => {
    // Sort by size (descending) first
    if (b.size !== a.size) {
      return b.size - a.size;
    }
    // Then sort by name (alphabetical)
    return a.name.localeCompare(b.name);
  }) : [];

  const percentage = parentSize > 0 ? (node.size / parentSize) * 100 : 0;
  const barColor = getSizeBarColor(percentage);

  return (
    <div className="directory-tree-container fade-in">
      <div className={`directory-tree-item ${node.type}`} onClick={toggleOpen}>
        {node.type === 'directory' && (
          <span className={`toggle-icon ${isOpen ? 'open' : ''}`}>
            ▶
          </span>
        )}
        <span className="file-icon">{getFileIcon(node.type, node.name)}</span>
        <span 
          className={`item-name ${node.type === 'directory' ? 'directory-name' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            window.electronAPI.openPath(node.path);
          }}
          title={`Open ${node.name}`}
        >
          {node.name}
        </span>
        <span className="size-info">{formatBytes(node.size)}</span>
        <button 
          className="btn btn-danger delete-btn"
          onClick={(e) => { 
            e.stopPropagation(); 
            onDelete(node.path); 
          }}
          title={`Delete ${node.name}`}
        >
          🗑️
        </button>
      </div>
      
      {percentage > 0 && (
        <div className="size-bar-container">
          <div 
            className="size-bar" 
            style={{ 
              width: `${Math.min(percentage, 100)}%`, 
              backgroundColor: barColor 
            }}
          ></div>
        </div>
      )}
      
      {isOpen && node.children && sortedChildren.length > 0 && (
        <div className="slide-in">
          {sortedChildren.map((child, index) => (
            <DirectoryTree 
              key={`${child.path}-${index}`} 
              node={child} 
              parentSize={node.size} 
              onDelete={onDelete}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check for saved theme preference or default to light
    const savedTheme = localStorage.getItem('theme') || 'light';
    setIsDark(savedTheme === 'dark');
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setIsDark(!isDark);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
      {isDark ? '☀️' : '🌙'}
    </button>
  );
};

const App = () => {
  const [scanResult, setScanResult] = useState(null);
  const [selectedDirectory, setSelectedDirectory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState({ message: '', percentage: 0 });

  useEffect(() => {
    window.electronAPI.onScanProgress((progressData) => {
      // Handle both old string format and new object format for backward compatibility
      if (typeof progressData === 'string') {
        setScanProgress({ message: progressData, percentage: 0 });
      } else {
        setScanProgress(progressData);
      }
    });
  }, []);

  useEffect(() => {
    window.electronAPI.onDirectorySelected((directoryPath) => {
      setSelectedDirectory(directoryPath);
      setScanResult(null); // Clear previous scan result
      setScanProgress({ message: '', percentage: 0 }); // Clear previous progress
    });
  }, []);

  const handleOpenDialog = async () => {
    const directoryPath = await window.electronAPI.openDirectoryDialog();
    if (directoryPath) {
      setSelectedDirectory(directoryPath);
      setScanResult(null); // Clear previous scan result
      setScanProgress({ message: '', percentage: 0 }); // Clear previous progress
    }
  };

  const handleScan = async () => {
    if (selectedDirectory) {
      setIsLoading(true);
      setScanProgress({ message: 'Starting scan...', percentage: 0 });
      try {
        const result = await window.electronAPI.scanDirectory(selectedDirectory);
        if (result && result.canceled) {
          setScanProgress({ message: 'Scan cancelled.', percentage: 0 });
        } else {
          setScanResult(result);
          setScanProgress({ message: 'Scan completed!', percentage: 100 });
        }
      } catch (error) {
        setScanResult({ error: error.message });
      } finally {
        setIsLoading(false);
      }
    } else {
      setScanResult({ error: 'Please select a directory first.' });
    }
  };

  const handleCancel = () => {
    window.electronAPI.cancelScan();
    setIsLoading(false);
    setScanProgress({ message: 'Scan cancelled.', percentage: 0 });
  };

  const handleDelete = async (pathToDelete) => {
    const response = await window.electronAPI.deletePath(pathToDelete);
    if (response.success) {
      // Refresh the scan after successful deletion
      handleScan();
    } else if (response.error) {
      alert(`Error deleting: ${response.error}`);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="app-title">
            <div className="app-icon">💾</div>
            <div>
              <h1>DiskAnalyzer</h1>
              <div className="app-subtitle">Visualize and manage your disk space efficiently</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3 className="section-title">
              <span className="section-icon">📂</span>
              Directory Selection
            </h3>
            <button 
              className="btn btn-primary btn-full" 
              onClick={handleOpenDialog} 
              disabled={isLoading}
            >
              {isLoading ? <span className="loading-spinner"></span> : '📁'}
              Select Directory
            </button>
            
            {selectedDirectory && (
              <div className="selected-directory">
                <strong>Selected:</strong>
                <div className="directory-path">{selectedDirectory}</div>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <h3 className="section-title">
              <span className="section-icon">🔍</span>
              Scan Control
            </h3>
            <button 
              className="btn btn-secondary btn-full" 
              onClick={handleScan} 
              disabled={!selectedDirectory || isLoading}
            >
              {isLoading ? <span className="loading-spinner"></span> : '🚀'}
              {isLoading ? 'Scanning...' : 'Start Scan'}
            </button>
            
            {isLoading && (
              <button 
                className="btn btn-danger btn-full" 
                onClick={handleCancel}
                style={{ marginTop: 'var(--spacing-sm)' }}
              >
                ⏹️ Cancel Scan
              </button>
            )}
          </div>

          {(isLoading || scanProgress.message) && (
            <div className="sidebar-section">
              <div className="progress-section">
                <div className="progress-header">
                  <h3 className="section-title">
                    <span className="section-icon">📊</span>
                    Progress
                  </h3>
                  <span className="progress-percentage">{scanProgress.percentage}%</span>
                </div>
                <div className="progress-text">{scanProgress.message}</div>
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${scanProgress.percentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Content Area */}
        <div className="content-area">
          <div className="content-header">
            <h2 className="content-title">
              <span>📈</span>
              Disk Usage Analysis
            </h2>
          </div>
          
          <div className="content-body">
            {scanResult && scanResult.error && (
              <div className="error-message">
                <span>⚠️</span>
                <span>Error: {scanResult.error}</span>
              </div>
            )}
            
            {scanResult && !scanResult.error ? (
              <DirectoryTree node={scanResult} onDelete={handleDelete} />
            ) : !isLoading && !scanResult ? (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <h3 className="empty-state-title">Ready to Analyze</h3>
                <p className="empty-state-description">
                  Select a directory from the sidebar and click "Start Scan" to begin analyzing your disk usage.
                  The results will appear here with an interactive tree view showing file and folder sizes.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);