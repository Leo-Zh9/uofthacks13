# Alias Chrome Extension

A Chrome extension that automatically intercepts downloaded executable files (.exe, .dll, .elf, .bin, .so) and sends them to the Alias backend for AI-powered decompilation and analysis.

## Features

- **Automatic Detection**: Monitors all downloads and detects executable files
- **Seamless Upload**: Automatically uploads executables to the backend server
- **Progress Tracking**: Real-time progress updates in the popup UI
- **Notifications**: Desktop notifications for upload status and analysis completion
- **Dashboard Integration**: One-click access to view detailed analysis results

## Structure

```
chrome-extension/
├── manifest.json      # Extension configuration
├── popup.html         # Popup UI
├── popup.js           # Popup logic
├── background.js      # Service worker (monitors downloads)
├── styles.css         # Popup styles
└── icons/             # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Installation

1. Make sure the backend server is running on `http://localhost:8000`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `chrome-extension` folder
6. **Important**: Click on the extension details (find "Alias") and enable **"Allow access to file URLs"**

## Usage

1. Download any `.exe`, `.dll`, `.elf`, `.bin`, or `.so` file
2. The extension will automatically detect the download and upload it for analysis
3. Click the extension icon to see the analysis progress
4. Once complete, click "View Results" to open the full analysis dashboard

## Backend Requirements

This extension requires the decompiler backend server running at `http://localhost:8000`. Start the server with:

```bash
cd server
pip install -r requirements.txt
python main.py
```

## Configuration

The backend server URL can be changed in `background.js`:

```javascript
const API_BASE_URL = 'http://localhost:8000';
```

## Permissions

- **storage**: Store job history and settings
- **downloads**: Monitor completed downloads
- **notifications**: Show desktop notifications
- **tabs**: Open dashboard in new tabs
- **file://**: Read local downloaded files
- **<all_urls>**: Upload to backend server
