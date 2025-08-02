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
  toggleButton.style.display = "none";
  advancedVisuals.style.display = "block";
  legendContainer.style.display = 'none';
  document.getElementById("legend-header").style.display = 'none';
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
      const avgBiasByLabel = calculateAverageBias(data);
      if (!isInPopupWindow) {
        renderSentimentLegend(data);
        renderBiasLegend(avgBiasByLabel);
      }
      if (isInPopupWindow) {
        renderBarChart(data);
        renderSunburstChart(data);
        renderBiasBarChart(avgBiasByLabel);
      }
    })
    .catch(err => {
      barContainer.textContent = `Error loading data: ${err.message}`;
      sunburstContainer.textContent = `Error loading sunburst: ${err.message}`;
      console.error("Error:", err);
    });
});

function calculateAverageBias(data) {
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
    labelAverages[label] = +(total / count).toFixed(3);
  }
  return labelAverages;
}

function renderBiasBarChart(summaryBiasScores) {
  const labels = Object.keys(summaryBiasScores);
  const values = Object.values(summaryBiasScores);

  Plotly.newPlot('bias-bar-container', [{
    type: 'bar',
    x: values,
    y: labels,
    orientation: 'h'
  }], {
    title: 'Average Bias Scores (Post-Level)',
    margin: { l: 80 }
  });
}