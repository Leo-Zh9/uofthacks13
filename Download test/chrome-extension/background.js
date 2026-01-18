// Background service worker for EXE Analyzer Extension

// Backend API endpoint
const API_BASE_URL = 'http://localhost:8000';

// File extensions to analyze
const ANALYZABLE_EXTENSIONS = ['.exe', '.dll', '.elf', '.bin', '.so'];

// Check if file should be analyzed based on extension
function shouldAnalyze(filename) {
  const lowerName = filename.toLowerCase();
  return ANALYZABLE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

// Upload file to the backend for analysis
async function uploadFileForAnalysis(filePath, filename) {
  console.log('📤 Uploading file for analysis:', filename);
  
  try {
    // Fetch the local file
    const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error('Failed to read local file');
    }
    
    const fileBlob = await response.blob();
    
    // Create FormData and upload to backend
    const formData = new FormData();
    formData.append('file', fileBlob, filename);
    
    const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, {
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
  
  // Initialize storage with default values only if not already set
  chrome.storage.local.get(['analyzingJobs', 'completedJobs'], (result) => {
    if (!result.analyzingJobs) {
      chrome.storage.local.set({ analyzingJobs: [] });
    }
    if (!result.completedJobs) {
      chrome.storage.local.set({ completedJobs: [] });
    }
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

      // Check if this is an executable file
      if (!shouldAnalyze(filename)) {
        console.log('📁 Skipping non-executable file:', filename);
        return;
      }

      console.log('🔍 Detected executable download:', filename);

      // Create job entry
      const jobEntry = {
        id: null,  // Will be set after upload
        filename: filename,
        fullPath: download.filename,
        size: fileSizeMB,
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
        url: download.url,
        status: 'uploading',
        stage: 'Uploading to server...',
        progress: 0,
        error: null
      };

      try {
        // Upload file to backend
        const uploadResult = await uploadFileForAnalysis(download.filename, filename);
        jobEntry.id = uploadResult.job_id;
        jobEntry.status = 'pending';
        jobEntry.stage = 'Queued for analysis';

        // Store the job
        chrome.storage.local.get(['analyzingJobs'], (result) => {
          const jobs = result.analyzingJobs || [];
          jobs.unshift(jobEntry);
          chrome.storage.local.set({ analyzingJobs: jobs });
        });

        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🔬 Analyzing Executable',
          message: `${filename} has been sent for LLM analysis.`,
          priority: 1
        });

        // Start polling for job status
        pollJobStatus(uploadResult.job_id);

      } catch (err) {
        console.error('Failed to upload file:', err);
        jobEntry.status = 'failed';
        jobEntry.error = err.message;
        jobEntry.stage = 'Upload failed';

        // Store failed job
        chrome.storage.local.get(['analyzingJobs'], (result) => {
          const jobs = result.analyzingJobs || [];
          jobs.unshift(jobEntry);
          chrome.storage.local.set({ analyzingJobs: jobs });
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
  const pollInterval = 3000; // 3 seconds
  const maxPolls = 200; // Max ~10 minutes of polling
  let pollCount = 0;

  const poll = async () => {
    pollCount++;
    console.log(`Polling job ${jobId}, attempt ${pollCount}`);
    
    if (pollCount > maxPolls) {
      console.log('Max polling reached for job:', jobId);
      return;
    }

    const status = await getJobStatus(jobId);
    console.log('Job status:', status);
    
    if (!status) {
      console.log('No status returned, retrying...');
      setTimeout(poll, pollInterval);
      return;
    }

    // Update job in storage
    chrome.storage.local.get(['analyzingJobs', 'completedJobs'], (result) => {
      let analyzingJobs = result.analyzingJobs || [];
      let completedJobs = result.completedJobs || [];
      
      const jobIndex = analyzingJobs.findIndex(j => j.id === jobId);
      console.log(`Job index in analyzingJobs: ${jobIndex}, total jobs: ${analyzingJobs.length}`);
      
      if (jobIndex === -1) {
        console.log('Job not found in analyzingJobs, stopping poll');
        return;
      }

      const job = { ...analyzingJobs[jobIndex] };
      job.status = status.status;
      job.stage = status.stage;
      job.progress = status.progress;

      if (status.status === 'completed' || status.status === 'failed') {
        console.log(`Job ${jobId} finished with status: ${status.status}`);
        // Move to completed jobs
        if (status.status === 'failed') {
          job.error = status.error;
        }
        analyzingJobs = analyzingJobs.filter(j => j.id !== jobId);
        completedJobs.unshift(job);

        chrome.storage.local.set({ analyzingJobs, completedJobs }, () => {
          console.log('Moved job to completedJobs');
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
          console.log('Updated job in analyzingJobs');
        });
        
        // Continue polling
        setTimeout(poll, pollInterval);
      }
    });
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
