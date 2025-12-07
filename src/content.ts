// Content script that runs on YouTube pages
// Listens for messages from the popup to get current video info and control playback

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'GET_VIDEO_INFO') {
    const video = document.querySelector('video') as HTMLVideoElement;
    const videoId = new URLSearchParams(window.location.search).get('v');
    const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent || 'Unknown Video';
    
    if (video && videoId) {
      sendResponse({
        videoId,
        currentTime: video.currentTime,
        title,
        url: window.location.href
      });
    } else {
      sendResponse({ error: 'No video found' });
    }
  }
  
  if (request.action === 'JUMP_TO_TIME') {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      video.currentTime = request.timestamp;
      video.play();
    }
    sendResponse({ success: true });
  }
  
  if (request.action === 'CAPTURE_SCREENSHOT') {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      try {
        // Create a canvas to capture the video frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to base64 (without the data:image/png;base64, prefix)
          const dataUrl = canvas.toDataURL('image/png');
          const base64 = dataUrl.split(',')[1];
          
          sendResponse({ screenshot: base64 });
        } else {
          sendResponse({ error: 'Failed to get canvas context' });
        }
      } catch (error) {
        sendResponse({ error: 'Failed to capture screenshot' });
      }
    } else {
      sendResponse({ error: 'No video found' });
    }
  }
  
  return true; // Keep message channel open for async response
});

// Function to create the bookmark button
function createBookmarkButton() {
  const button = document.createElement('button');
  button.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m';
  button.style.marginRight = '8px';
  button.setAttribute('aria-label', 'Open bookmarks');
  
  // Create button content with icon and text
  button.innerHTML = `
    <div class="yt-spec-button-shape-next__button-text-content">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 6h4"/>
        <path d="M2 10h4"/>
        <path d="M2 14h4"/>
        <path d="M2 18h4"/>
        <rect width="16" height="20" x="4" y="2" rx="2"/>
        <path d="M16 2v20"/>
      </svg>
      <span>Bookmarks</span>
    </div>
  `;
  
  // Open extension popup when clicked
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_POPUP' });
  });
  
  return button;
}

// Function to inject the button into YouTube's control panel
function injectBookmarkButton() {
  // Wait for the YouTube UI to load
  const checkForControls = setInterval(() => {
    // Find the segmented like/dislike button container
    const likeButtonContainer = document.querySelector('#top-level-buttons-computed');
    
    if (likeButtonContainer) {
      // Check if button already exists
      if (document.querySelector('#yt-bookmarker-btn')) {
        return;
      }
      
      // Create wrapper to match YouTube's button style
      const wrapper = document.createElement('div');
      wrapper.id = 'yt-bookmarker-btn';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      
      const bookmarkBtn = createBookmarkButton();
      wrapper.appendChild(bookmarkBtn);
      
      // Insert before the like button container
      likeButtonContainer.insertBefore(wrapper, likeButtonContainer.firstChild);
      
      clearInterval(checkForControls);
    }
  }, 500);
  
  // Clear interval after 10 seconds to avoid infinite checking
  setTimeout(() => clearInterval(checkForControls), 10000);
}

// Inject button when page loads
injectBookmarkButton();

// Re-inject button when navigating to a new video (YouTube is a SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    if (currentUrl.includes('watch?v=')) {
      // Remove old button if it exists
      const oldButton = document.querySelector('#yt-bookmarker-btn');
      if (oldButton) {
        oldButton.remove();
      }
      // Inject new button
      setTimeout(injectBookmarkButton, 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });