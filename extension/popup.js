const API_BASE_URL = 'http://localhost:8000';
const DASHBOARD_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
  const analyzingList = document.getElementById('analyzingList');
  const completedList = document.getElementById('completedList');
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const clearAnalyzingBtn = document.getElementById('clearAnalyzingBtn');
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const serverStatus = document.getElementById('serverStatus');
  const fileAccessStatus = document.getElementById('fileAccessStatus');
  const fileAccessHelp = document.getElementById('fileAccessHelp');
  const geminiModeToggle = document.getElementById('geminiModeToggle');
  const modeDescription = document.getElementById('modeDescription');

  // Load Gemini mode setting
  async function loadGeminiModeSetting() {
    const result = await chrome.storage.local.get(['geminiMode']);
    const geminiMode = result.geminiMode || false;
    geminiModeToggle.checked = geminiMode;
    updateModeDescription(geminiMode);
  }

  // Update mode description text
  function updateModeDescription(isGemini) {
    modeDescription.textContent = isGemini 
      ? 'Using Gemini only (faster)' 
      : 'Using LLM4Decompile + Gemini';
  }

  // Handle toggle change
  geminiModeToggle.addEventListener('change', () => {
    const geminiMode = geminiModeToggle.checked;
    chrome.storage.local.set({ geminiMode });
    updateModeDescription(geminiMode);
  });

  // Check if extension has file access permission
  async function checkFileAccess() {
    try {
      // Try to fetch a file:// URL - if it fails, we don't have permission
      const testUrl = 'file:///C:/';
      const response = await fetch(testUrl, { method: 'HEAD' }).catch(() => null);
      
      // If we got here without an error, we have file access
      // (even if the specific path doesn't exist)
      if (response !== null) {
        fileAccessStatus.textContent = 'Enabled';
        fileAccessStatus.className = 'status-connected';
        fileAccessHelp.style.display = 'none';
      } else {
        throw new Error('No file access');
      }
    } catch (err) {
      fileAccessStatus.textContent = 'Not enabled';
      fileAccessStatus.className = 'status-warning';
      fileAccessHelp.style.display = 'block';
    }
  }

  // Check server status
  async function checkServerStatus() {
    try {
      // Try root health endpoint first, then /api/health
      let response;
      try {
        response = await fetch(`${API_BASE_URL}/health`, { 
          method: 'GET',
          mode: 'cors',
          signal: AbortSignal.timeout(3000)
        });
      } catch {
        response = await fetch(`${API_BASE_URL}/api/health`, { 
          method: 'GET',
          mode: 'cors',
          signal: AbortSignal.timeout(3000)
        });
      }
      
      if (response.ok) {
        serverStatus.textContent = 'Connected';
        serverStatus.className = 'status-connected';
      } else {
        serverStatus.textContent = 'Error (' + response.status + ')';
        serverStatus.className = 'status-error';
      }
    } catch (err) {
      console.error('Server check failed:', err);
      serverStatus.textContent = 'Offline';
      serverStatus.className = 'status-offline';
    }
  }

  // Load analyzing jobs
  const loadAnalyzingJobs = () => {
    chrome.storage.local.get(['analyzingJobs'], (result) => {
      const jobs = result.analyzingJobs || [];
      
      if (jobs.length === 0) {
        analyzingList.innerHTML = '<p class="no-downloads">No files being analyzed</p>';
      } else {
        analyzingList.innerHTML = jobs.map((job) => `
          <div class="download-item analyzing">
            <div class="download-name">
              <span class="icon icon-sm">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </span>
              ${escapeHtml(job.filename)}
            </div>
            <div class="download-meta">
              <span class="mode-badge ${job.geminiMode ? 'gemini' : ''}">${job.geminiMode ? 'Gemini' : 'LLM4Decompile'}</span>
            </div>
            <div class="download-info">${job.size} MB · ${job.time}</div>
            <div class="job-status">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${job.progress}%"></div>
              </div>
              <div class="status-text">${escapeHtml(job.stage)} (${job.progress}%)</div>
            </div>
          </div>
        `).join('');
      }
    });
  };

  // Load completed jobs
  const loadCompletedJobs = () => {
    chrome.storage.local.get(['completedJobs'], (result) => {
      const jobs = result.completedJobs || [];
      
      if (jobs.length === 0) {
        completedList.innerHTML = '<p class="no-downloads">No completed analyses</p>';
      } else {
        completedList.innerHTML = jobs.map((job) => {
          // Determine status class based on malware detection
          let statusClass = job.status === 'completed' ? 'success' : 'failed';
          let iconSvg;
          let statusMessage = job.error ? escapeHtml(job.error) : job.stage;
          
          if (job.malwareDetected) {
            statusClass = 'failed';
            iconSvg = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
            statusMessage = `MALWARE: ${job.malwareThreats?.join(', ') || 'Detected'}${job.fileDeleted ? ' (File deleted)' : ''}`;
          } else if (job.status === 'completed') {
            iconSvg = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>';
            statusMessage = 'Safe - No malware detected';
          } else {
            iconSvg = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
          }
          
          return `
            <div class="download-item ${statusClass}${job.malwareDetected ? ' malware' : ''}" data-job-id="${job.id}">
              <div class="download-name">
                <span class="icon icon-sm" style="color: var(--${statusClass})">${iconSvg}</span>
                ${escapeHtml(job.filename)}
              </div>
              <div class="download-meta">
                <span class="mode-badge ${job.geminiMode ? 'gemini' : ''}">${job.geminiMode ? 'Gemini' : 'LLM4Decompile'}</span>
                · ${job.time}
              </div>
              <div class="job-result ${statusClass}">
                ${statusMessage}
              </div>
              ${job.status === 'completed' && !job.malwareDetected ? `<button class="view-results-btn" data-job-id="${job.id}">View in Dashboard</button>` : ''}
            </div>
          `;
        }).join('');
      }
    });
  };

  // Check server and load all data on popup open
  loadGeminiModeSetting();
  checkServerStatus();
  checkFileAccess();
  
  // Request immediate refresh from background worker (triggers polling)
  chrome.runtime.sendMessage({ action: 'refreshJobs' }, (response) => {
    if (response) {
      console.log('[Popup] Got refreshed data from background');
    }
    // Load from storage (which should now be updated)
    loadAnalyzingJobs();
    loadCompletedJobs();
  });

  // Refresh every 2 seconds
  setInterval(() => {
    loadAnalyzingJobs();
    loadCompletedJobs();
  }, 2000);

  // Clear stuck/analyzing jobs
  clearAnalyzingBtn.addEventListener('click', () => {
    chrome.storage.local.set({ analyzingJobs: [] }, loadAnalyzingJobs);
  });

  // Clear completed jobs
  clearCompletedBtn.addEventListener('click', () => {
    chrome.storage.local.set({ completedJobs: [] }, loadCompletedJobs);
  });

  // Open dashboard
  openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: DASHBOARD_URL });
  });

  // Handle view results button clicks
  completedList.addEventListener('click', (e) => {
    if (e.target.classList.contains('view-results-btn')) {
      const jobId = e.target.dataset.jobId;
      if (jobId) {
        chrome.tabs.create({ url: `${DASHBOARD_URL}?jobId=${jobId}` });
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