# Chrome Extension Boilerplate

A simple Chrome extension using Manifest V3.

## Structure

```
chrome-extension/
├── manifest.json      # Extension configuration
├── popup.html         # Popup UI
├── popup.js           # Popup logic
├── background.js      # Service worker (background script)
├── styles.css         # Popup styles
└── icons/             # Extension icons (add your own)
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder

## Adding Icons

Create PNG icons in the following sizes and place them in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

## Features

- **Popup**: Click the extension icon to open a popup
- **Storage**: Uses Chrome's storage API to persist data
- **Background Service Worker**: Runs in the background for event handling

## Development

After making changes to your extension:
1. Go to `chrome://extensions/`
2. Click the refresh icon on your extension card

## Learn More

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Overview](https://developer.chrome.com/docs/extensions/mv3/intro/)
