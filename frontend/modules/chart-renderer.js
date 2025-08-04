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
  }

  renderSentimentLegend(data) {
    const trace = this.utils.createSentimentGradientTrace();
    const layout = this.utils.getLegendLayout();
    
    this.addSentimentInsights(layout, data);
    this.addSentimentLabels(layout);

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

  renderBarChart(data) {
    const summary = this.utils.summarizeCommentsByBin(data);
    const trace = this.utils.createBarChartTrace(summary);

    this.containers.bar.innerHTML = "";
    Plotly.newPlot(this.containers.bar, [trace], {
      height: 400,
      xaxis: { tickangle: -45 },
      margin: { t: 40, b: 80 }
    });
  }

  renderSunburstChart(data) {
    const processedData = this.utils.processSunburstData(data);
    const trace = this.utils.createSunburstTrace(processedData);

    this.containers.sunburst.innerHTML = "";
    Plotly.newPlot(this.containers.sunburst, [trace], {
      margin: { t: 0, l: 0, r: 0, b: 0 },
      autosize: true
    }, {
      responsive: true
    });
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