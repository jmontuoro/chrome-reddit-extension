const barContainer = document.getElementById("graph-container");
const sunburstContainer = document.getElementById("sunburst-container");
const legendContainer = document.getElementById("legend-container");

// Render shared sentiment scale bar first
//renderSentimentLegend();

// Entry point: get Reddit URL and trigger visualization
chrome.storage.local.get("reddit_url", (result) => {
  const url = result.reddit_url;
  if (!url) {
    barContainer.textContent = "No Reddit thread URL found.";
    return;
  }

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

// Draw horizontal sentiment scale
// future idea: plot relevant sentiment scores on the sentiment scale: pink vertical line for total post sentiment, cyan line for the head thread's sentiment 
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

  renderInsights(layout, data); //expand here
  // Clear previous content and render new legend
  legendContainer.innerHTML = "";
  Plotly.newPlot("legend-container", [gradientTrace], layout, {
    displayModeBar: false,
    staticPlot: true //disables dragging, zooming
  });
}

// Fetch parsed comment data from backend
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




// Build and render bar chart from sentiment summary
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





// Build and render sunburst chart with hierarchical sentiment
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

function normalizeParentIds(data) {
  data.forEach(row => {
    row.parent = row.parent_id?.replace(/^t[13]_/, "") || "";
  });
}

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
