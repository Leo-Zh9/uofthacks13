const API_BASE_URL = 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
  const analyzingList = document.getElementById('analyzingList');
  const completedList = document.getElementById('completedList');
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const serverStatus = document.getElementById('serverStatus');

  // Check server status
  async function checkServerStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        serverStatus.textContent = '🟢 Connected';
        serverStatus.className = 'status-connected';
      } else {
        serverStatus.textContent = '🔴 Error';
        serverStatus.className = 'status-error';
      }
    } catch (err) {
      serverStatus.textContent = '🔴 Offline';
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
            <div class="download-name">⚙️ ${escapeHtml(job.filename)}</div>
            <div class="download-path">${escapeHtml(job.fullPath || '')}</div>
            <div class="download-info">${job.size} MB · ${job.time} · ${job.date}</div>
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
              <div class="download-path">${escapeHtml(job.fullPath || '')}</div>
              <div class="download-info">${job.size} MB · ${job.time} · ${job.date}</div>
              <div class="job-result ${statusClass}">
                ${job.error ? escapeHtml(job.error) : job.stage}
              </div>
              ${job.status === 'completed' ? `<button class="view-results-btn" data-job-id="${job.id}">View Results</button>` : ''}
            </div>
          `;
        }).join('');
      }
    });
  };

  // Check server and load all data on popup open
  checkServerStatus();
  loadAnalyzingJobs();
  loadCompletedJobs();

  // Refresh every 2 seconds
  setInterval(() => {
    loadAnalyzingJobs();
    loadCompletedJobs();
  }, 2000);

  // Clear completed jobs
  clearCompletedBtn.addEventListener('click', () => {
    chrome.storage.local.set({ completedJobs: [] }, loadCompletedJobs);
  });

  // Open dashboard
  openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:3000' });
  });

  // Handle view results button clicks
  completedList.addEventListener('click', (e) => {
    if (e.target.classList.contains('view-results-btn')) {
      const jobId = e.target.dataset.jobId;
      if (jobId) {
        chrome.tabs.create({ url: `http://localhost:3000?jobId=${jobId}` });
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