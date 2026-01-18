// Background service worker for EXE Analyzer Extension

// Backend API endpoint
const API_BASE_URL = 'http://localhost:8000';

// Frontend dashboard URL
const DASHBOARD_URL = 'http://localhost:3000';

// File extensions to analyze
const ANALYZABLE_EXTENSIONS = ['.exe', '.dll', '.elf', '.bin', '.so'];

// Track downloads we're processing to avoid duplicates
const processingDownloads = new Set();

// Check if file should be analyzed based on extension
function shouldAnalyze(filename) {
  const lowerName = filename.toLowerCase();
  return ANALYZABLE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

// Read local file from disk using file:// URL
async function readLocalFile(filePath) {
  console.log('[Alias] Reading local file:', filePath);
  
  // Convert Windows path to file:// URL
  // C:\Users\... -> file:///C:/Users/...
  let fileUrl = filePath.replace(/\\/g, '/');
  if (!fileUrl.startsWith('file://')) {
    fileUrl = 'file:///' + fileUrl;
  }
  
  try {
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    console.log('[Alias] Successfully read local file, size:', blob.size);
    return blob;
  } catch (err) {
    console.error('[Alias] Failed to read local file:', err);
    throw err;
  }
}

// Upload file blob to the backend for analysis
async function uploadBlobForAnalysis(blob, filename, geminiMode = false) {
  console.log('[Alias] Uploading file for analysis:', filename, 'Gemini mode:', geminiMode);
  
  try {
    // Create FormData and upload to backend
    const formData = new FormData();
    formData.append('file', blob, filename);
    
    // Build URL with gemini_mode parameter
    const url = new URL(`${API_BASE_URL}/api/upload`);
    if (geminiMode) {
      url.searchParams.append('gemini_mode', 'true');
    }

    const uploadResponse = await fetch(url.toString(), {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json();
      throw new Error(error.detail || 'Upload failed');
    }

    const result = await uploadResponse.json();
    console.log('[Alias] Upload successful, job ID:', result.job_id);
    return result;
  } catch (err) {
    console.error('[Alias] Upload failed:', err);
    throw err;
  }
}

// Download file from URL and return as blob
async function downloadFileAsBlob(url) {
  console.log('[Alias] Downloading file from URL:', url);
  
  try {
    const response = await fetch(url, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.blob();
  } catch (err) {
    console.error('[Alias] Failed to download file:', err);
    throw err;
  }
}

// Poll job status from backend
async function getJobStatus(jobId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/job/${jobId}`);
    if (response.status === 404) {
      // Job not found on server - likely server was restarted or job expired
      console.log(`[Alias] Job ${jobId} not found on server (404), removing from active polling`);
      return { status: 'not_found', jobId };
    }
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error('[Alias] Failed to get job status:', err);
    return null;
  }
}

// Analyze completed job for malware
async function analyzeMalware(jobId) {
  console.log('[Alias] Starting malware analysis for job:', jobId);
  try {
    const response = await fetch(`${API_BASE_URL}/api/job/${jobId}/malware-analysis`);
    if (!response.ok) {
      console.error('Malware analysis request failed:', response.status);
      return null;
    }
    const result = await response.json();
    console.log('[Alias] Malware analysis result:', result.analysis);
    return result.analysis;
  } catch (err) {
    console.error('Malware analysis error:', err);
    return null;
  }
}

// Delete a downloaded file by its download ID
async function deleteDownloadedFile(downloadId, filePath, reason) {
  console.log(`[Alias] Deleting file: ${filePath} (reason: ${reason})`);
  try {
    // Remove from disk
    await chrome.downloads.removeFile(downloadId);
    console.log('[Alias] File deleted from disk');
    
    // Also remove from downloads list
    await chrome.downloads.erase({ id: downloadId });
    console.log('[Alias] File removed from downloads list');
    
    return true;
  } catch (err) {
    console.error('Failed to delete file:', err);
    // Try alternative method - just erase the download record
    try {
      await chrome.downloads.erase({ id: downloadId });
    } catch (e) {
      console.error('Failed to erase download record:', e);
    }
    return false;
  }
}

// Runs when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Alias Extension installed');
  
  // Initialize storage with default values and clean up stale jobs
  chrome.storage.local.get(['analyzingJobs', 'completedJobs', 'activePollingJobs'], (result) => {
    // Clean up any stale jobs that got stuck (jobs with id: null)
    let analyzingJobs = result.analyzingJobs || [];
    
    // Remove jobs that have id: null (stuck in uploading state)
    const cleanedJobs = analyzingJobs.filter(job => {
      if (job.id === null) {
        console.log('Removing stale job:', job.filename);
        return false;
      }
      return true;
    });
    
    // Get valid job IDs that should still be polled
    const validJobIds = cleanedJobs
      .filter(j => j.status !== 'completed' && j.status !== 'failed')
      .map(j => j.id);
    
    chrome.storage.local.set({ 
      analyzingJobs: cleanedJobs,
      completedJobs: result.completedJobs || [],
      activePollingJobs: validJobIds
    }, () => {
      console.log('Storage initialized, cleaned', analyzingJobs.length - cleanedJobs.length, 'stale jobs');
      console.log('Active polling jobs:', validJobIds.length);
      
      // Resume polling if there are active jobs
      if (validJobIds.length > 0) {
        ensurePollingAlarm();
        pollAllActiveJobs();
      }
    });
  });
});

// Monitor downloads - intercept when they start to capture the URL
chrome.downloads.onCreated.addListener((downloadItem) => {
  const filename = downloadItem.filename || downloadItem.url.split('/').pop().split('?')[0];
  
  if (shouldAnalyze(filename)) {
    console.log('[Alias] Executable download detected:', filename);
    // Store the download URL for later use
    processingDownloads.add(downloadItem.id);
  }
});

// Monitor downloads - process when complete
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    // Get download details
    chrome.downloads.search({ id: delta.id }, async (downloads) => {
      if (downloads.length === 0) return;
      const download = downloads[0];
      const fileSizeMB = (download.fileSize / (1024 * 1024)).toFixed(2);
      const filename = download.filename.split(/[/\\]/).pop();

      // Check if this is an executable file
      if (!shouldAnalyze(filename)) {
        console.log('[Alias] Skipping non-executable file:', filename);
        return;
      }

      // Check if already processing
      if (!download.url || download.url.startsWith('blob:')) {
        console.log('[Alias] Skipping blob/invalid URL:', filename);
        return;
      }

      console.log('[Alias] Detected executable download:', filename);
      console.log('[Alias] Download URL:', download.url);

      // Get user preference for Gemini mode
      const settings = await chrome.storage.local.get(['geminiMode']);
      const geminiMode = settings.geminiMode || false;

      // Create a temporary ID to track this job before we get the real ID
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry
      const jobEntry = {
        id: null,  // Will be set after upload
        tempId: tempId,  // Temporary ID for tracking
        filename: filename,
        fullPath: download.filename,
        size: fileSizeMB,
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
        url: download.url,
        status: 'uploading',
        stage: 'Uploading to server...',
        progress: 0,
        error: null,
        geminiMode: geminiMode
      };

      console.log('[Alias] Created job entry with tempId:', tempId);

      // Store job immediately so it shows in the popup
      await new Promise((resolve) => {
        chrome.storage.local.get(['analyzingJobs'], (result) => {
          const jobs = result.analyzingJobs || [];
          jobs.unshift(jobEntry);
          chrome.storage.local.set({ analyzingJobs: jobs }, () => {
            console.log('[Alias] Initial job stored in analyzingJobs, total:', jobs.length);
            resolve();
          });
        });
      });

      // Show notification that upload is starting
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Uploading to Alias',
        message: `Uploading ${filename} for analysis...`,
        priority: 1
      });

      try {
        // Try to read the local file first (requires "Allow access to file URLs" permission)
        let blob;
        try {
          console.log('[Alias] Attempting to read local file...');
          blob = await readLocalFile(download.filename);
          console.log('[Alias] Read local file successfully');
        } catch (localErr) {
          console.warn('[Alias] Could not read local file, falling back to URL download');
          console.warn('   To enable local file access:');
          console.warn('   1. Go to chrome://extensions');
          console.warn('   2. Click "Details" on EXE Analyzer');
          console.warn('   3. Enable "Allow access to file URLs"');
          
          // Fallback: re-download from URL
          if (download.url && !download.url.startsWith('blob:') && !download.url.startsWith('file:')) {
            console.log('[Alias] Re-downloading file from URL...');
            blob = await downloadFileAsBlob(download.url);
          } else {
            throw new Error('Cannot access file. Please enable "Allow access to file URLs" in extension settings.');
          }
        }
        
        console.log('[Alias] Got blob, size:', blob.size);
        
        // Upload blob to backend
        const uploadResult = await uploadBlobForAnalysis(blob, filename, geminiMode);
        console.log('[Alias] Upload complete, job ID:', uploadResult.job_id);
        
        // Update job entry with job ID
        jobEntry.id = uploadResult.job_id;
        jobEntry.status = 'pending';
        jobEntry.stage = 'Queued for analysis';

        // Update the existing job in storage (find by tempId)
        await new Promise((resolve) => {
          chrome.storage.local.get(['analyzingJobs'], (result) => {
            const jobs = result.analyzingJobs || [];
            console.log('[Alias] Current jobs in storage before update:', jobs.length);
            jobs.forEach((j, i) => console.log(`  [${i}] id=${j.id}, tempId=${j.tempId}, stage="${j.stage}"`));
            
            // Find and update the job we added earlier using tempId
            const idx = jobs.findIndex(j => j.tempId === tempId);
            console.log(`[Alias] Looking for job with tempId ${tempId}, found at index: ${idx}`);
            if (idx !== -1) {
              jobs[idx] = jobEntry;
              console.log(`[Alias] Updated job at index ${idx} with real ID: ${uploadResult.job_id}, stage: ${jobEntry.stage}`);
            } else {
              // Fallback: add as new
              console.log('[Alias] Job not found by tempId, adding as new');
              jobs.unshift(jobEntry);
            }
            chrome.storage.local.set({ analyzingJobs: jobs }, () => {
              // Verify the save worked
              chrome.storage.local.get(['analyzingJobs'], (verifyResult) => {
                const verified = verifyResult.analyzingJobs || [];
                console.log('[Alias] VERIFIED jobs after save:', verified.length);
                verified.forEach((j, i) => console.log(`  [${i}] id=${j.id}, stage="${j.stage}", progress=${j.progress}`));
                resolve();
              });
            });
          });
        });

        // NOW open the frontend with the job ID (after upload is complete)
        const dashboardUrl = `${DASHBOARD_URL}?jobId=${uploadResult.job_id}&filename=${encodeURIComponent(filename)}`;
        console.log('[Alias] Opening dashboard with job ID:', dashboardUrl);
        
        try {
          await chrome.tabs.create({ url: dashboardUrl });
          console.log('[Alias] Dashboard tab opened with job ID');
        } catch (tabErr) {
          console.error('[Alias] Failed to open dashboard tab:', tabErr);
        }

        // Show notification
        const modeText = geminiMode ? '(Gemini Mode)' : '';
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Alias - Analyzing',
          message: `${filename} has been sent for analysis. ${modeText}`,
          priority: 1
        });

        // Start polling for job status
        pollJobStatus(uploadResult.job_id);

      } catch (err) {
        console.error('[Alias] Failed to process file:', err);
        jobEntry.status = 'failed';
        jobEntry.error = err.message;
        jobEntry.stage = 'Processing failed';

        // Store failed job using Promise wrapper
        await new Promise((resolve) => {
          chrome.storage.local.get(['analyzingJobs'], (result) => {
            const jobs = result.analyzingJobs || [];
            jobs.unshift(jobEntry);
            chrome.storage.local.set({ analyzingJobs: jobs }, () => {
              console.log('[Alias] Failed job stored in analyzingJobs');
              resolve();
            });
          });
        });

        // Show error notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Alias - Upload Failed',
          message: `Failed to upload ${filename}: ${err.message}`,
          priority: 2
        });
      }
    });
  }
});

// Constants for alarm-based polling
const POLL_ALARM_NAME = 'alias-job-poll';
const POLL_INTERVAL_MINUTES = 0.05; // 3 seconds (minimum Chrome allows is ~1 minute, but we'll use a workaround)

// Start polling for a job - registers it for the polling system
async function startPollingJob(jobId) {
  console.log(`[Alias] Starting polling for job: ${jobId}`);
  
  // Add to active polling jobs
  const result = await chrome.storage.local.get(['activePollingJobs']);
  const activeJobs = result.activePollingJobs || [];
  
  if (!activeJobs.includes(jobId)) {
    activeJobs.push(jobId);
    await chrome.storage.local.set({ activePollingJobs: activeJobs });
    console.log(`[Alias] Added job to active polling: ${jobId}, total active: ${activeJobs.length}`);
  }
  
  // Trigger immediate poll
  await pollAllActiveJobs();
  
  // Ensure the polling alarm is running
  ensurePollingAlarm();
}

// Ensure the polling alarm is active
async function ensurePollingAlarm() {
  const alarm = await chrome.alarms.get(POLL_ALARM_NAME);
  if (!alarm) {
    // Create alarm - minimum period is 1 minute, but we'll also use setTimeout as backup
    chrome.alarms.create(POLL_ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: 0.1 // ~6 seconds
    });
    console.log('[Alias] Created polling alarm');
  }
}

// Poll all active jobs
async function pollAllActiveJobs() {
  const result = await chrome.storage.local.get(['activePollingJobs']);
  const activeJobs = result.activePollingJobs || [];
  
  if (activeJobs.length === 0) {
    // No jobs to poll, clear the alarm
    chrome.alarms.clear(POLL_ALARM_NAME);
    console.log('[Alias] No active jobs, cleared polling alarm');
    return;
  }
  
  console.log(`[Alias] Polling ${activeJobs.length} active jobs...`);
  
  for (const jobId of activeJobs) {
    await pollSingleJob(jobId);
  }
}

// Poll a single job and update its status
async function pollSingleJob(jobId) {
  console.log(`[Alias] Polling job: ${jobId}`);
  
  const status = await getJobStatus(jobId);
  
  if (!status) {
    console.log(`[Alias] No status for job ${jobId}, will retry`);
    return;
  }
  
  // Handle 404 - job no longer exists on server
  if (status.status === 'not_found') {
    console.log(`[Alias] Removing stale job ${jobId} from tracking`);
    const storageResult = await chrome.storage.local.get(['analyzingJobs', 'activePollingJobs']);
    let analyzingJobs = storageResult.analyzingJobs || [];
    let activePollingJobs = storageResult.activePollingJobs || [];
    
    // Remove from both lists
    analyzingJobs = analyzingJobs.filter(j => j.id !== jobId);
    activePollingJobs = activePollingJobs.filter(id => id !== jobId);
    
    await chrome.storage.local.set({ analyzingJobs, activePollingJobs });
    return;
  }
  
  console.log(`[Alias] Job ${jobId}: ${status.status} - ${status.stage} (${status.progress}%)`);
  
  // Update job in storage
  const storageResult = await chrome.storage.local.get(['analyzingJobs', 'completedJobs', 'activePollingJobs']);
  let analyzingJobs = storageResult.analyzingJobs || [];
  let completedJobs = storageResult.completedJobs || [];
  let activePollingJobs = storageResult.activePollingJobs || [];
  
  const jobIndex = analyzingJobs.findIndex(j => j.id === jobId);
  
  if (jobIndex === -1) {
    console.log(`[Alias] Job ${jobId} not found in analyzingJobs, removing from active polling`);
    activePollingJobs = activePollingJobs.filter(id => id !== jobId);
    await chrome.storage.local.set({ activePollingJobs });
    return;
  }
  
  const job = { ...analyzingJobs[jobIndex] };
  job.status = status.status;
  job.stage = status.stage;
  job.progress = status.progress;
  
  if (status.status === 'completed' || status.status === 'failed') {
    console.log(`[Alias] Job ${jobId} finished: ${status.status}`);
    
    // Move to completed jobs
    if (status.status === 'failed') {
      job.error = status.error;
    }
    
    analyzingJobs = analyzingJobs.filter(j => j.id !== jobId);
    completedJobs.unshift(job);
    
    // Remove from active polling
    activePollingJobs = activePollingJobs.filter(id => id !== jobId);
    
    await chrome.storage.local.set({ analyzingJobs, completedJobs, activePollingJobs });
    console.log(`[Alias] Moved job to completedJobs, removed from active polling`);
    
    // Handle completion (malware check, notifications)
    await handleJobCompletion(job, status);
  } else {
    // Update in place
    analyzingJobs[jobIndex] = job;
    await chrome.storage.local.set({ analyzingJobs });
    console.log(`[Alias] Updated job ${jobId}: ${status.stage} (${status.progress}%)`);
  }
}

// Handle job completion - malware detection and notifications
async function handleJobCompletion(job, status) {
  if (status.status === 'completed') {
    // Run malware detection
    const malwareResult = await analyzeMalware(job.id);
    
    if (malwareResult && malwareResult.is_malware) {
      console.log('[Alias] MALWARE DETECTED:', malwareResult.threats);
      
      // Show malware warning notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Alias - MALWARE DETECTED',
        message: `${job.filename} contains malware! Threats: ${malwareResult.threats.join(', ')}. File will be deleted.`,
        priority: 2
      });
      
      // Find and delete the file
      chrome.downloads.search({ filename: job.fullPath }, async (downloads) => {
        if (downloads && downloads.length > 0) {
          const downloadId = downloads[0].id;
          const deleted = await deleteDownloadedFile(downloadId, job.fullPath, 'malware detected');
          
          // Update job with malware info
          const result = await chrome.storage.local.get(['completedJobs']);
          const jobs = result.completedJobs || [];
          const idx = jobs.findIndex(j => j.id === job.id);
          if (idx !== -1) {
            jobs[idx].malwareDetected = true;
            jobs[idx].malwareThreats = malwareResult.threats;
            jobs[idx].malwareExplanation = malwareResult.explanation;
            jobs[idx].fileDeleted = deleted;
            await chrome.storage.local.set({ completedJobs: jobs });
          }
        }
      });
    } else {
      // Show safe completion notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Alias - Analysis Complete',
        message: `${job.filename} - ${status.stage}. No malware detected.`,
        priority: 1
      });
    }
  } else {
    // Show failure notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Alias - Analysis Failed',
      message: `${job.filename} - ${status.stage}`,
      priority: 1
    });
  }
}

// Listen for alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM_NAME) {
    console.log('[Alias] Alarm triggered, polling jobs...');
    pollAllActiveJobs();
  }
});

// On service worker startup, check for active polling jobs
chrome.runtime.onStartup.addListener(() => {
  console.log('[Alias] Service worker started, checking for active jobs...');
  ensurePollingAlarmIfNeeded();
});


// Helper to check and start alarm if there are active jobs
async function ensurePollingAlarmIfNeeded() {
  const result = await chrome.storage.local.get(['activePollingJobs']);
  const activeJobs = result.activePollingJobs || [];
  
  if (activeJobs.length > 0) {
    console.log(`[Alias] Found ${activeJobs.length} active jobs, resuming polling`);
    ensurePollingAlarm();
    // Immediately poll once
    pollAllActiveJobs();
  }
}

// Legacy function name for compatibility
function pollJobStatus(jobId) {
  startPollingJob(jobId);
}

// Self-executing: Check for active jobs when service worker wakes up
(async () => {
  console.log('[Alias] Service worker active, checking for polling jobs...');
  await ensurePollingAlarmIfNeeded();
})();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Trigger immediate poll when popup opens
  if (request.action === 'refreshJobs') {
    console.log('[Alias] Popup requested refresh, polling now...');
    pollAllActiveJobs().then(() => {
      chrome.storage.local.get(['analyzingJobs', 'completedJobs'], (result) => {
        sendResponse({ 
          analyzingJobs: result.analyzingJobs || [],
          completedJobs: result.completedJobs || []
        });
      });
    });
    return true; // async response
  }
  
  if (request.action === 'getAnalyzingJobs') {
    chrome.storage.local.get(['analyzingJobs'], (result) => {
      sendResponse({ jobs: result.analyzingJobs || [] });
    });
    return true;
  }
  
  if (request.action === 'getCompletedJobs') {
    chrome.storage.local.get(['completedJobs'], (result) => {
      sendResponse({ jobs: result.completedJobs || [] });
    });
    return true;
  }
  
  if (request.action === 'clearCompletedJobs') {
    chrome.storage.local.set({ completedJobs: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'openDashboard') {
    // Open the main frontend dashboard with the job results
    chrome.tabs.create({ 
      url: `http://localhost:3000?jobId=${request.jobId}` 
    });
    sendResponse({ success: true });
    return true;
  }
});
