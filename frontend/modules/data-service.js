// modules/data-service.js - Handles data fetching and validation
export class DataService {
  constructor() {
    this.apiUrl = "https://reddit-extension-backend-541360204677.us-central1.run.app/receive_url";
  }

  async getRedditUrl() {
    return new Promise((resolve) => {
      chrome.storage.local.get("reddit_url", (result) => {
        const url = result.reddit_url;
        const isValidThread = this.isValidRedditThread(url);
        resolve({ url, isValidThread });
      });
    });
  }

  isValidRedditThread(url) {
    if (!url) return false;
    
    try {
      const parsed = new URL(url);
      return /\/comments\/[a-z0-9]+/i.test(parsed.pathname);
    } catch (e) {
      console.warn("Invalid URL in storage:", url);
      return false;
    }
  }

  async fetchSentimentData(url) {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const result = await response.json();
    
    if (result.status !== "success") {
      throw new Error(result.message);
    }
    
    return result.data;
  }
}