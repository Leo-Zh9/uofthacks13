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
  console.log('📂 Reading local file:', filePath);
  
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
    console.log('✅ Successfully read local file, size:', blob.size);
    return blob;
  } catch (err) {
    console.error('❌ Failed to read local file:', err);
    throw err;
  }
}

// Upload file blob to the backend for analysis
async function uploadBlobForAnalysis(blob, filename, geminiMode = false) {
  console.log('📤 Uploading file for analysis:', filename, 'Gemini mode:', geminiMode);
  
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
    console.log('✅ Upload successful, job ID:', result.job_id);
    return result;
  } catch (err) {
    console.error('❌ Upload failed:', err);
    throw err;
  }
}

// Download file from URL and return as blob
async function downloadFileAsBlob(url) {
  console.log('📥 Downloading file from URL:', url);
  
  try {
    const response = await fetch(url, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.blob();
  } catch (err) {
    console.error('❌ Failed to download file:', err);
    throw err;
  }
}

// Poll job status from backend
async function getJobStatus(jobId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/job/${jobId}`);
    if (!response.ok) {
      throw new Error('Failed to get job status');
    }
    return await response.json();
  } catch (err) {
    console.error('Failed to get job status:', err);
    return null;
  }
}

// Runs when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('EXE Analyzer Extension installed');
  
  // Initialize storage with default values and clean up stale jobs
  chrome.storage.local.get(['analyzingJobs', 'completedJobs'], (result) => {
    // Clean up any stale jobs that got stuck (jobs with id: null that are older than 5 minutes)
    let analyzingJobs = result.analyzingJobs || [];
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    
    // Remove jobs that have id: null (stuck in uploading state)
    const cleanedJobs = analyzingJobs.filter(job => {
      if (job.id === null) {
        console.log('🧹 Removing stale job:', job.filename);
        return false;
      }
      return true;
    });
    
    chrome.storage.local.set({ 
      analyzingJobs: cleanedJobs,
      completedJobs: result.completedJobs || []
    }, () => {
      console.log('✅ Storage initialized, cleaned', analyzingJobs.length - cleanedJobs.length, 'stale jobs');
    });
  });
});

// Monitor downloads - intercept when they start to capture the URL
chrome.downloads.onCreated.addListener((downloadItem) => {
  const filename = downloadItem.filename || downloadItem.url.split('/').pop().split('?')[0];
  
  if (shouldAnalyze(filename)) {
    console.log('🎯 Executable download detected:', filename);
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
        console.log('📁 Skipping non-executable file:', filename);
        return;
      }

      // Check if already processing
      if (!download.url || download.url.startsWith('blob:')) {
        console.log('📁 Skipping blob/invalid URL:', filename);
        return;
      }

      console.log('🔍 Detected executable download:', filename);
      console.log('📎 Download URL:', download.url);

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

      console.log('📝 Created job entry with tempId:', tempId);

      // Store job immediately so it shows in the popup
      await new Promise((resolve) => {
        chrome.storage.local.get(['analyzingJobs'], (result) => {
          const jobs = result.analyzingJobs || [];
          jobs.unshift(jobEntry);
          chrome.storage.local.set({ analyzingJobs: jobs }, () => {
            console.log('✅ Initial job stored in analyzingJobs, total:', jobs.length);
            resolve();
          });
        });
      });

      // Show notification that upload is starting
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '📤 Uploading Executable',
        message: `Uploading ${filename} for analysis...`,
        priority: 1
      });

      try {
        // Try to read the local file first (requires "Allow access to file URLs" permission)
        let blob;
        try {
          console.log('📂 Attempting to read local file...');
          blob = await readLocalFile(download.filename);
          console.log('✅ Read local file successfully');
        } catch (localErr) {
          console.warn('⚠️ Could not read local file, falling back to URL download');
          console.warn('   To enable local file access:');
          console.warn('   1. Go to chrome://extensions');
          console.warn('   2. Click "Details" on EXE Analyzer');
          console.warn('   3. Enable "Allow access to file URLs"');
          
          // Fallback: re-download from URL
          if (download.url && !download.url.startsWith('blob:') && !download.url.startsWith('file:')) {
            console.log('📥 Re-downloading file from URL...');
            blob = await downloadFileAsBlob(download.url);
          } else {
            throw new Error('Cannot access file. Please enable "Allow access to file URLs" in extension settings.');
          }
        }
        
        console.log('✅ Got blob, size:', blob.size);
        
        // Upload blob to backend
        const uploadResult = await uploadBlobForAnalysis(blob, filename, geminiMode);
        console.log('✅ Upload complete, job ID:', uploadResult.job_id);
        
        // Update job entry with job ID
        jobEntry.id = uploadResult.job_id;
        jobEntry.status = 'pending';
        jobEntry.stage = 'Queued for analysis';

        // Update the existing job in storage (find by tempId)
        await new Promise((resolve) => {
          chrome.storage.local.get(['analyzingJobs'], (result) => {
            const jobs = result.analyzingJobs || [];
            console.log('📋 Current jobs in storage before update:', jobs.length);
            jobs.forEach((j, i) => console.log(`  [${i}] id=${j.id}, tempId=${j.tempId}, stage="${j.stage}"`));
            
            // Find and update the job we added earlier using tempId
            const idx = jobs.findIndex(j => j.tempId === tempId);
            console.log(`📝 Looking for job with tempId ${tempId}, found at index: ${idx}`);
            if (idx !== -1) {
              jobs[idx] = jobEntry;
              console.log(`✅ Updated job at index ${idx} with real ID: ${uploadResult.job_id}, stage: ${jobEntry.stage}`);
            } else {
              // Fallback: add as new
              console.log('⚠️ Job not found by tempId, adding as new');
              jobs.unshift(jobEntry);
            }
            chrome.storage.local.set({ analyzingJobs: jobs }, () => {
              // Verify the save worked
              chrome.storage.local.get(['analyzingJobs'], (verifyResult) => {
                const verified = verifyResult.analyzingJobs || [];
                console.log('✅ VERIFIED jobs after save:', verified.length);
                verified.forEach((j, i) => console.log(`  [${i}] id=${j.id}, stage="${j.stage}", progress=${j.progress}`));
                resolve();
              });
            });
          });
        });

        // NOW open the frontend with the job ID (after upload is complete)
        const dashboardUrl = `${DASHBOARD_URL}?jobId=${uploadResult.job_id}&filename=${encodeURIComponent(filename)}`;
        console.log('🌐 Opening dashboard with job ID:', dashboardUrl);
        
        try {
          await chrome.tabs.create({ url: dashboardUrl });
          console.log('✅ Dashboard tab opened with job ID');
        } catch (tabErr) {
          console.error('❌ Failed to open dashboard tab:', tabErr);
        }

        // Show notification
        const modeText = geminiMode ? '(Gemini Mode)' : '';
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🔬 Analyzing Executable',
          message: `${filename} has been sent for analysis. ${modeText}`,
          priority: 1
        });

        // Start polling for job status
        pollJobStatus(uploadResult.job_id);

      } catch (err) {
        console.error('❌ Failed to process file:', err);
        jobEntry.status = 'failed';
        jobEntry.error = err.message;
        jobEntry.stage = 'Processing failed';

        // Store failed job using Promise wrapper
        await new Promise((resolve) => {
          chrome.storage.local.get(['analyzingJobs'], (result) => {
            const jobs = result.analyzingJobs || [];
            jobs.unshift(jobEntry);
            chrome.storage.local.set({ analyzingJobs: jobs }, () => {
              console.log('✅ Failed job stored in analyzingJobs');
              resolve();
            });
          });
        });

        // Show error notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '❌ Upload Failed',
          message: `Failed to upload ${filename}: ${err.message}`,
          priority: 2
        });
      }
    });
  }
});

// Poll job status and update storage
async function pollJobStatus(jobId) {
  const pollInterval = 2000; // 2 seconds for faster updates
  const maxPolls = 300; // Max ~10 minutes of polling
  let pollCount = 0;

  const poll = async () => {
    pollCount++;
    console.log(`📊 Polling job ${jobId}, attempt ${pollCount}`);
    
    if (pollCount > maxPolls) {
      console.log('⚠️ Max polling reached for job:', jobId);
      return;
    }

    const status = await getJobStatus(jobId);
    
    if (!status) {
      console.log('❌ No status returned, retrying...');
      setTimeout(poll, pollInterval);
      return;
    }

    console.log(`📊 Job ${jobId} status:`, status.status, status.stage, `${status.progress}%`);

    // Update job in storage using Promise for proper async handling
    await new Promise((resolve) => {
      chrome.storage.local.get(['analyzingJobs', 'completedJobs'], (result) => {
        let analyzingJobs = result.analyzingJobs || [];
        let completedJobs = result.completedJobs || [];
        
        console.log(`📊 Storage state - analyzingJobs: ${analyzingJobs.length}, looking for id: ${jobId}`);
        analyzingJobs.forEach((j, i) => console.log(`  [${i}] id=${j.id}, stage="${j.stage}"`));
        
        const jobIndex = analyzingJobs.findIndex(j => j.id === jobId);
        console.log(`📊 Job index in analyzingJobs: ${jobIndex}`);
        
        if (jobIndex === -1) {
          console.log('⚠️ Job not found in analyzingJobs! IDs in storage:', analyzingJobs.map(j => j.id));
          console.log('⚠️ Looking for jobId:', jobId);
          resolve();
          return;
        }

        const job = { ...analyzingJobs[jobIndex] };
        job.status = status.status;
        job.stage = status.stage;
        job.progress = status.progress;

        if (status.status === 'completed' || status.status === 'failed') {
          console.log(`✅ Job ${jobId} finished with status: ${status.status}`);
          // Move to completed jobs
          if (status.status === 'failed') {
            job.error = status.error;
          }
          analyzingJobs = analyzingJobs.filter(j => j.id !== jobId);
          completedJobs.unshift(job);

          chrome.storage.local.set({ analyzingJobs, completedJobs }, () => {
            console.log('✅ Moved job to completedJobs');
            resolve();
          });

          // Show completion notification
          const icon = status.status === 'completed' ? '✅' : '❌';
          const title = status.status === 'completed' ? 'Analysis Complete' : 'Analysis Failed';
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: `${icon} ${title}`,
            message: `${job.filename} - ${status.stage}`,
            priority: 1
          });
        } else {
          // Update in place
          analyzingJobs[jobIndex] = job;
          chrome.storage.local.set({ analyzingJobs }, () => {
            console.log(`✅ Updated job in analyzingJobs: ${status.stage} (${status.progress}%)`);
            resolve();
          });
        }
      });
    });
    
    // Continue polling if job is still processing
    const currentStatus = await getJobStatus(jobId);
    if (currentStatus && currentStatus.status !== 'completed' && currentStatus.status !== 'failed') {
      setTimeout(poll, pollInterval);
    }
  };

  // Start polling immediately
  poll();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
