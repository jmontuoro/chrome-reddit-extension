console.log("Reddit Extension Loaded");

let lastUrl = location.href;

/**
 * Detects whether the given URL is a Reddit thread page,
 * stores it in Chrome local storage, and sends it to the backend.
 * Clears stored URL if not a valid thread.
 *
 * @param {string} url - The current page URL
 */
function handleUrlUpdate(url) {
  const isThreadPage = /\/comments\/[a-z0-9]+/i.test(new URL(url).pathname);

  if (isThreadPage) {
    console.log("Thread detected:", url);

    chrome.storage.local.set({ reddit_url: url }, () => {
      console.log("Stored reddit_url");
    });
  } else {
    console.log("Not a thread page:", url);
    chrome.storage.local.remove("reddit_url", () => {
      console.log("Cleared reddit_url from storage");
    });
  }
}

// Run once on initial load
handleUrlUpdate(location.href);

// Poll for URL changes (Reddit uses SPA-style routing)
setInterval(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log("URL changed:", currentUrl);
    handleUrlUpdate(currentUrl);
  }
}, 1000);
