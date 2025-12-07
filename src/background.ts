// Background service worker
// Handles opening the popup when the injected button is clicked

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'OPEN_POPUP') {
    // Open the popup by triggering the extension action
    chrome.action.openPopup();
    sendResponse({ success: true });
  }
  return true;
});