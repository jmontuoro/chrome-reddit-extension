// modules/ui-manager.js - Handles UI state and interactions
export class UIManager {
  constructor() {
    this.elements = {
      barContainer: document.getElementById("graph-container"),
      sunburstContainer: document.getElementById("sunburst-container"), 
      legendContainer: document.getElementById("legend-container"),
      toggleButton: document.getElementById("expand-window"),
      advancedVisuals: document.querySelector(".advanced-visuals"),
      legendHeader: document.getElementById("legend-header")
    };
    
    this.isInPopupWindow = window.outerWidth >= 800 && window.outerHeight >= 600;
  }

  setupUI() {
    if (this.isInPopupWindow) {
      this.setupPopupWindow();
    } else {
      this.setupExtensionPopup();
    }
  }

  setupPopupWindow() {
    this.elements.toggleButton.style.display = "none";
    this.elements.advancedVisuals.style.display = "block";
    this.elements.legendContainer.style.display = 'none';
    this.elements.legendHeader.style.display = 'none';
  }

  setupExtensionPopup() {
    this.elements.advancedVisuals.style.display = "none";
    this.elements.toggleButton.addEventListener("click", this.openInLargerWindow);
  }

  openInLargerWindow() {
    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      width: 800,
      height: 600
    });
  }

  showInvalidThreadMessage() {
    this.clearContainers();
    this.elements.legendContainer.innerHTML = `
      <div style="text-align: center; padding: 1em;">
        <img src="images/comment-icon.png" alt="comment icon" 
             style="width: 80px; opacity: 1; margin-bottom: 10px;" />
        <p style="font-size: 14px; color: gray; line-height: 1.4;">
          This is not a Reddit thread page.<br>
          Navigate to a post and click its <strong>comments</strong> button,<br>
          then reopen the extension.
        </p>
      </div>
    `;
  }

  showError(message) {
    this.elements.barContainer.textContent = `Error loading data: ${message}`;
    this.elements.sunburstContainer.textContent = `Error loading sunburst: ${message}`;
  }

  clearContainers() {
    this.elements.barContainer.innerHTML = "";
    this.elements.sunburstContainer.innerHTML = "";
  }
}