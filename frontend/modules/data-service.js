export class DataService {
  constructor() {
    this.backendUrl = 'https://reddit-extension-backend-541360204677.us-central1.run.app'; // Update with your actual backend URL
  }

  async getRedditUrl() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['reddit_url'], (result) => {
        const url = result.reddit_url;
        const isValidThread = url && /\/comments\/[a-z0-9]+/i.test(new URL(url).pathname);
        resolve({ url, isValidThread });
      });
    });
  }

  /**
   * Fetch sentiment data quickly (without bias analysis)
   */
  async fetchSentimentData(url) {
    const response = await fetch(`${this.backendUrl}/receive_url_fast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Failed to fetch sentiment data');
    }

    return result.data;
  }

  /**
   * Add bias analysis to existing comment data
   */
  async addBiasAnalysis(comments) {
    const response = await fetch(`${this.backendUrl}/add_bias_analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Failed to fetch bias data');
    }

    return result.data;
  }

  /**
   * Parallel data fetching with callbacks for progressive rendering
   */
  async fetchDataParallel(url, onSentimentReady, onBiasReady) {
    try {
      // Start sentiment analysis (fast)
      const sentimentPromise = this.fetchSentimentData(url);
      
      // Get sentiment data and render immediately
      const sentimentData = await sentimentPromise;
      onSentimentReady(sentimentData);
      
      // Start bias analysis in parallel (slow)
      const biasPromise = this.addBiasAnalysis(sentimentData);
      
      // Get bias data and render when ready
      const biasData = await biasPromise;
      onBiasReady(biasData);
      
      return biasData; // Return complete data
      
    } catch (error) {
      console.error('Error in parallel fetch:', error);
      throw error;
    }
  }
}

// Alternative approach using Promise.allSettled for true parallelism
export class DataServiceAdvanced extends DataService {
  /**
   * Truly parallel processing - starts both sentiment and bias immediately
   * Note: This requires modifying backend to cache Reddit data between calls
   */
  async fetchDataTrulyParallel(url, onSentimentReady, onBiasReady) {
    const sentimentPromise = this.fetchSentimentData(url)
      .then(data => {
        onSentimentReady(data);
        return data;
      });

    // Wait a bit for Reddit data to be cached, then start bias
    const biasPromise = new Promise(resolve => setTimeout(resolve, 1000))
      .then(() => this.fetchFullData(url)) // This would be your original endpoint
      .then(data => {
        onBiasReady(data);
        return data;
      });

    // Handle both promises
    const results = await Promise.allSettled([sentimentPromise, biasPromise]);
    
    return results[1].status === 'fulfilled' ? results[1].value : results[0].value;
  }

  async fetchFullData(url) {
    // Your original fetchSentimentData method renamed
    const response = await fetch(`${this.backendUrl}/receive_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Failed to fetch data');
    }

    return result.data;
  }
}