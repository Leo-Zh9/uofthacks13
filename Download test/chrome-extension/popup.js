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
        fileAccessStatus.textContent = '🟢 Enabled';
        fileAccessStatus.className = 'status-connected';
        fileAccessHelp.style.display = 'none';
      } else {
        throw new Error('No file access');
      }
    } catch (err) {
      fileAccessStatus.textContent = '🟡 Not enabled';
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
        serverStatus.textContent = '🟢 Connected';
        serverStatus.className = 'status-connected';
      } else {
        serverStatus.textContent = '🔴 Error (' + response.status + ')';
        serverStatus.className = 'status-error';
      }
    } catch (err) {
      console.error('Server check failed:', err);
      serverStatus.textContent = '🔴 Offline';
      serverStatus.className = 'status-offline';
    }
  }

  // Load analyzing jobs
  const loadAnalyzingJobs = () => {
    chrome.storage.local.get(['analyzingJobs'], (result) => {
      const jobs = result.analyzingJobs || [];
      console.log('📋 Popup: Loading analyzing jobs, count:', jobs.length);
      jobs.forEach((job, i) => {
        console.log(`  [${i}] id=${job.id}, tempId=${job.tempId}, stage="${job.stage}", progress=${job.progress}%`);
      });
      
      if (jobs.length === 0) {
        analyzingList.innerHTML = '<p class="no-downloads">No files being analyzed</p>';
      } else {
        analyzingList.innerHTML = jobs.map((job) => `
          <div class="download-item analyzing">
            <div class="download-name">⚙️ ${escapeHtml(job.filename)}</div>
            <div class="download-meta">${job.geminiMode ? '🤖 Gemini' : '🔧 LLM4Decompile'}</div>
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
          const icon = job.status === 'completed' ? '✅' : '❌';
          const statusClass = job.status === 'completed' ? 'success' : 'failed';
          
          return `
            <div class="download-item ${statusClass}" data-job-id="${job.id}">
              <div class="download-name">${icon} ${escapeHtml(job.filename)}</div>
              <div class="download-meta">${job.geminiMode ? '🤖 Gemini' : '🔧 LLM4Decompile'} · ${job.time}</div>
              <div class="job-result ${statusClass}">
                ${job.error ? escapeHtml(job.error) : job.stage}
              </div>
              ${job.status === 'completed' ? `<button class="view-results-btn" data-job-id="${job.id}">View in Dashboard</button>` : ''}
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
  loadAnalyzingJobs();
  loadCompletedJobs();

  // Refresh every 1 second for faster updates
  setInterval(() => {
    loadAnalyzingJobs();
    loadCompletedJobs();
  }, 1000);

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