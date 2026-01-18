// Background service worker

const SIZE_LIMIT_MB = 10;
const SIZE_LIMIT_BYTES = SIZE_LIMIT_MB * 1024 * 1024;

// Simulated malware check server endpoint (replace with your actual server)
const MALWARE_CHECK_SERVER = 'http://localhost:3000/api/check-malware';

// Simulate malware check - in production, this would call your actual server
async function checkForMalware(fileInfo) {
  // TODO: Replace with actual server call
  // Example of what a real implementation would look like:
  /*
  try {
    const response = await fetch(MALWARE_CHECK_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: fileInfo.filename,
        size: fileInfo.size,
        url: fileInfo.url,
        mime: fileInfo.mime
      })
    });
    const result = await response.json();
    return result.isMalware;
  } catch (err) {
    console.error('Malware check failed:', err);
    return false; // Fail open or closed depending on your security policy
  }
  */
  
  // SIMULATION: Treat all files as malware for testing
  console.log('🔍 Simulating malware check for:', fileInfo.filename);
  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      console.log('⚠️ SIMULATED: File flagged as malware');
      resolve(true); // Always return true (malware detected) for simulation
    }, 500);
  });
}

// Runs when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  
  // Initialize storage with default values
  chrome.storage.local.set({ 
    largeDownloads: [],
    blockedDownloads: []
  });
});

// Monitor downloads
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    // Get download details
    chrome.downloads.search({ id: delta.id }, async (downloads) => {
      if (downloads.length === 0) return;
      const download = downloads[0];
      const fileSizeMB = (download.fileSize / (1024 * 1024)).toFixed(2);
      const filename = download.filename.split(/[/\\]/).pop();

      // Check for malware FIRST
      const fileInfo = {
        filename: filename,
        fullPath: download.filename,
        size: fileSizeMB,
        url: download.url,
        mime: download.mime
      };

      const isMalware = await checkForMalware(fileInfo);

      if (isMalware) {
        console.log('🚫 Malware detected! Removing file:', filename);
        
        // Delete the downloaded file
        chrome.downloads.removeFile(delta.id, () => {
          if (chrome.runtime.lastError) {
            console.error('Failed to remove file:', chrome.runtime.lastError);
          } else {
            console.log('✅ Malicious file removed successfully');
          }
        });

        // Remove from download history
        chrome.downloads.erase({ id: delta.id });

        // Store blocked download info
        const blockedEntry = {
          filename: filename,
          fullPath: download.filename,
          size: fileSizeMB,
          time: new Date().toLocaleTimeString(),
          date: new Date().toLocaleDateString(),
          url: download.url,
          reason: 'Malware detected (simulated)'
        };

        chrome.storage.local.get(['blockedDownloads'], (result) => {
          const blockedDownloads = result.blockedDownloads || [];
          blockedDownloads.unshift(blockedEntry);
          chrome.storage.local.set({ blockedDownloads });
        });

        // Show warning notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🚫 Malware Blocked!',
          message: `${filename} was detected as malware and has been removed.`,
          priority: 2,
          requireInteraction: true
        });

        return; // Don't process further
      }

      // If not malware, continue with size check
      if (download.fileSize > SIZE_LIMIT_BYTES) {
        // Build file:// URL from local path
        const localPath = download.filename;
        const fileUrl = 'file:///' + localPath.replace(/\\/g, '/');
        
        const previewEntry = {
          filename: filename,
          fullPath: localPath,
          size: fileSizeMB,
          time: new Date().toLocaleTimeString(),
          previewType: null,
          preview: null,
          mime: null,
          url: download.url || null
        };

        try {
          // Try to fetch the first 1KB of the LOCAL file to prove we can access it
          const res = await fetch(fileUrl);
          if (res && res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            
            // Only take first 1024 bytes for preview
            const previewBytes = bytes.slice(0, 1024);
            
            // Convert to hex dump format
            let hexDump = '';
            for (let i = 0; i < previewBytes.length; i += 16) {
              // Offset
              const offset = i.toString(16).padStart(8, '0');
              
              // Hex values
              let hex = '';
              let ascii = '';
              for (let j = 0; j < 16; j++) {
                if (i + j < previewBytes.length) {
                  const byte = previewBytes[i + j];
                  hex += byte.toString(16).padStart(2, '0') + ' ';
                  // Printable ASCII range
                  ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
                } else {
                  hex += '   ';
                  ascii += ' ';
                }
              }
              
              hexDump += `${offset}  ${hex} |${ascii}|\n`;
            }
            
            previewEntry.preview = `Successfully read ${bytes.length} bytes from local file!\nShowing first ${previewBytes.length} bytes:\n\n${hexDump}`;
            previewEntry.previewType = 'bytes';
            previewEntry.totalBytes = bytes.length;
          }
        } catch (err) {
          // Fetching local file failed
          console.warn('Local file fetch failed:', err);
          previewEntry.preview = `Failed to read local file:\n${err.message}\n\nMake sure "Allow access to file URLs" is enabled for this extension in chrome://extensions/`;
          previewEntry.previewType = 'error';
        }

        // Store the large download info
        chrome.storage.local.get(['largeDownloads'], (result) => {
          const largeDownloads = result.largeDownloads || [];
          largeDownloads.push(previewEntry);
          chrome.storage.local.set({ largeDownloads });

          // Notify via notification API if available
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Large File Downloaded',
            message: `${previewEntry.filename} (${fileSizeMB} MB) exceeds the ${SIZE_LIMIT_MB}MB limit`
          });
        });
      }
    });
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getLargeDownloads') {
    chrome.storage.local.get(['largeDownloads'], (result) => {
      sendResponse({ downloads: result.largeDownloads || [] });
    });
    return true;
  }
  
  if (request.action === 'getBlockedDownloads') {
    chrome.storage.local.get(['blockedDownloads'], (result) => {
      sendResponse({ downloads: result.blockedDownloads || [] });
    });
    return true;
  }
  
  if (request.action === 'clearBlockedDownloads') {
    chrome.storage.local.set({ blockedDownloads: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
