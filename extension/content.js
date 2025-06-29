async function scrapeFrameData() {
  const html = document.body.innerHTML;

  return {
    id: crypto.randomUUID(),
    url: window.location.href,
    title: document.title || window.location.href,
    text: document.body ? document.body.innerText : "No content",
    fullHtml: html, // Include the full HTML content
    timestamp: new Date().toISOString(),
    isMainFrame: window === window.top,
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "scrapeIframes") {
    const frameData = await scrapeFrameData();

    console.log("on message:", frameData);

    sendResponse({ success: true, data: frameData });
  }
});

let isUpdating = false;

// Auto-scrape when content script loads (for iframes)
if (window !== window.top) {
  // This is an iframe
  (async () => {
    const frameData = await scrapeFrameData();
    console.log({ frameData });

    // Send the iframe data to the background script
    chrome.runtime
      .sendMessage({
        action: "iframeData",
        data: frameData,
      })
      .catch((err) => {
        console.log({ err });
      });

    // Wait for the lock to be released
    while (isUpdating) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Acquire the lock
    isUpdating = true;

    // Append the new data to the existing iframeData array
    chrome.storage.local.get(["iframeData"], (result) => {
      const existingData = result.iframeData || [];
      existingData.push(frameData);
      chrome.storage.local.set({ iframeData: existingData }, () => {
        // Release the lock
        isUpdating = false;
      });
    });
  })();
}
