// DOM containers
const barContainer = document.getElementById("graph-container");
const sunburstContainer = document.getElementById("sunburst-container");
const legendContainer = document.getElementById("legend-container");
const toggleButton = document.getElementById("expand-window");
const advancedVisuals = document.querySelector(".advanced-visuals");

// Check if this is the popup window (opened via `chrome.windows.create(...)`)
const isInPopupWindow = window.outerWidth >= 800 && window.outerHeight >= 600;

// Hide or show advanced visuals and toggle button accordingly
if (isInPopupWindow) {
  toggleButton.style.display = "none"; // Hide the "Open in Larger Window" button
  advancedVisuals.style.display = "block";
  legendContainer.style.display = 'none'; // hide sentiment legend in window
  document.getElementById("legend-header").style.display = 'none'; //Hide heading + loading

} else {
  advancedVisuals.style.display = "none";
  toggleButton.addEventListener("click", () => {
    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      width: 800,
      height: 700,
      top: 150,
      left: 200
    });
  });
}


// Load and render Reddit sentiment data
chrome.storage.local.get("reddit_url", (result) => {
  const url = result.reddit_url;

  let isThreadPage = false;

  try {
    const parsed = new URL(url);
    isThreadPage = /\/comments\/[a-z0-9]+/i.test(parsed.pathname);
  } catch (e) {
    console.warn("Invalid URL in storage:", url);
  }

  if (!url || !isThreadPage) {
    barContainer.innerHTML = "";
    sunburstContainer.innerHTML = "";
    legendContainer.innerHTML = `
      <div style="text-align: center; padding: 1em;">
        <img src="images/comment-icon.png" alt="comment icon" style="width: 80px; opacity: 1; margin-bottom: 10px;" />
        <p style="font-size: 14px; color: gray; line-height: 1.4;">
          This is not a Reddit thread page.<br>
          Navigate to a post and click its <strong>comments</strong> button,<br>
          then reopen the extension.
        </p>
      </div>
    `;
    return;
  }

  fetchSentimentData(url)
    .then(data => {
      if (!isInPopupWindow) {
        renderSentimentLegend(data);
        renderBiasLegend(data);
      }
      if (isInPopupWindow) {
        renderBarChart(data);
        renderSunburstChart(data);
      }
    })
    .catch(err => {
      barContainer.textContent = `Error loading data: ${err.message}`;
      sunburstContainer.textContent = `Error loading sunburst: ${err.message}`;
      console.error("Error:", err);
    });
});

/**
 * Renders the horizontal sentiment scale using a heatmap gradient.
 * Also injects sentiment-related insights above the plot.
 * 
 * @param {Object} data - Full Reddit thread sentiment data object
 */
function renderSentimentLegend(data) {
  const gradientTrace = {
    type: "heatmap",
    z: Array.from({ length: 201 }, (_, i) => [-1 + i * 0.01]), // vertical orientation
    x: [0],  // dummy single column
    y: Array.from({ length: 201 }, (_, i) => -1 + i * 0.01),
    colorscale: [
      [0.0, "red"],
      [0.5, "yellow"],
      [1.0, "green"]
    ],
    showscale: false,
    hoverinfo: "none"
  };

  const layout = {
    xaxis: { visible: false },
    yaxis: { visible: false },
    margin: { t: 30, b: 30, l: 30, r: 30 },
    height: 300,
    width: 100,
    annotations: [
      { x: 0, y: -1.06, text: "Negative", showarrow: false, xref: "x", yref: "y", font: { size: 12 } },
      { x: 0, y: 1.07, text: "Positive", showarrow: false, xref: "x", yref: "y", font: { size: 12 } }
    ]
  };

  renderInsights(layout, data, 'sentiment'); // this will still work fine
  document.getElementById("legend-status").textContent = ""; // clear it before rendering
  Plotly.newPlot("legend-container", [gradientTrace], layout, {
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
function renderBiasLegend(data) {
  const gradientTrace = {
    type: "heatmap",
    z: Array.from({ length: 201 }, (_, i) => [-1 + i * 0.01]),
    x: [0],
    y: Array.from({ length: 201 }, (_, i) => i * 0.01),
    colorscale: [
      [0.0, "lightblue"],
      [1.0, "purple"]
    ],
    showscale: false,
    hoverinfo: "none"
  };

  const layout = {
    xaxis: { visible: false },
    yaxis: {
      visible: false,
      range: [0, 1]},
    margin: { t: 30, b: 30, l: 30, r: 30 },
    height: 300,
    width: 100,
    annotations: [
      { x: 0, y: 0, text: "Low Bias", showarrow: false, xref: "x", yref: "y" },
      { x: 0, y: 1, text: "High Bias", showarrow: false, xref: "x", yref: "y" }
    ]
  };

  renderInsights(layout, data, 'bias');
  Plotly.newPlot("bias-legend-container", [gradientTrace], layout, {
    displayModeBar: false,
    staticPlot: true
  });
}





/**
 * Sends a POST request to the backend with the Reddit thread URL,
 * and returns parsed sentiment data.
 *
 * @param {string} url - The Reddit thread URL
 * @returns {Promise<Object[]>} - Promise resolving to sentiment-analyzed comment data
 */
function fetchSentimentData(url) {
  return fetch("https://reddit-extension-backend-541360204677.us-central1.run.app/receive_url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  })
    .then(res => res.json())
    .then(result => {
      if (result.status !== "success") {
        throw new Error(result.message);
      }
      return result.data;
    });
}

/**
 * Adds annotation overlays to a Plotly layout depending on score type.
 * 
 * - For "sentiment", it shows 2 horizontal lines (Avg and OP).
 * - For "bias", it shows 8 labeled points representing average bias for each label.
 *
 * @param {Object} layout - Plotly layout object to modify.
 * @param {Array} data - Array of Reddit comment data.
 * @param {string} scoreType - Either "sentiment" or "bias".
 */
function renderInsights(layout, data, scoreType = "sentiment") {
  if (!data || data.length === 0) return;

  if (scoreType === "sentiment") {
    computeSentimentLines(layout, data);
  } else if (scoreType === "bias") {
    computeBiasDots(layout, data);
  }
}

/**
 * Computes average and OP sentiment, then overlays horizontal lines and labels.
 * Sentiment is normalized from [-1, 1] to [0, 1] for rendering purposes.
 *
 * @param {Object} layout - Plotly layout object
 * @param {Array} data - Reddit comment data
 */
function computeSentimentLines(layout, data) {
  const rawScores = data.map(d => d.sentiment ?? 0);
  const normScores = rawScores.map(s => (s + 1) / 2);
  const avgScore = normScores.reduce((a, b) => a + b, 0) / normScores.length;

  const opComment = data.find(d => d.parent_id === "");
  const opRaw = opComment ? opComment.sentiment ?? 0 : 0;
  const opScore = (opRaw + 1) / 2;

  const xPosition = 0.5;

  layout.shapes = [
    {
      type: "line",
      x0: 0, x1: 0.58,
      y0: avgScore, y1: avgScore,
      xref: "paper", yref: "paper",
      line: { color: "pink", width: 2 },
      layer: "above"
    },
    {
      type: "line",
      x0: 0, x1: 0.58,
      y0: opScore, y1: opScore,
      xref: "paper", yref: "paper",
      line: { color: "cyan", width: 2 },
      layer: "above"
    }
  ];

  layout.annotations.push(
    {
      x: xPosition,
      y: avgScore,
      text: `Avg`,
      showarrow: false,
      xref: "paper", yref: "paper",
      font: { size: 11, color: "pink" },
      xanchor: "left",
      layer: "above"
    },
    {
      x: xPosition,
      y: opScore,
      text: `OP`,
      showarrow: false,
      xref: "paper", yref: "paper",
      font: { size: 11, color: "cyan" },
      xanchor: "left",
      layer: "above"
    }
  );
}

function squashToCenter(value, strength = 0.5) {
  // Compresses value toward 0.5. Range-preserving.
  return 0.5 + (value - 0.5) * strength;
}





/**
 * Aggregates average bias per label and overlays labeled dots at each score level.
 * Assumes `row.bias` is a dictionary of label: probability values.
 *
 * @param {Object} layout - Plotly layout object
 * @param {Array} data - Reddit comment data
 */
function computeBiasDots(layout, data) {
  const labelTotals = {};
  let count = 0;

  for (let row of data) {
    const bias = row.bias;
    if (bias && typeof bias === "object") {
      for (const [label, value] of Object.entries(bias)) {
        labelTotals[label] = (labelTotals[label] || 0) + value;
      }
      count += 1;
    }
  }

  const labelAverages = {};
  for (const [label, total] of Object.entries(labelTotals)) {
    labelAverages[label] = total / count;
  }

  const sortedLabels = Object.keys(labelAverages).sort((a, b) => labelAverages[b] - labelAverages[a]);

  layout.shapes = [];

  for (const label of sortedLabels) {
    const original = labelAverages[label];
    const squashed = squashToCenter(original);

    layout.shapes.push({
      type: "circle",
      xref: "x", yref: "y",
      x0: 0.0, x1: 0.05,
      y0: squashed - 0.005, y1: squashed + 0.005,
      fillcolor: "red",
      line: { width: 0 },
      layer: "above"
    });

    layout.annotations.push({
      x: 0.52,
      y: squashed,
      text: label,
      showarrow: false,
      xref: "x", yref: "y",
      font: { size: 10, color: "purple" },
      xanchor: "left",
      layer: "above"
    });

  }
}




/**
 * Renders a bar chart showing the number of comments per OC bin,
 * along with author information, average sentiment, and scores.
 *
 * @param {Object[]} data - Flattened Reddit comment data with sentiment
 */
function renderBarChart(data) {
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
function renderSunburstChart(data) {
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

/**
 * Normalizes Reddit-style parent IDs (e.g. t1_xxxx) to raw comment IDs.
 * Adds a `parent` field to each comment row for use in Plotly sunburst.
 *
 * @param {Object[]} data - Reddit comments
 */
function normalizeParentIds(data) {
  data.forEach(row => {
    row.parent = row.parent_id?.replace(/^t[13]_/, "") || "";
  });
}

/**
 * Filters comment data to ensure valid parent-child hierarchy.
 * Only includes comments whose parents are also in the dataset.
 *
 * @param {Object[]} data - Reddit comments
 * @returns {Object[]} - Filtered comments with valid ancestry
 */
function filterValidHierarchy(data) {
  const validIds = new Set(data.map(r => r.id));
  return data.filter(r => r.parent === "" || validIds.has(r.parent));
}


