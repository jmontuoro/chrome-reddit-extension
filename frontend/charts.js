/**
 * Renders the horizontal sentiment scale using a heatmap gradient.
 * Also injects sentiment-related insights above the plot.
 * 
 * @param {Object} data - Full Reddit thread sentiment data object
 */
export function renderSentimentLegend(data) {
  const gradientTrace = {
    type: "heatmap",
    z: Array.from({ length: 101 }, (_, i) => [i / 100]), // vertical orientation
    x: [0],  // dummy single column
    y: Array.from({ length: 101 }, (_, i) => i / 100),
    colorscale: [
      [0.0, "red"],
      [0.5, "yellow"],
      [1.0, "green"]
    ],
    showscale: false,
    hoverinfo: "none"
  };

  const layout = getLegendLayout();

  renderInsights(layout, data, 'sentiment'); // this will still work fine
  document.getElementById("legend-status").textContent = ""; // clear it before rendering
    layout.annotations.push(
      {
        x: 0.5,
        y: -0.07, // below the chart
        xref: "paper",
        yref: "paper",
        text: "Negative",
        showarrow: false,
        xanchor: "center",
        font: { size: 12, color: "black" }
      },
      {
        x: 0.5,
        y: 1.07, // above the chart
        xref: "paper",
        yref: "paper",
        text: "Positive",
        showarrow: false,
        xanchor: "center",
        font: { size: 12, color: "black" }
      }
    );

  Plotly.newPlot("legend-container", [gradientTrace], layout, {
    responsive: false,
    displayModeBar: false,
    staticPlot: true
  });
}

/**
 * Renders a vertical bias scale legend using a Plotly heatmap,
 * styled to match the sentiment scale. The scale runs from 
 * light blue (low bias) at the bottom to purple (high bias) at the top.
 * Also includes text annotations for "Low Bias" and "High Bias".
 *
 * @param {Array} data - Optional comment data array (not directly used, but kept for consistent API).
 */
export function renderBiasLegend(data) {
  // Step 1: Compute average bias per label
  const labelTotals = {};
  let count = 0;

  for (let row of data) {
    const bias = row.bias;
    if (bias && typeof bias === "object") {
      for (const [label, value] of Object.entries(bias)) {
        if (label.toLowerCase() === "none") continue;
        labelTotals[label] = (labelTotals[label] || 0) + value;
      }
      count += 1;
    }
  }

  const labelAverages = Object.fromEntries(
    Object.entries(labelTotals).map(([label, total]) => [label, total / count])
  );

  const maxBias = Math.max(...Object.values(labelAverages), 1e-4); // avoid log(0)
  const logMax = logBias(maxBias); // highest log bias value

  // Step 2: Prepare gradient heatmap based on logMax
  const zVals = Array.from({ length: 201 }, (_, i) => [i * (logMax / 200)]); // vertical 1-col matrix

  const gradientTrace = {
    type: "heatmap",
    z: zVals,
    x: [0],
    y: Array.from({ length: 201 }, (_, i) => i / 200), // y is always 0 to 1
    colorscale: [
      [0.0, "blue"],        // at z = 0
      [1.0, "red"]          // at z = logMax
    ],
    zmin: 0,
    zmax: logMax,

    showscale: false,
    hoverinfo: "none"
  };

  // Step 3: Setup y-axis to match rescaled logBias
  const layout = getLegendLayout([0, 1]);

  layout.yaxis = {
    range: [0, 1],
    tickvals: [0, 0.25, 0.5, 0.75, 1],
    ticktext: ["10^{-4}", "10^{-3}", "10^{-2}", "10^{-1}", "10^{0}"],
    side: 'right',
    showgrid: false,
    tickfont: { size: 10 },
    showticklabels: true
  };

  // Step 4: Annotate top and bottom
  layout.annotations.push(
    {
      x: 0.5,
      y: 1.07,
      xref: "paper",
      yref: "paper",
      text: "Low Bias",
      showarrow: false,
      xanchor: "center",
      font: { size: 12, color: "black" }
    },
    {
      x: 0.5,
      y: -0.07,
      xref: "paper",
      yref: "paper",
      text: "High Bias",
      showarrow: false,
      xanchor: "center",
      font: { size: 12, color: "black" }
    }
  );

  // Step 5: Render insight dots using rescaled values
  function rescaleLogBias(value) {
    const min = logBias(1e-4); // fixed minimum
    const max = logBias(maxBias); // dynamic max
    return (logBias(value) - min) / (max - min);
  }

  layout.shapes = [];
  for (const [label, avg] of Object.entries(labelAverages)) {
    const y = rescaleLogBias(avg);

    layout.shapes.push({
      type: "circle",
      xref: "x domain",
      yref: "y",
      x0: 0.48,
      x1: 0.52,
      y0: y - 0.005,
      y1: y + 0.005,
      fillcolor: "red",
      line: { width: 0 },
      layer: "above"
    });

    layout.annotations.push({
      x: 0,
      y: y,
      text: label,
      showarrow: false,
      xref: "paper",
      yref: "y",
      font: { size: 10, color: "purple" },
      xanchor: "right",
      layer: "above"
    });
  }

  // Step 6: Plot
  Plotly.newPlot("bias-legend-container", [gradientTrace], layout, {
    responsive: true,
    displayModeBar: false,
    staticPlot: false
  });
}

function renderInsights(layout, data, scoreType = "sentiment") {
  if (!data || data.length === 0) return;

  if (scoreType === "sentiment") {
    computeSentimentLines(layout, data);
  } else if (scoreType === "bias") {
    computeBiasDots(layout, data);
  }
}

/**
 * Renders a bar chart showing the number of comments per OC bin,
 * along with author information, average sentiment, and scores.
 *
 * @param {Object[]} data - Flattened Reddit comment data with sentiment
 */
export function renderBarChart(data) {
  const summary = {};

  for (let row of data) {
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

    summary[bin].count += 1;
    summary[bin].totalSentiment += row.sentiment || 0;

    if (row.parent_id === "") {
      summary[bin].is_op = true;
    }
  }

  const bins = Object.keys(summary);

  const barData = [{
    type: "bar",
    x: bins.map(bin => {
      const author = summary[bin].oc_author;
      return summary[bin].is_op ? `${author} (OP)` : author;
    }),
    y: bins.map(bin => summary[bin].count),
    hovertext: bins.map(bin => {
      const row = summary[bin];
      return `
        <b>author</b>: ${row.oc_author}<br>
        <b>score</b>: ${row.score}<br>
        <b>body</b>: ${row.body.slice(0, 100)}...<br>
        <b>avg_sentiment</b>: ${(row.totalSentiment / row.count).toFixed(4)}
      `;
    }),
    hoverinfo: "skip",
    hovertemplate: "%{hovertext}<extra></extra>",
    marker: {
      color: bins.map(bin => summary[bin].totalSentiment / summary[bin].count),
      colorscale: [
        [0.0, "red"],
        [0.5, "yellow"],
        [1.0, "green"]
      ],
      cmin: -1,
      cmax: 1,
      showscale: false
    }
  }];

  barContainer.innerHTML = "";
  Plotly.newPlot(barContainer, barData, {
    height: 400,
    xaxis: { tickangle: -45 },
    margin: { t: 40, b: 80 }
  });
}

/**
 * Renders a sunburst chart that visualizes the hierarchical structure
 * of Reddit comments and their associated sentiment.
 *
 * Each segment represents a comment, nested by parent ID, and is
 * color-coded by its sentiment score.
 *
 * @param {Object[]} data - Array of Reddit comments with sentiment scores
 */
export function renderSunburstChart(data) {
  normalizeParentIds(data);
  const filtered = filterValidHierarchy(data);

  const sunburstData = {
    type: "sunburst",
    ids: filtered.map(r => r.id),
    labels: filtered.map(r => r.author || "anonymous"),
    parents: filtered.map(r => r.parent),
    values: filtered.map(r => Math.max(r.score || 1, 1)),
    hovertext: filtered.map(r => `
      <b>author</b>: ${r.author || "anonymous"}<br>
      <b>score</b>: ${r.score}<br>
      <b>body</b>: ${r.body.slice(0, 100)}...<br>
      <b>sentiment_label</b>: ${r.sentiment_label}<br>
      <b>sentiment_compound</b>: ${r.sentiment.toFixed(4)}
    `),
    hoverinfo: "text",
    marker: {
      colors: filtered.map(r => r.sentiment),
      colorscale: [
        [0.0, "red"],
        [0.5, "yellow"],
        [1.0, "green"]
      ],
      cmin: -1,
      cmax: 1,
      showscale: false
    }
  };

  sunburstContainer.innerHTML = "";
  Plotly.newPlot(sunburstContainer, [sunburstData], {
    margin: { t: 0, l: 0, r: 0, b: 0 },
    autosize: true
  }, {
    responsive: true
  });
}


export function getLegendLayout(yRange = [0, 1]) {
  return {
    xaxis: {
      visible: false,
      constrain: 'domain'
    },
    yaxis: {
      visible: false,
      range: yRange
    },
    margin: { t: 30, b: 30, l: 30, r: 30 },
    height: 300,
    width: 100,
    annotations: [],
    shapes: []
  };
}
