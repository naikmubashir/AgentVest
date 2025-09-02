/**
 * Utility functions for visualizing the graph and other components
 */

/**
 * Save the graph as a PNG file
 *
 * @param {Object} app - The compiled graph instance
 * @param {string} outputFilePath - The output file path
 */
export function saveGraphAsPng(app, outputFilePath) {
  const pngImage = app.getGraph().drawMermaidPng({
    drawMethod: "API",
  });

  const filePath =
    outputFilePath && outputFilePath.length > 0 ? outputFilePath : "graph.png";

  // In Node.js, we would use the fs module
  const fs = require("fs");
  fs.writeFileSync(filePath, pngImage);
}

/**
 * Generate a bar chart for portfolio allocations
 *
 * @param {Object} portfolio - The portfolio data
 * @param {Object} currentPrices - Current prices of tickers
 * @returns {string} HTML content for the chart
 */
export function generatePortfolioAllocationChart(portfolio, currentPrices) {
  let htmlContent = '<div class="chart-container">';
  htmlContent += "<h2>Portfolio Allocations</h2>";

  // Calculate position values
  const positionValues = {};
  let totalValue = portfolio.cash || 0;

  // Calculate position values and total portfolio value
  for (const [ticker, position] of Object.entries(portfolio.positions || {})) {
    if (currentPrices[ticker]) {
      const longValue = (position.long || 0) * currentPrices[ticker];
      const shortValue = (position.short || 0) * currentPrices[ticker];
      const netValue = longValue - shortValue;

      positionValues[ticker] = netValue;
      totalValue += longValue; // Add long positions to total value
    }
  }

  // Add cash as a position
  positionValues["Cash"] = portfolio.cash || 0;

  // Generate bars with percentages
  htmlContent += '<div class="allocation-chart">';
  for (const [ticker, value] of Object.entries(positionValues)) {
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
    const absPercentage = Math.abs(percentage);

    // Skip very small allocations for display clarity
    if (absPercentage < 0.5) continue;

    const barColor = value >= 0 ? "#4CAF50" : "#F44336";

    htmlContent += `
      <div class="allocation-item">
        <div class="ticker">${ticker}</div>
        <div class="bar-container">
          <div class="bar" style="width: ${absPercentage}%; background-color: ${barColor};"></div>
        </div>
        <div class="percentage">${percentage.toFixed(1)}%</div>
        <div class="value">$${Math.abs(value).toFixed(2)}</div>
      </div>
    `;
  }
  htmlContent += "</div></div>";

  // Add CSS styles
  htmlContent += `
    <style>
      .chart-container {
        font-family: Arial, sans-serif;
        max-width: 800px;
        margin: 20px auto;
      }
      .allocation-chart {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .allocation-item {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .ticker {
        width: 80px;
        font-weight: bold;
      }
      .bar-container {
        flex-grow: 1;
        background-color: #f1f1f1;
        height: 20px;
      }
      .bar {
        height: 100%;
      }
      .percentage {
        width: 60px;
        text-align: right;
      }
      .value {
        width: 100px;
        text-align: right;
      }
    </style>
  `;

  return htmlContent;
}

/**
 * Generate a pie chart for agent consensus
 *
 * @param {Object} agentSignals - The agent signals
 * @returns {string} HTML content for the chart
 */
export function generateAgentConsensusChart(agentSignals) {
  // Aggregate signals by sentiment
  const sentimentCounts = {
    bullish: 0,
    neutral: 0,
    bearish: 0,
  };

  // Count signals by sentiment
  let totalSignals = 0;
  for (const [agentId, signals] of Object.entries(agentSignals)) {
    // Skip risk management agents
    if (agentId.startsWith("risk_management_agent")) continue;

    for (const [, signal] of Object.entries(signals)) {
      sentimentCounts[signal.signal] =
        (sentimentCounts[signal.signal] || 0) + 1;
      totalSignals++;
    }
  }

  // No signals to display
  if (totalSignals === 0) return "<div>No agent signals available</div>";

  // Calculate percentages
  const percentages = {
    bullish: (sentimentCounts.bullish / totalSignals) * 100,
    neutral: (sentimentCounts.neutral / totalSignals) * 100,
    bearish: (sentimentCounts.bearish / totalSignals) * 100,
  };

  // Generate HTML for the pie chart
  let htmlContent = '<div class="consensus-container">';
  htmlContent += "<h2>Agent Consensus</h2>";

  // Generate the pie chart
  htmlContent += `
    <div class="pie-chart-container">
      <div class="pie-chart" style="background: conic-gradient(
        #4CAF50 0% ${percentages.bullish}%, 
        #FFC107 ${percentages.bullish}% ${
    percentages.bullish + percentages.neutral
  }%, 
        #F44336 ${percentages.bullish + percentages.neutral}% 100%
      );"></div>
      <div class="legend">
        <div class="legend-item">
          <span class="color-box" style="background-color: #4CAF50;"></span>
          <span>Bullish: ${percentages.bullish.toFixed(1)}% (${
    sentimentCounts.bullish
  })</span>
        </div>
        <div class="legend-item">
          <span class="color-box" style="background-color: #FFC107;"></span>
          <span>Neutral: ${percentages.neutral.toFixed(1)}% (${
    sentimentCounts.neutral
  })</span>
        </div>
        <div class="legend-item">
          <span class="color-box" style="background-color: #F44336;"></span>
          <span>Bearish: ${percentages.bearish.toFixed(1)}% (${
    sentimentCounts.bearish
  })</span>
        </div>
      </div>
    </div>
  `;

  htmlContent += "</div>";

  // Add CSS styles
  htmlContent += `
    <style>
      .consensus-container {
        font-family: Arial, sans-serif;
        max-width: 800px;
        margin: 20px auto;
      }
      .pie-chart-container {
        display: flex;
        align-items: center;
        gap: 20px;
      }
      .pie-chart {
        width: 150px;
        height: 150px;
        border-radius: 50%;
      }
      .legend {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .color-box {
        width: 15px;
        height: 15px;
      }
    </style>
  `;

  return htmlContent;
}
