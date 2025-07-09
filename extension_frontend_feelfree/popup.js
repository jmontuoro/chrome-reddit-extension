// popup.js

const barContainer = document.getElementById("graph-container");
const sunburstContainer = document.getElementById("sunburst-container");

barContainer.textContent = "Loading sentiment data...";
sunburstContainer.textContent = "Preparing sunburst...";

// Step 1: Retrieve Reddit thread URL from chrome storage
chrome.storage.local.get("reddit_url", (result) => {
  const url = result.reddit_url;
  if (!url) {
    barContainer.textContent = "No Reddit thread URL found.";
    return;
  }

  console.log("📦 Using Reddit URL:", url);

  // Step 2: Fetch parsed data from backend
  fetch("https://reddit-extension-backend-541360204677.us-central1.run.app/receive_url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  })
    .then(res => res.json())
    .then(result => {
      if (result.status !== "success") throw new Error(result.message);
      const data = result.data;

      // ---------- BAR CHART ----------
      const summary = {};
      for (let row of data) {
        const bin = row.oc_bin_id || "Unbinned";
        const label = row.sentiment_label;
        if (!summary[bin]) summary[bin] = { positive: 0, neutral: 0, negative: 0 };
        summary[bin][label] = (summary[bin][label] || 0) + 1;
      }

      const bins = Object.keys(summary);
      const sentiments = ["positive", "neutral", "negative"];
      const barData = sentiments.map(sentiment => ({
        x: bins,
        y: bins.map(bin => summary[bin][sentiment] || 0),
        name: sentiment,
        type: "bar"
      }));

      Plotly.newPlot(barContainer, barData, {
        barmode: "stack",
        title: "Sentiment Distribution by Bin",
        xaxis: { title: "Bin ID" },
        yaxis: { title: "Comment Count" },
        height: 400
      });

      // ---------- SUNBURST CHART ----------

      // Title (used in root node too)
      const root = data.find(row => row.level === 0);
      const shortTitle = root?.body?.length > 100 ? root.body.slice(0, 97) + "..." : root?.body || "Reddit Thread";

      // Create and prepend synthetic root node
      const syntheticRoot = {
        id: "ROOT",
        label: "Reddit Thread",
        parent: "",
        author: "OP",
        score: 1,
        body: shortTitle,
        sentiment: 0,
        sentiment_label: "neutral"
      };

      data.unshift(syntheticRoot);

      // Recompute ids AFTER prepending
      const ids = new Set(data.map(row => row.id));

      // Fix invalid or missing data
      data.forEach(row => {
        // Ensure ID and label
        if (!row.id) row.id = crypto.randomUUID();
        row.label = row.id;

        // Ensure valid numeric score ≥ 1
        const parsedScore = Number(row.score);
        row.score = isNaN(parsedScore) ? 1 : Math.max(1, parsedScore);

        // Clean parent ID
        const rawParent = row.parent_id ? row.parent_id.replace(/^t[13]_/, "") : (row.parent || "");
        row.parent = ids.has(rawParent) ? rawParent : "ROOT";
      });


      // Plot sunburst
      Plotly.newPlot(sunburstContainer, [{
        type: "sunburst",
        ids: data.map(r => r.label),
        labels: data.map(r => r.author),
        parents: data.map(r => r.parent),
        values: data.map(r => r.score),
        hovertext: data.map(r =>
          `${r.author}<br><b>${r.sentiment_label}</b><br>${r.body?.slice(0, 100) || ""}...`
        ),
        hoverinfo: "text",
        marker: {
          colors: data.map(r => r.sentiment),
          colorscale: "RdYlGn",
          colorbar: { title: "Sentiment" }
        }
      }], {
        title: {
          text: shortTitle,
          x: 0.5,
          xanchor: "center",
          font: { size: 14 }
        },
        margin: { t: 40, l: 5, r: 5, b: 5 },
        uniformtext: { minsize: 10, mode: "hide" },
        height: 500
      });

    })
    .catch(err => {
      barContainer.textContent = "Error: " + err.message;
      sunburstContainer.textContent = "";
      console.error(err);
    });
});
