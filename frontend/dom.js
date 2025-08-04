export const barContainer = document.getElementById("graph-container");
export const sunburstContainer = document.getElementById("sunburst-container");
export const legendContainer = document.getElementById("legend-container");
export const toggleButton = document.getElementById("expand-window");
export const advancedVisuals = document.querySelector(".advanced-visuals");
export const legendHeader = document.getElementById("legend-header");
export const isInPopupWindow = window.outerWidth >= 800 && window.outerHeight >= 600;

// ==== INITIALIZATION ====
export function setupUIBasedOnContext() {
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

export function openInLargerWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 800,
    height: 600
  });
}
