console.log("Reddit Extension Loaded");

const isThreadPage = /\/comments\/[a-z0-9]+/i.test(window.location.pathname);

if (isThreadPage) {
  const postUrl = window.location.href;
  console.log("Thread URL:", postUrl);

  // Store URL so popup.js can access it
  chrome.storage.local.set({ reddit_url: postUrl }, () => {
    console.log("Stored reddit_url via chrome.storage.local");
  });

  const postIdMatch = postUrl.match(/comments\/([^\/]+)/);
  const postId = postIdMatch ? postIdMatch[1] : null;
  console.log("Post ID:", postId);

  // Send URL to backend
  fetch("https://reddit-extension-backend-541360204677.us-central1.run.app/receive_url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url: postUrl })
  })
  .then(response => response.json())
  .then(data => {
    console.log("Backend responded:", data);
    // Optional: you could trigger something here
  })
  .catch(error => {
    console.error("Error contacting backend:", error);
  });
} else {
  console.log("Not a thread page.");
}
