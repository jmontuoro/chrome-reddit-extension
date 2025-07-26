// DOM containers for rendering
const barContainer = document.getElementById("graph-container");
const sunburstContainer = document.getElementById("sunburst-container");
const legendContainer = document.getElementById("legend-container");

/**
 * Main entry point: retrieves stored Reddit thread URL,
 * validates it's a Reddit post page, and triggers data fetching
 * and rendering of sentiment visualizations.
 */
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
    // Clear all containers
    barContainer.innerHTML = "";
    sunburstContainer.innerHTML = "";
    legendContainer.innerHTML = "";

    // Display fallback instructions
    barContainer.innerHTML = `
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

  // If Reddit thread is valid, fetch and render
  fetchSentimentData(url)
    .then(data => {
      renderSentimentLegend(data);
      renderBarChart(data);
      renderSunburstChart(data);
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
    z: [Array.from({ length: 201 }, (_, i) => -1 + i * 0.01)],
    colorscale: [
      [0.0, "red"],
      [0.5, "yellow"],
      [1.0, "green"]
    ],
    showscale: false,  // Hide default colorbar
    hoverinfo: "none"
  };

  const annotations = [
    { x: 0.03, y: -.35, text: "Negative", showarrow: false, xref: "paper", yref: "paper", font: { size: 12 } },
    { x: 0.5, y: -.35, text: "Neutral", showarrow: false, xref: "paper", yref: "paper", font: { size: 12 } },
    { x: 0.97, y: -.35, text: "Positive", showarrow: false, xref: "paper", yref: "paper", font: { size: 12 } }
  ];

  const layout = {
    xaxis: { visible: false },
    yaxis: { visible: false },
    margin: { t: 10, b: 40, l: 20, r: 20 },
    height: 100,
    annotations
  };

  renderInsights(layout, data); //Adds key insights (e.g. avg sentiment markers)
  // Clear previous content and render new legend
  legendContainer.innerHTML = "";
  Plotly.newPlot("legend-container", [gradientTrace], layout, {
    displayModeBar: false,
    staticPlot: true //disables dragging, zooming
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
 * Adds vertical marker lines and annotations to the sentiment legend
 * to indicate average sentiment and OP sentiment values.
 *
 * @param {Object} layout - Plotly layout object to mutate
 * @param {Object[]} data - Array of Reddit comments with sentiment scores
 */
function renderInsights(layout, data) {
  if (!data || data.length === 0) return;

  const sentiments = data.map(d => d.sentiment || 0);
  const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;

  const opComment = data.find(d => d.parent_id === "");
  const opSentiment = opComment ? opComment.sentiment || 0 : 0;

  const xAvg = (avgSentiment + 1) / 2;
  const xOp = (opSentiment + 1) / 2;

  layout.shapes = [
    {
      type: "line",
      x0: xAvg, x1: xAvg,
      y0: 0, y1: 1,
      xref: "paper", yref: "paper",
      line: { color: "pink", width: 2 }
    },
    {
      type: "line",
      x0: xOp, x1: xOp,
      y0: 0, y1: 1,
      xref: "paper", yref: "paper",
      line: { color: "cyan", width: 2 }
    }
  ];

  layout.annotations.push(
    {
      x: xAvg - 0.015,
      y: 1.05,
      text: `Avg Sent.`,
      showarrow: false,
      xref: "paper",
      yref: "paper",
      textangle: -90,
      font: { size: 11, color: "pink" }
    },
    {
      x: xOp + 0.015,
      y: 1.05,
      text: `OP Sent.`,
      showarrow: false,
      xref: "paper",
      yref: "paper",
      textangle: -90,
      font: { size: 11, color: "cyan" }
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

document.getElementById("expand-window").addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 800,
    height: 700,
    top: 150,
    left: 200
  });
});
