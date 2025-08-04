// ==== DOM REFERENCES ====
const barContainer = document.getElementById("graph-container");
const sunburstContainer = document.getElementById("sunburst-container");
const legendContainer = document.getElementById("legend-container");
const toggleButton = document.getElementById("expand-window");
const advancedVisuals = document.querySelector(".advanced-visuals");
const legendHeader = document.getElementById("legend-header");

// ==== STATE ====
const isInPopupWindow = window.outerWidth >= 800 && window.outerHeight >= 600;

// ==== INITIALIZATION ====
function setupUIBasedOnContext() {
  if (isInPopupWindow) {
    toggleButton.style.display = "none";
    advancedVisuals.style.display = "block";
    legendContainer.style.display = 'none';
    legendHeader.style.display = 'none';
  } else {
    advancedVisuals.style.display = "none";
    toggleButton.addEventListener("click", openInLargerWindow);
  }
}

function openInLargerWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 800,
    height: 600
  });
}

// ==== MAIN ====
document.addEventListener("DOMContentLoaded", () => {
  setupUIBasedOnContext();
});



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
      }
      if (!isInPopupWindow) {
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
    z: Array.from({ length: 101 }, (_, i) => [i / 100]), // vertical orientation
    x: [0],
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
 * Renders a vertical bias scale legend using a percentile-based approach.
 * The 90th percentile of bias values appears at 80% of the chart height,
 * preventing extreme values from dominating the scale.
 *
 * @param {Array} data - Optional comment data array.
 */
function renderBiasLegend(data) {
  // === Step 1: Compute average bias per label ===
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

  // === Step 2: Calculate percentile-based scale ===
  const biasValues = Object.values(labelAverages).sort((a, b) => a - b);
  const maxBias = Math.max(...biasValues);
  
  // Calculate 90th percentile (or use max if we have fewer than 10 values)
  const percentileIndex = Math.floor(biasValues.length * 0.9);
  const percentile90 = biasValues.length > 5 ? biasValues[percentileIndex] : maxBias;
  
  // Set the scale so that 90th percentile appears at 80% of the chart height
  const CHART_POSITION_FOR_P90 = 0.65;
  const scaleMax = percentile90 / CHART_POSITION_FOR_P90;
  
  const minBias = 1e-4;
  const logMin = logBias(minBias);
  const logMax = logBias(scaleMax);

  // === Step 3: Determine dynamic color scale based on percentile90 ===
  const lowThreshold = 0.01;
  const mediumThreshold = 0.1; 
  const highThreshold = 0.5;
  
  function getDynamicColorScale(p90Value) {
    if (p90Value <= lowThreshold) {
      return [
        [0.0, "lightblue"],
        [1.0, "#87CEEB"] // slightly darker light blue
      ];
    } else if (p90Value <= mediumThreshold) {
      return [
        [0.0, "lightblue"],
        [0.7, "#E0F6FF"], // very light blue
        [0.85, "#FFE4B5"], // light peach
        [1.0, "#FFA07A"]  // light salmon
      ];
    } else if (p90Value <= highThreshold) {
      return [
        [0.0, "lightblue"],
        [0.5, "#E0F6FF"], // very light blue
        [0.7, "#FFE4B5"], // light peach
        [0.85, "#FFA07A"], // light salmon
        [1.0, "#FF6347"]  // tomato (light red)
      ];
    } else {
      return [
        [0.0, "lightblue"],
        [0.3, "#E0F6FF"], // very light blue
        [0.5, "#FFE4B5"], // light peach
        [0.7, "#FFA07A"], // light salmon
        [0.85, "#FF6347"], // tomato
        [1.0, "red"]
      ];
    }
  }

  // === Step 4: Build vertical heatmap ===
  const ySteps = 201;
  const y = Array.from({ length: ySteps }, (_, i) =>
    logMin + (i / (ySteps - 1)) * (logMax - logMin)
  );
  
  const zVals = y.map(logY => {
    const biasValue = Math.pow(10, logY) - 1e-4;
    // Normalize based on our calculated scale maximum
    const normalizedValue = Math.min(biasValue / scaleMax, 1);
    return [normalizedValue];
  });

  const gradientTrace = {
    type: "heatmap",
    z: zVals,
    x: [0],
    y: y,
    colorscale: getDynamicColorScale(percentile90),
    zmin: 0,
    zmax: 1,
    autocolorscale: false,
    showscale: false,
    hoverinfo: "none"
  };

  // === Step 5: Set up layout ===
  const layout = getLegendLayout([0, 1]);
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

  // Dynamic labels based on percentile90
  const highBiasColor = percentile90 <= lowThreshold ? "#4682B4" : 
                       percentile90 <= mediumThreshold ? "#FFA07A" : 
                       percentile90 <= highThreshold ? "#FF6347" : "red";
  
  const highBiasText = percentile90 <= lowThreshold ? "Low Range" :
                      percentile90 <= mediumThreshold ? "Med Range" :
                      "High Range";

  layout.annotations = [
    {
      x: 0.5,
      y: 1.07,
      xref: "paper",
      yref: "paper",
      text: highBiasText,
      showarrow: false,
      xanchor: "center",
      font: { size: 12, color: highBiasColor }
    },
    {
      x: 0.5,
      y: -0.07,
      xref: "paper",
      yref: "paper",
      text: "Min Bias",
      showarrow: false,
      xanchor: "center",
      font: { size: 12, color: "lightblue" }
    }
  ];

  // === Step 6: Add bias dots and labels ===
  for (const [label, avg] of Object.entries(labelAverages)) {
    const yPos = logBias(avg);

    layout.shapes.push({
      type: "circle",
      xref: "x domain",
      yref: "y",
      x0: 0.48,
      x1: 0.52,
      y0: yPos - 0.005,
      y1: yPos + 0.005,
      fillcolor: avg > scaleMax ? "orange" : "purple", // Highlight values above scale
      line: { width: 0 },
      layer: "above"
    });

    layout.annotations.push({
      x: 0.1,
      y: yPos - 0.04,
      text: label,
      showarrow: false,
      xref: "paper",
      yref: "y",
      font: { 
        size: 10, 
        color: avg > scaleMax ? "orange" : "purple" // Different color for out-of-range values
      },
      xanchor: "right",
      textangle: -45,
      layer: "above"
    });
  }

  layout.autosize = true;

  // === Step 7: Render plot ===
  Plotly.newPlot("bias-legend-container", [gradientTrace], layout, {
    responsive: true,
    displayModeBar: false,
    staticPlot: false
  });
}



function logBias(value) {
  return Math.log10(value + 1e-4); // avoid log(0)
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
      x0: 0, x1: 1,
      y0: avgScore, y1: avgScore,
      xref: "paper", yref: "paper",
      line: { color: "pink", width: 2 },
      layer: "above"
    },
    {
      type: "line",
      x0: 0, x1: 1,
      y0: opScore, y1: opScore,
      xref: "paper", yref: "paper",
      line: { color: "cyan", width: 2 },
      layer: "above"
    }
  ];

  layout.annotations.push(
    {
      x: xPosition + 0.5,
      y: avgScore,
      text: `Avg`,
      showarrow: false,
      xref: "paper", yref: "paper",
      font: { size: 11, color: "pink" },
      xanchor: "left",
      layer: "above"
    },
    {
      x: xPosition - .5,
      y: opScore + .035,
      text: `OP`,
      showarrow: false,
      xref: "paper", yref: "paper",
      font: { size: 11, color: "cyan" },
      xanchor: "right",
      layer: "above"
    }
  );
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

function getLegendLayout(yRange = [0, 1]) {
  return {
    xaxis: {
      visible: false,
      constrain: 'domain'
    },
    yaxis: {
      visible: false,
      range: yRange
    },
    margin: { t: 30, b: 30, l: 35, r: 40 },
    height: 300,
    width: 100,
    annotations: [],
    shapes: []
  };
}





