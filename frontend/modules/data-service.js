// modules/data-service.js - Data Fetching and sentiment/bias score attribution

export class DataService {
  constructor() {
    this.backendUrl = 'https://reddit-extension-backend-541360204677.us-central1.run.app';
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
   * NEW: Get bias analysis for only the top 50 posts by score
   * Used specifically for advanced visualizations hovertips
   */
  async addBiasAnalysisTop50(sentimentData) {
    // Sort by score descending and take top 50
    const sortedData = [...sentimentData].sort((a, b) => (b.score || 0) - (a.score || 0));
    const top50 = sortedData.slice(0, 50);
    
    console.log(`Getting bias analysis for top 50 posts (out of ${sentimentData.length} total)`);
    
    // Get bias data for top 50
    const biasResults = await this.addBiasAnalysis(top50);
    
    // Create a map of id -> bias data for easy lookup
    const biasMap = new Map();
    biasResults.forEach(item => {
      if (item.id && item.bias) {
        biasMap.set(item.id, item.bias);
      }
    });
    
    // Merge bias data back into original dataset
    const enhancedData = sentimentData.map(item => {
      const biasData = biasMap.get(item.id);
      return biasData ? { ...item, bias: biasData } : item;
    });
    
    console.log(`Enhanced ${biasMap.size} posts with bias data`);
    return enhancedData;
  }

  /**
   * Parallel data fetching with callbacks for progressive rendering
   * NOW INCLUDES TOP 50 BIAS FOR ADVANCED VISUALIZATIONS
   */
  async fetchDataParallel(url, onSentimentReady, onBiasReady) {
    try {
      // Start sentiment analysis (fast)
      const sentimentPromise = this.fetchSentimentData(url);
      
      // Get sentiment data and render immediately
      const sentimentData = await sentimentPromise;
      onSentimentReady(sentimentData);
      
      // For advanced visualizations, get bias for top 50 posts only
      const biasPromise = this.addBiasAnalysisTop50(sentimentData);
      
      // Get bias data and render when ready
      const biasData = await biasPromise;
      onBiasReady(biasData);
      
      return biasData; // Return complete data
      
    } catch (error) {
      console.error('Error in parallel fetch:', error);
      throw error;
    }
  }

  // Keep existing methods unchanged...
  async fetchFullData(url) {
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

// Keep DataServiceAdvanced class unchanged...
export class DataServiceAdvanced extends DataService {
  async fetchDataTrulyParallel(url, onSentimentReady, onBiasReady) {
    const sentimentPromise = this.fetchSentimentData(url)
      .then(data => {
        onSentimentReady(data);
        return data;
      });

    const biasPromise = new Promise(resolve => setTimeout(resolve, 1000))
      .then(() => this.fetchFullData(url))
      .then(data => {
        onBiasReady(data);
        return data;
      });

    const results = await Promise.allSettled([sentimentPromise, biasPromise]);
    
    return results[1].status === 'fulfilled' ? results[1].value : results[0].value;
  }
}