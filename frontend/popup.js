// Updated popup.js - Main entry point with parallel rendering
import { UIManager } from './modules/ui-manager.js';
import { DataService } from './modules/data-service.js';
import { ChartRenderer } from './modules/chart-renderer.js';

class PopupApp {
  constructor() {
    this.uiManager = new UIManager();
    this.dataService = new DataService();
    this.chartRenderer = new ChartRenderer();
    this.sentimentDataReady = false;
    this.biasDataReady = false;
  }

  async init() {
    this.uiManager.setupUI();
    await this.loadAndRenderDataParallel();
  }

  async loadAndRenderDataParallel() {
    try {
      const { url, isValidThread } = await this.dataService.getRedditUrl();
      
      if (!isValidThread) {
        this.uiManager.showInvalidThreadMessage();
        return;
      }

      // Show initial loading state
      this.uiManager.showLoadingState();

      // Fetch data with parallel processing
      await this.dataService.fetchDataParallel(
        url,
        (sentimentData) => this.handleSentimentReady(sentimentData),
        (biasData) => this.handleBiasReady(biasData)
      );

    } catch (error) {
      this.uiManager.showError(error.message);
      console.error('Error:', error);
    }
  }

  handleSentimentReady(sentimentData) {
    console.log('Sentiment data ready, rendering charts...');
    
    this.sentimentDataReady = true;
    const isPopup = this.uiManager.isInPopupWindow;
    
    // Render sentiment-dependent charts immediately
    if (!isPopup) {
      this.chartRenderer.renderSentimentLegend(sentimentData);
      this.uiManager.updateLoadingStatus('Sentiment analysis complete! Loading bias analysis...');
    } else {
      this.chartRenderer.renderBarChart(sentimentData);
      this.chartRenderer.renderSunburstChart(sentimentData, { biasDataAvailable: false });
      this.uiManager.updateLoadingStatus('Sentiment charts ready! Processing bias data...');
    }
  }

  handleBiasReady(biasData) {
    console.log('Bias data ready, updating charts...');
    
    this.biasDataReady = true;
    const isPopup = this.uiManager.isInPopupWindow;
    
    // Render bias-dependent charts and update existing ones
    if (!isPopup) {
      this.chartRenderer.renderBiasLegend(biasData);
      this.uiManager.updateLoadingStatus('All analysis complete!');
    } else {
      // Update sunburst with bias data
      this.chartRenderer.updateSunburstWithBias(biasData);
      this.chartRenderer.renderBiasCharts(biasData); // Any additional bias-specific charts
      this.uiManager.updateLoadingStatus('All visualizations ready!');
    }
    
    // Hide loading indicators
    setTimeout(() => this.uiManager.hideLoadingIndicators(), 1000);
  }

  // Fallback method for backwards compatibility
  async loadAndRenderData() {
    try {
      const { url, isValidThread } = await this.dataService.getRedditUrl();
      
      if (!isValidThread) {
        this.uiManager.showInvalidThreadMessage();
        return;
      }

      // Use original full data fetch method
      const data = await this.dataService.fetchFullData(url);
      this.renderCharts(data);
    } catch (error) {
      this.uiManager.showError(error.message);
      console.error('Error:', error);
    }
  }

  renderCharts(data) {
    const isPopup = this.uiManager.isInPopupWindow;
    
    if (!isPopup) {
      this.chartRenderer.renderSentimentLegend(data);
      this.chartRenderer.renderBiasLegend(data);
    } else {
      this.chartRenderer.renderBarChart(data);
      this.chartRenderer.renderSunburstChart(data);
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupApp().init();
});