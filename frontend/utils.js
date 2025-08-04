export function logBias(value) {
  return Math.log10(value + 1e-4); // avoid log(0)
}

export function rescaleLogBias(value) {
  const logMin = logBias(1e-4);  // ~ -4
  const logMax = logBias(1);    // = 0
  return (logBias(value) - logMin) / (logMax - logMin);  // maps to [0, 1]
}

/**
 * Computes average and OP sentiment, then overlays horizontal lines and labels.
 * Sentiment is normalized from [-1, 1] to [0, 1] for rendering purposes.
 *
 * @param {Object} layout - Plotly layout object
 * @param {Array} data - Reddit comment data
 */
export function computeSentimentLines(layout, data) {
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
 * Aggregates average bias per label and overlays labeled dots at each score level.
 * Assumes `row.bias` is a dictionary of label: probability values.
 *
 * @param {Object} layout - Plotly layout object
 * @param {Array} data - Reddit comment data
 */
export function computeBiasDots(layout, data) {
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
    if (label.toLowerCase() === "none") continue;
    const original = labelAverages[label];
    const normalized = rescaleLogBias(original);



    layout.shapes.push({
      type: "circle",
      xref: "x domain", yref: "y",
      x0: .48, x1: .52,
      y0: normalized - 0.005, y1: normalized + 0.005,
      fillcolor: "red",
      line: { width: 0 },
      layer: "above"
    });

    layout.annotations.push({
      x: 0,
      y: normalized,
      text: label,
      showarrow: false,
      xref: "paper",
      yref: "y",
      font: { size: 10, color: "purple" },
      xanchor: "right",
      layer: "above"
    });
  }

}



/**
 * Filters comment data to ensure valid parent-child hierarchy.
 * Only includes comments whose parents are also in the dataset.
 *
 * @param {Object[]} data - Reddit comments
 * @returns {Object[]} - Filtered comments with valid ancestry
 */
export function filterValidHierarchy(data) {
  const validIds = new Set(data.map(r => r.id));
  return data.filter(r => r.parent === "" || validIds.has(r.parent));
}

/**
 * Normalizes Reddit-style parent IDs (e.g. t1_xxxx) to raw comment IDs.
 * Adds a `parent` field to each comment row for use in Plotly sunburst.
 *
 * @param {Object[]} data - Reddit comments
 */
export function normalizeParentIds(data) {
  data.forEach(row => {
    row.parent = row.parent_id?.replace(/^t[13]_/, "") || "";
  });
}