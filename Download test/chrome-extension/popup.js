document.addEventListener('DOMContentLoaded', () => {
  const downloadsList = document.getElementById('downloadsList');
  const blockedList = document.getElementById('blockedList');
  const clearBtn = document.getElementById('clearBtn');
  const clearBlockedBtn = document.getElementById('clearBlockedBtn');

  // Load blocked downloads
  const loadBlockedDownloads = () => {
    chrome.storage.local.get(['blockedDownloads'], (result) => {
      const blocked = result.blockedDownloads || [];
      
      if (blocked.length === 0) {
        blockedList.innerHTML = '<p class="no-downloads">No blocked files</p>';
      } else {
        blockedList.innerHTML = blocked.map((dl) => `
          <div class="download-item blocked">
            <div class="download-name">🚫 ${escapeHtml(dl.filename)}</div>
            <div class="download-path">${escapeHtml(dl.fullPath || '')}</div>
            <div class="download-info">${dl.size} MB · ${dl.time} · ${dl.date}</div>
            <div class="blocked-reason">${escapeHtml(dl.reason)}</div>
          </div>
        `).join('');
      }
    });
  };

  // Load large downloads from storage
  const loadDownloads = () => {
    chrome.storage.local.get(['largeDownloads'], (result) => {
      const downloads = result.largeDownloads || [];
      
      if (downloads.length === 0) {
        downloadsList.innerHTML = '<p class="no-downloads">No large files detected yet</p>';
      } else {
        downloadsList.innerHTML = downloads.map((dl, idx) => {
          const hasPreview = dl.previewType && dl.preview;
          
          // Build preview content based on type
          let previewContent = '';
          if (hasPreview) {
            switch (dl.previewType) {
              case 'text':
                previewContent = `<pre class="preview-text">${escapeHtml(dl.preview)}</pre>`;
                break;
              case 'bytes':
                previewContent = `<pre class="preview-bytes">${escapeHtml(dl.preview)}</pre>`;
                break;
              case 'error':
                previewContent = `<pre class="preview-error">${escapeHtml(dl.preview)}</pre>`;
                break;
              case 'image':
                previewContent = `<img class="preview-image" src="${dl.preview}"/>`;
                break;
              case 'pdf':
                previewContent = `<div class="preview-pdf">
                  <iframe class="pdf-embed" src="${dl.preview}" type="application/pdf"></iframe>
                </div>`;
                break;
              case 'video':
                previewContent = `<video class="preview-video" controls src="${dl.preview}">Your browser does not support video.</video>`;
                break;
              case 'audio':
                previewContent = `<audio class="preview-audio" controls src="${dl.preview}">Your browser does not support audio.</audio>`;
                break;
              default:
                previewContent = `<p>Preview type: ${dl.previewType}</p>`;
            }
          }
          
          // File type icon
          const icon = getFileIcon(dl.filename, dl.previewType);
          
          // Show full path if available
          const pathInfo = dl.fullPath ? `<div class="download-path">${escapeHtml(dl.fullPath)}</div>` : '';
          
          return `
          <div class="download-item" data-idx="${idx}">
            <div class="download-name">${icon} ${dl.filename}</div>
            ${pathInfo}
            <div class="download-info">${dl.size} MB · ${dl.time}</div>
            ${hasPreview ? `<button class="toggle-preview">Show Preview</button>` : `<div class="no-preview">No preview available</div>`}
            ${hasPreview ? `<div class="preview" style="display:none">${previewContent}</div>` : ''}
          </div>
        `}).join('');
      }
    });
  };

  // Load all data on popup open
  loadBlockedDownloads();
  loadDownloads();

  // Clear buttons
  clearBtn.addEventListener('click', () => {
    chrome.storage.local.set({ largeDownloads: [] }, loadDownloads);
  });

  clearBlockedBtn.addEventListener('click', () => {
    chrome.storage.local.set({ blockedDownloads: [] }, loadBlockedDownloads);
  });

  // Refresh every 2 seconds
  setInterval(() => {
    loadBlockedDownloads();
    loadDownloads();
  }, 2000);
  
  // Delegate click for preview toggles
  downloadsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('toggle-preview')) {
      const item = e.target.closest('.download-item');
      if (!item) return;
      const previewEl = item.querySelector('.preview');
      if (!previewEl) return;
      if (previewEl.style.display === 'none') {
        previewEl.style.display = 'block';
        e.target.textContent = 'Hide Preview';
      } else {
        previewEl.style.display = 'none';
        e.target.textContent = 'Show Preview';
      }
    }
  });
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c];
  });
}

function getFileIcon(filename, previewType) {
  const ext = filename.split('.').pop().toLowerCase();
  
  if (previewType === 'pdf' || ext === 'pdf') return '📄';
  if (previewType === 'video' || ['mp4', 'webm', 'mov', 'avi'].includes(ext)) return '🎬';
  if (previewType === 'audio' || ['mp3', 'wav', 'flac', 'aac'].includes(ext)) return '🎵';
  if (previewType === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
  if (['exe', 'msi', 'dmg', 'app'].includes(ext)) return '⚙️';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📽️';
  
  return '📎';
}