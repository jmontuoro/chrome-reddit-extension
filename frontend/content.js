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

    // const postId = url.match(/comments\/([^\/]+)/)?.[1] || null;
    // console.log("Post ID:", postId);

    // ping backend immediately for logging or caching
    fetch("https://reddit-extension-backend-541360204677.us-central1.run.app/receive_url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    })
      .then(res => res.json())
      .then(data => {
        console.log("Backend responded:", data);
      })
      .catch(err => {
        console.error("Backend error:", err);
      });
  } else {
    console.log("ℹNot a thread page:", url);
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
