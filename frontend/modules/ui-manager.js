// modules/ui-manager.js - Handles UI state and interactions
export class UIManager {
  constructor() {
    this.elements = {
      barContainer: document.getElementById("graph-container"),
      sunburstContainer: document.getElementById("sunburst-container"), 
      legendContainer: document.getElementById("legend-container"),
      biasLegendContainer: document.getElementById("bias-legend-container"),
      toggleButton: document.getElementById("expand-window"),
      advancedVisuals: document.querySelector(".advanced-visuals"),
      legendHeader: document.getElementById("legend-header"),
      legendStatus: document.getElementById("legend-status"),
      barLoading: document.getElementById("bar-loading"),
      sunburstLoading: document.getElementById("sunburst-loading")
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
    this.elements.biasLegendContainer.style.display = 'none';
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

  // NEW METHODS FOR PARALLEL LOADING SUPPORT

  showLoadingState() {
    /**
     * Initialize loading state for parallel processing
     */
    if (this.elements.legendStatus) {
      this.elements.legendStatus.textContent = "Starting analysis...";
      this.elements.legendStatus.className = "loading-text";
    }

    // Show individual loading indicators
    if (this.elements.barLoading) {
      this.elements.barLoading.textContent = "Loading sentiment data...";
      this.elements.barLoading.style.display = "block";
    }

    if (this.elements.sunburstLoading) {
      this.elements.sunburstLoading.textContent = "Preparing hierarchy...";
      this.elements.sunburstLoading.style.display = "block";
    }
  }

  updateLoadingStatus(message) {
    /**
     * Update the main status message during parallel processing
     */
    if (this.elements.legendStatus) {
      this.elements.legendStatus.textContent = message;
    }
  }

  hideLoadingIndicators() {
    /**
     * Hide all loading indicators when processing is complete
     */
    if (this.elements.legendStatus) {
      this.elements.legendStatus.textContent = "";
    }

    if (this.elements.barLoading) {
      this.elements.barLoading.style.display = "none";
    }

    if (this.elements.sunburstLoading) {
      this.elements.sunburstLoading.style.display = "none";
    }
  }

  hideChartLoading(chartType) {
    /**
     * Hide loading indicator for specific chart type
     * @param {string} chartType - 'bar', 'sunburst', 'legend', or 'bias'
     */
    switch(chartType) {
      case 'bar':
        if (this.elements.barLoading) {
          this.elements.barLoading.style.display = "none";
        }
        break;
      case 'sunburst':
        if (this.elements.sunburstLoading) {
          this.elements.sunburstLoading.style.display = "none";
        }
        break;
      case 'sentiment':
        // Update status to show sentiment is ready
        this.updateLoadingStatus("Sentiment complete! Loading bias analysis...");
        break;
      case 'bias':
        // Update status to show bias is ready
        this.updateLoadingStatus("All analysis complete!");
        break;
    }
  }

  showChartProgress(chartType, message) {
    /**
     * Show progress message for specific chart
     * @param {string} chartType - 'bar', 'sunburst', etc.
     * @param {string} message - Progress message to display
     */
    switch(chartType) {
      case 'bar':
        if (this.elements.barLoading) {
          this.elements.barLoading.textContent = message;
        }
        break;
      case 'sunburst':
        if (this.elements.sunburstLoading) {
          this.elements.sunburstLoading.textContent = message;
        }
        break;
    }
  }

  // EXISTING METHODS (unchanged)

  showInvalidThreadMessage() {
    this.clearContainers();
    
    // Clear loading text
    if (this.elements.legendStatus) {
      this.elements.legendStatus.textContent = "";
    }
    
    // Show message in the legend wrapper (spans both containers)
    const legendWrapper = document.getElementById("legend-wrapper");
    if (legendWrapper) {
      legendWrapper.innerHTML = `
        <div style="text-align: center; padding: 1em; width: 100%;">
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
  }

  showError(message) {
    // Clear loading text
    if (this.elements.legendStatus) {
      this.elements.legendStatus.textContent = "";
    }
    
    this.elements.barContainer.textContent = `Error loading data: ${message}`;
    this.elements.sunburstContainer.textContent = `Error loading sunburst: ${message}`;
  }

  clearContainers() {
    this.elements.barContainer.innerHTML = "";
    this.elements.sunburstContainer.innerHTML = "";
  }
}