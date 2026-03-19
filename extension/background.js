/**
 * Background Service Worker
 * Handles background tasks and long-running operations
 */

console.log('[Notion-PDF] Background service worker initialized');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('[Notion-PDF] Extension installed');
        // Open welcome page
        chrome.tabs.create({ url: 'https://notion-pdf.cld338.me/how-to-use' });
    } else if (details.reason === 'update') {
        console.log('[Notion-PDF] Extension updated');
    }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Notion-PDF] Background received message:', request.action);

    // You can add background-specific message handling here if needed
    if (request.action === 'getConfig') {
        sendResponse({
            serverUrl: 'https://notion-pdf.cld338.me'
        });
    }
});
