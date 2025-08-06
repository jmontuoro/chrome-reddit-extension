// modules/chart-renderer.js - Handles all chart rendering
import { ChartUtils } from './chart-utils.js';

export class ChartRenderer {
  constructor() {
    this.utils = new ChartUtils();
    this.containers = {
      legend: document.getElementById("legend-container"),
      biasLegend: document.getElementById("bias-legend-container"),
      bar: document.getElementById("graph-container"),
      sunburst: document.getElementById("sunburst-container")
    };
    
    // Track current data for updates
    this.currentData = null;
    this.sunburstRendered = false;
    this.barRendered = false;
  }

  renderSentimentLegend(data) {
    this.currentData = data; // Store for potential updates
    
    const trace = this.utils.createSentimentGradientTrace();
    const layout = this.utils.getLegendLayout();
    
    this.addSentimentInsights(layout, data);
    this.addSentimentLabels(layout);

    // Don't clear loading text here - let the UI manager handle it
    // The legend status should show progress during parallel processing

    Plotly.newPlot(this.containers.legend, [trace], layout, {
      responsive: false,
      displayModeBar: false,
      staticPlot: true
    });
  }

  renderBiasLegend(data) {
    const biasData = this.utils.calculateBiasData(data);
    const { trace, layout } = this.utils.createBiasChart(biasData);

    Plotly.newPlot(this.containers.biasLegend, [trace], layout, {
      responsive: true,
      displayModeBar: false,
      staticPlot: false
    });
  }

  renderBarChart(data, options = {}) {
    this.currentData = data; // Store for potential updates
    
    const summary = this.utils.summarizeCommentsByBin(data);
    const trace = this.utils.createBarChartTrace(summary);

    this.containers.bar.innerHTML = "";
    Plotly.newPlot(this.containers.bar, [trace], {
      height: 400,
      xaxis: { tickangle: -45 },
      margin: { t: 40, b: 80 }
    });
    
    this.barRendered = true;
    
    // If bias data isn't available yet, show a note
    if (options.biasDataAvailable === false) {
      this.showBarBiasNotice();
    }
  }

  renderSunburstChart(data, options = {}) {
    this.currentData = data; // Store for potential updates
    
    const processedData = this.utils.processSunburstData(data);
    const trace = this.utils.createSunburstTrace(processedData);

    this.containers.sunburst.innerHTML = "";
    Plotly.newPlot(this.containers.sunburst, [trace], {
      margin: { t: 0, l: 0, r: 0, b: 0 },
      autosize: true
    }, {
      responsive: true
    });
    
    this.sunburstRendered = true;
    
    // If bias data isn't available yet, show a note
    if (options.biasDataAvailable === false) {
      this.showSunburstBiasNotice();
    }
  }

  // Update bar chart with bias data
  updateBarWithBias(biasData) {
    /**
     * Update existing bar chart with bias data
     * Called when bias analysis completes after initial render
     */
    if (!this.barRendered) {
      // If bar chart wasn't rendered yet, render it now with full data
      this.renderBarChart(biasData);
      return;
    }

    // Update the existing bar chart with new bias data
    const summary = this.utils.summarizeCommentsByBin(biasData);
    const trace = this.utils.createBarChartTrace(summary);

    Plotly.react(this.containers.bar, [trace], {
      height: 400,
      xaxis: { tickangle: -45 },
      margin: { t: 40, b: 80 }
    });

    // Remove any bias loading notice
    this.hideBarBiasNotice();
  }

  updateSunburstWithBias(biasData) {
    /**
     * Update existing sunburst chart with bias data
     * Called when bias analysis completes after initial render
     */
    if (!this.sunburstRendered) {
      // If sunburst wasn't rendered yet, render it now with full data
      this.renderSunburstChart(biasData);
      return;
    }

    // Update the existing sunburst with new bias data
    const processedData = this.utils.processSunburstData(biasData);
    const trace = this.utils.createSunburstTrace(processedData);

    Plotly.react(this.containers.sunburst, [trace], {
      margin: { t: 0, l: 0, r: 0, b: 0 },
      autosize: true
    });

    // Remove any bias loading notice
    this.hideSunburstBiasNotice();
  }

  renderBiasCharts(data) {
    /**
     * Render any additional bias-specific charts
     * Called when bias data becomes available
     */
    // Update both advanced charts with bias data
    this.updateBarWithBias(data);
    this.updateSunburstWithBias(data);
    this.renderBiasLegend(data);
    
    // Clear loading text when bias processing is complete
    const legendStatus = document.getElementById("legend-status");
    if (legendStatus) legendStatus.textContent = "";
  }

  // NEW: Bar chart bias loading notice
  showBarBiasNotice() {
    /**
     * Show a temporary notice that bias data is still loading for bar chart
     */
    const notice = document.createElement('div');
    notice.id = 'bar-bias-notice';
    notice.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.9);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      color: #666;
      border: 1px solid #ddd;
      z-index: 1000;
    `;
    notice.textContent = 'Loading bias data...';
    
    // Make bar container relative for positioning
    this.containers.bar.style.position = 'relative';
    this.containers.bar.appendChild(notice);
  }

  hideBarBiasNotice() {
    /**
     * Remove the bias loading notice from bar chart
     */
    const notice = document.getElementById('bar-bias-notice');
    if (notice) {
      notice.remove();
    }
  }

  showSunburstBiasNotice() {
    /**
     * Show a temporary notice that bias data is still loading
     */
    const notice = document.createElement('div');
    notice.id = 'sunburst-bias-notice';
    notice.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.9);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      color: #666;
      border: 1px solid #ddd;
      z-index: 1000;
    `;
    notice.textContent = 'Loading bias data...';
    
    // Make sunburst container relative for positioning
    this.containers.sunburst.style.position = 'relative';
    this.containers.sunburst.appendChild(notice);
  }

  hideSunburstBiasNotice() {
    /**
     * Remove the bias loading notice
     */
    const notice = document.getElementById('sunburst-bias-notice');
    if (notice) {
      notice.remove();
    }
  }


  updateChartData(chartType, newData) {
    /**
     * Generic method to update chart data
     * @param {string} chartType - 'bar', 'sunburst', 'legend', 'bias'
     * @param {Array} newData - Updated data array
     */
    switch(chartType) {
      case 'bar':
        this.updateBarWithBias(newData);
        break;
      case 'sunburst':
        this.updateSunburstWithBias(newData);
        break;
      case 'legend':
        this.renderSentimentLegend(newData);
        break;
      case 'bias':
        this.renderBiasLegend(newData);
        break;
      default:
        console.warn(`Unknown chart type: ${chartType}`);
    }
  }

  hasData() {
    /**
     * Check if renderer has data to work with
     */
    return this.currentData !== null;
  }

  getCurrentData() {
    /**
     * Get current data stored in renderer
     */
    return this.currentData;
  }


  addSentimentInsights(layout, data) {
    const { avgScore, opScore } = this.utils.calculateSentimentScores(data);
    
    layout.shapes = [
      this.utils.createHorizontalLine(avgScore, "pink"),
      this.utils.createHorizontalLine(opScore, "cyan")
    ];

    layout.annotations.push(
      this.utils.createAnnotation(1, avgScore, "Avg", "pink", "left"),
      this.utils.createAnnotation(0, opScore + 0.035, "OP", "cyan", "right")
    );
  }

  addSentimentLabels(layout) {
    layout.annotations.push(
      this.utils.createAnnotation(0.5, -0.07, "Negative", "black", "center"),
      this.utils.createAnnotation(0.5, 1.07, "Positive", "black", "center")
    );
  }
}