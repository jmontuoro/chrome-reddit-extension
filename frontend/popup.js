// popup.js - Main coordination script
import { DataService } from './modules/data-service.js';
import { ChartRenderer } from './modules/chart-renderer.js';
import { UIManager } from './modules/ui-manager.js';

class PopupCoordinator {
  constructor() {
    this.dataService = new DataService();
    this.chartRenderer = new ChartRenderer();
    this.uiManager = new UIManager();
  }

  async initialize() {
    // Set up UI based on window type
    this.uiManager.setupUI();
    
    // Get Reddit URL and validate
    const { url, isValidThread } = await this.dataService.getRedditUrl();
    
    if (!isValidThread) {
      this.uiManager.showInvalidThreadMessage();
      return;
    }

    // Start parallel data processing
    await this.processDataParallel(url);
  }

  async processDataParallel(url) {
    try {
      // Show initial loading state
      this.uiManager.showLoadingState();

      // Fetch data with parallel processing
      await this.dataService.fetchDataParallel(
        url,
        (sentimentData) => this.onSentimentReady(sentimentData),
        (biasData) => this.onBiasReady(biasData)
      );

    } catch (error) {
      console.error('Error processing data:', error);
      this.uiManager.showError(error.message);
    }
  }

  onSentimentReady(sentimentData) {
    /**
     * Called when sentiment data is ready - render initial charts
     */
    console.log('Sentiment data ready, rendering initial charts...');
    
    // Update loading status
    this.uiManager.hideChartLoading('sentiment');
    this.uiManager.showChartProgress('bar', 'Rendering with sentiment...');
    this.uiManager.showChartProgress('sunburst', 'Building hierarchy...');

    // Render initial charts without bias data
    this.chartRenderer.renderSentimentLegend(sentimentData);
    
    // Render bar chart with notice that bias is loading
    this.chartRenderer.renderBarChart(sentimentData, { biasDataAvailable: false });
    
    // Render sunburst chart with notice that bias is loading  
    this.chartRenderer.renderSunburstChart(sentimentData, { biasDataAvailable: false });

    // Hide individual loading indicators
    this.uiManager.hideChartLoading('bar');
    this.uiManager.hideChartLoading('sunburst');
  }

  onBiasReady(biasData) {
    /**
     * Called when bias analysis is complete - update charts with bias features
     */
    console.log('Bias data ready, updating charts with bias features...');
    
    // Update loading status
    this.uiManager.hideChartLoading('bias');
    
    // Update all charts with bias data
    this.chartRenderer.renderBiasCharts(biasData);
    
    // Clear all loading indicators
    this.uiManager.hideLoadingIndicators();
    
    console.log('All charts updated with bias data!');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const coordinator = new PopupCoordinator();
  await coordinator.initialize();
});