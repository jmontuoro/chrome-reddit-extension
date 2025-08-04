// modules/chart-utils.js - Chart creation utilities and data processing
export class ChartUtils {
  constructor() {
    this.colorScales = {
      sentiment: [[0.0, "red"], [0.5, "yellow"], [1.0, "green"]],
      bias: {
        low: [[0.0, "lightblue"], [1.0, "#87CEEB"]],
        medium: [[0.0, "lightblue"], [0.7, "#E0F6FF"], [0.85, "#FFE4B5"], [1.0, "#FFA07A"]],
        high: [[0.0, "lightblue"], [0.5, "#E0F6FF"], [0.7, "#FFE4B5"], [0.85, "#FFA07A"], [1.0, "#FF6347"]],
        extreme: [[0.0, "lightblue"], [0.3, "#E0F6FF"], [0.5, "#FFE4B5"], [0.7, "#FFA07A"], [0.85, "#FF6347"], [1.0, "red"]]
      }
    };
  }

  // Sentiment chart utilities
  createSentimentGradientTrace() {
    return {
      type: "heatmap",
      z: Array.from({ length: 101 }, (_, i) => [i / 100]),
      x: [0],
      y: Array.from({ length: 101 }, (_, i) => i / 100),
      colorscale: this.colorScales.sentiment,
      showscale: false,
      hoverinfo: "none"
    };
  }

  calculateSentimentScores(data) {
    const normScores = data.map(d => (d.sentiment + 1) / 2);
    const avgScore = normScores.reduce((a, b) => a + b, 0) / normScores.length;
    
    const opComment = data.find(d => d.parent_id === "");
    const opScore = opComment ? (opComment.sentiment + 1) / 2 : 0;
    
    return { avgScore, opScore };
  }

  // Bias chart utilities
  calculateBiasData(data) {
    const labelTotals = {};
    let count = 0;

    for (const row of data) {
      if (!row.bias || typeof row.bias !== "object") continue;
      
      for (const [label, value] of Object.entries(row.bias)) {
        if (label.toLowerCase() === "none") continue;
        labelTotals[label] = (labelTotals[label] || 0) + value;
      }
      count++;
    }

    const labelAverages = Object.fromEntries(
      Object.entries(labelTotals).map(([label, total]) => [label, total / count])
    );

    return { labelAverages, count };
  }

  createBiasChart({ labelAverages }) {
    const biasValues = Object.values(labelAverages).sort((a, b) => a - b);
    const percentile90 = this.calculatePercentile90(biasValues);
    const scaleMax = percentile90 / 0.65;
    
    const { logMin, logMax } = this.calculateLogScale(scaleMax);
    const trace = this.createBiasGradientTrace(logMin, logMax, scaleMax, percentile90);
    const layout = this.createBiasLayout(logMin, logMax, labelAverages, scaleMax, percentile90);

    return { trace, layout };
  }

  calculatePercentile90(values) {
    const percentileIndex = Math.floor(values.length * 0.9);
    return values.length > 5 ? values[percentileIndex] : Math.max(...values);
  }

  calculateLogScale(scaleMax) {
    const minBias = 1e-4;
    return {
      logMin: Math.log10(minBias),
      logMax: Math.log10(scaleMax + minBias)
    };
  }

  createBiasGradientTrace(logMin, logMax, scaleMax, percentile90) {
    const ySteps = 201;
    const y = Array.from({ length: ySteps }, (_, i) =>
      logMin + (i / (ySteps - 1)) * (logMax - logMin)
    );
    
    const zVals = y.map(logY => {
      const biasValue = Math.pow(10, logY) - 1e-4;
      const normalizedValue = Math.min(biasValue / scaleMax, 1);
      return [normalizedValue];
    });

    return {
      type: "heatmap",
      z: zVals,
      x: [0],
      y: y,
      colorscale: this.getBiasColorScale(percentile90),
      zmin: 0,
      zmax: 1,
      showscale: false,
      hoverinfo: "none"
    };
  }

  getBiasColorScale(p90Value) {
    if (p90Value <= 0.01) return this.colorScales.bias.low;
    if (p90Value <= 0.1) return this.colorScales.bias.medium;
    if (p90Value <= 0.5) return this.colorScales.bias.high;
    return this.colorScales.bias.extreme;
  }

  createBiasLayout(logMin, logMax, labelAverages, scaleMax, percentile90) {
    const layout = this.getLegendLayout([0, 1]);
    
    layout.yaxis = {
      range: [logMin, logMax],
      tickvals: [0, 0.2, 0.4, 0.6, 0.8, 1.0].map(f => logMin + f * (logMax - logMin)),
      ticktext: [0, 0.2, 0.4, 0.6, 0.8, 1.0].map(f => {
        const logVal = logMin + f * (logMax - logMin);
        return `10^${logVal.toFixed(1)}`;
      }),
      side: 'right',
      showgrid: false,
      tickfont: { size: 7 },
      showticklabels: true
    };

    this.addBiasAnnotations(layout, labelAverages, scaleMax, percentile90);
    return layout;
  }

  addBiasAnnotations(layout, labelAverages, scaleMax, percentile90) {
    const { highBiasColor, highBiasText } = this.getBiasLabelStyles(percentile90);
    
    layout.annotations = [
      this.createAnnotation(0.5, 1.07, highBiasText, highBiasColor, "center"),
      this.createAnnotation(0.5, -0.07, "Min Bias", "lightblue", "center")
    ];

    // Add bias dots and labels
    for (const [label, avg] of Object.entries(labelAverages)) {
      const yPos = Math.log10(avg + 1e-4);
      const color = avg > scaleMax ? "orange" : "purple";

      layout.shapes.push(this.createBiasDot(yPos, color));
      layout.annotations.push(this.createBiasLabel(label, yPos, color));
    }
  }

  getBiasLabelStyles(percentile90) {
    if (percentile90 <= 0.01) return { highBiasColor: "#4682B4", highBiasText: "Low Range" };
    if (percentile90 <= 0.1) return { highBiasColor: "#FFA07A", highBiasText: "Med Range" };
    if (percentile90 <= 0.5) return { highBiasColor: "#FF6347", highBiasText: "High Range" };
    return { highBiasColor: "red", highBiasText: "High Range" };
  }

  // Bar chart utilities
  summarizeCommentsByBin(data) {
    const summary = {};

    for (const row of data) {
      const bin = row.oc_bin_id || "Unbinned";

      if (!summary[bin]) {
        summary[bin] = {
          count: 0,
          totalSentiment: 0,
          oc_author: row.oc_author || row.author || "anonymous",
          body: row.body,
          score: row.score || 0,
          is_op: false
        };
      }

      summary[bin].count++;
      summary[bin].totalSentiment += row.sentiment || 0;

      if (row.parent_id === "") {
        summary[bin].is_op = true;
      }
    }

    return summary;
  }

  createBarChartTrace(summary) {
    const bins = Object.keys(summary);

    return {
      type: "bar",
      x: bins.map(bin => {
        const author = summary[bin].oc_author;
        return summary[bin].is_op ? `${author} (OP)` : author;
      }),
      y: bins.map(bin => summary[bin].count),
      hovertext: bins.map(bin => this.createBarHoverText(summary[bin])),
      hoverinfo: "skip",
      hovertemplate: "%{hovertext}<extra></extra>",
      marker: {
        color: bins.map(bin => summary[bin].totalSentiment / summary[bin].count),
        colorscale: this.colorScales.sentiment,
        cmin: -1,
        cmax: 1,
        showscale: false
      }
    };
  }

  createBarHoverText(row) {
    return `
      <b>author</b>: ${row.oc_author}<br>
      <b>score</b>: ${row.score}<br>
      <b>body</b>: ${row.body.slice(0, 100)}...<br>
      <b>avg_sentiment</b>: ${(row.totalSentiment / row.count).toFixed(4)}
    `;
  }

  // Sunburst chart utilities
  processSunburstData(data) {
    this.normalizeParentIds(data);
    return this.filterValidHierarchy(data);
  }

  normalizeParentIds(data) {
    data.forEach(row => {
      row.parent = row.parent_id?.replace(/^t[13]_/, "") || "";
    });
  }

  filterValidHierarchy(data) {
    const validIds = new Set(data.map(r => r.id));
    return data.filter(r => r.parent === "" || validIds.has(r.parent));
  }

  createSunburstTrace(data) {
    return {
      type: "sunburst",
      ids: data.map(r => r.id),
      labels: data.map(r => r.author || "anonymous"),
      parents: data.map(r => r.parent),
      values: data.map(r => Math.max(r.score || 1, 1)),
      hovertext: data.map(r => this.createSunburstHoverText(r)),
      hoverinfo: "text",
      marker: {
        colors: data.map(r => r.sentiment),
        colorscale: this.colorScales.sentiment,
        cmin: -1,
        cmax: 1,
        showscale: false
      }
    };
  }

  createSunburstHoverText(row) {
    return `
      <b>author</b>: ${row.author || "anonymous"}<br>
      <b>score</b>: ${row.score}<br>
      <b>body</b>: ${row.body.slice(0, 100)}...<br>
      <b>sentiment_label</b>: ${row.sentiment_label}<br>
      <b>sentiment_compound</b>: ${row.sentiment.toFixed(4)}
    `;
  }

  // Common utilities
  getLegendLayout(yRange = [0, 1]) {
    return {
      xaxis: { visible: false, constrain: 'domain' },
      yaxis: { visible: false, range: yRange },
      margin: { t: 30, b: 30, l: 35, r: 40 },
      height: 300,
      width: 100,
      annotations: [],
      shapes: []
    };
  }

  createHorizontalLine(y, color) {
    return {
      type: "line",
      x0: 0, x1: 1,
      y0: y, y1: y,
      xref: "paper", yref: "paper",
      line: { color, width: 2 },
      layer: "above"
    };
  }

  createAnnotation(x, y, text, color, anchor) {
    return {
      x, y, text,
      showarrow: false,
      xref: "paper", yref: "paper",
      font: { size: 11, color },
      xanchor: anchor,
      layer: "above"
    };
  }

  createBiasDot(yPos, color) {
    return {
      type: "circle",
      xref: "x domain",
      yref: "y",
      x0: 0.48, x1: 0.52,
      y0: yPos - 0.005, y1: yPos + 0.005,
      fillcolor: color,
      line: { width: 0 },
      layer: "above"
    };
  }

  createBiasLabel(label, yPos, color) {
    return {
      x: 0.1,
      y: yPos - 0.04,
      text: label,
      showarrow: false,
      xref: "paper",
      yref: "y",
      font: { size: 10, color },
      xanchor: "right",
      textangle: -45,
      layer: "above"
    };
  }
}