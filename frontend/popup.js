// popup.js - Main entry point
import { UIManager } from './modules/ui-manager.js';
import { DataService } from './modules/data-service.js';
import { ChartRenderer } from './modules/chart-renderer.js';

class PopupApp {
  constructor() {
    this.uiManager = new UIManager();
    this.dataService = new DataService();
    this.chartRenderer = new ChartRenderer();
  }

  async init() {
    this.uiManager.setupUI();
    await this.loadAndRenderData();
  }

  async loadAndRenderData() {
    try {
      const { url, isValidThread } = await this.dataService.getRedditUrl();
      
      if (!isValidThread) {
        this.uiManager.showInvalidThreadMessage();
        return;
      }

      const data = await this.dataService.fetchSentimentData(url);
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