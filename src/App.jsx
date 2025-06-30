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

const getFileIcon = (nodeType) => {
  if (nodeType === 'directory') {
    return '📁'; // Folder icon
  } else {
    return '📄'; // File icon
  }
};

const DirectoryTree = ({ node, parentSize = 0, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);

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
  const barColor = `hsl(${120 - (percentage * 1.2)}, 70%, 60%)`; // Green to Red gradient

  return (
    <div className="directory-tree-container">
      <div className={`directory-tree-item ${node.type}`} onClick={toggleOpen}>
        {node.type === 'directory' && <span className="toggle-icon">{isOpen ? '▼' : '►'}</span>}
        <span style={{ marginRight: '5px' }}>{getFileIcon(node.type)}</span>
        <span className={node.type === 'directory' ? 'directory-name' : 'file-name'} onClick={() => window.electronAPI.openPath(node.path)} style={{ cursor: 'pointer' }}>{node.name}</span>
        <span className="size-info">({formatBytes(node.size)})</span>
        <button onClick={(e) => { e.stopPropagation(); onDelete(node.path); }} style={{ marginLeft: '10px', backgroundColor: '#e74c3c', padding: '5px 8px', fontSize: '0.8em' }}>Delete</button>
      </div>
      <div className="size-bar-container">
        <div className="size-bar" style={{ width: `${percentage}%`, backgroundColor: barColor }}></div>
      </div>
      {isOpen && node.children && (
        <div>
          {sortedChildren.map((child, index) => (
            <DirectoryTree key={index} node={child} parentSize={node.size} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [scanResult, setScanResult] = useState(null);
  const [selectedDirectory, setSelectedDirectory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState({ message: '', percentage: 0 });
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleOpenDialog = async () => {
    const directoryPath = await window.electronAPI.openDirectoryDialog();
    if (directoryPath) {
      setSelectedDirectory(directoryPath);
      setScanResult(null); // Clear previous scan result
      setScanProgress({ message: '', percentage: 0 }); // Clear previous progress
      setSearchTerm(''); // Clear search term
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
        // setScanProgress(''); // Keep the last progress message
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

  const filterTree = (node, term) => {
    if (!node) return null;
    const lowerCaseTerm = term.toLowerCase();

    const matches = node.name.toLowerCase().includes(lowerCaseTerm);

    if (node.children) {
      const filteredChildren = node.children
        .map(child => filterTree(child, term))
        .filter(child => child !== null);

      if (matches || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
    } else if (matches) {
      return { ...node };
    }

    return null;
  };

  const filteredScanResult = filterTree(scanResult, searchTerm);

  return (
    <div>
      <h1>Disk Analyzer</h1>
      <p>Visualize and manage your disk space efficiently.</p>
      <button onClick={handleOpenDialog} disabled={isLoading}>Select Directory</button>
      {selectedDirectory && <p>Selected Directory: {selectedDirectory}</p>}
      <button onClick={handleScan} disabled={!selectedDirectory || isLoading}>Scan Disk</button>
      {isLoading && (
        <>
          <button onClick={handleCancel} style={{ marginLeft: '10px' }}>Cancel Scan</button>
          <p>{scanProgress.message} ({scanProgress.percentage}%)</p>
          <div style={{ width: '100%', backgroundColor: '#e0e0e0', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ width: `${scanProgress.percentage}%`, backgroundColor: '#3498db', height: '100%', borderRadius: '10px', transition: 'width 0.5s ease-in-out' }}></div>
          </div>
        </>
      )}
      {scanResult && scanResult.error && <p style={{ color: 'red' }}>Error: {scanResult.error}</p>}
      {scanResult && !scanResult.error && (
        <div>
          <h2>Detailed Scan Results:</h2>
          <input
            type="text"
            placeholder="Search files/folders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {filteredScanResult ? (
            <DirectoryTree node={filteredScanResult} onDelete={handleDelete} />
          ) : (
            <p>No results found for "{searchTerm}"</p>
          )}
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
