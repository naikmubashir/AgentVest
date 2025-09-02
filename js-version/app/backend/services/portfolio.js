import { getAnalystNodes } from "../../src/utils/analysts.js";

/**
 * Creates a portfolio object with the specified parameters
 *
 * @param {number} initialCash - The initial cash amount
 * @param {number} marginRequirement - The margin requirement percentage
 * @param {Array<string>} tickers - List of stock tickers
 * @param {Object} portfolioPositions - Current portfolio positions (if any)
 * @returns {Object} Portfolio object
 */
export function createPortfolio(
  initialCash,
  marginRequirement,
  tickers,
  portfolioPositions = {}
) {
  return {
    cash: initialCash || 1000000,
    margin_requirement: marginRequirement || 0.5,
    positions: portfolioPositions || {},
    tickers: tickers || [],
  };
}

/**
 * Creates a trade recommendation based on portfolio and analysis
 *
 * @param {Object} portfolio - The current portfolio state
 * @param {Array<string>} tickers - List of stock tickers
 * @param {Object} analystSignals - Signals from different analysts
 * @param {Object} currentPrices - Current market prices
 * @returns {Object} Trade recommendations
 */
export function createTradeRecommendation(
  portfolio,
  tickers,
  analystSignals,
  currentPrices
) {
  const recommendations = {};

  for (const ticker of tickers) {
    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;
    let totalConfidence = 0;
    let totalAnalysts = 0;

    // Tally signals from all analysts
    for (const [analystId, analysis] of Object.entries(analystSignals)) {
      if (analysis[ticker]) {
        const signal = analysis[ticker].signal;
        const confidence = analysis[ticker].confidence || 50;

        if (signal === "bullish") {
          bullishCount++;
        } else if (signal === "bearish") {
          bearishCount++;
        } else {
          neutralCount++;
        }

        totalConfidence += confidence;
        totalAnalysts++;
      }
    }

    // Calculate average confidence
    const averageConfidence =
      totalAnalysts > 0 ? Math.round(totalConfidence / totalAnalysts) : 0;

    // Determine overall signal based on majority
    let overallSignal = "neutral";
    if (bullishCount > bearishCount && bullishCount > neutralCount) {
      overallSignal = "bullish";
    } else if (bearishCount > bullishCount && bearishCount > neutralCount) {
      overallSignal = "bearish";
    }

    // Generate trade recommendation
    let recommendation = "hold";
    let allocationPercentage = 0;

    if (overallSignal === "bullish" && averageConfidence > 60) {
      recommendation = "buy";
      allocationPercentage = Math.min(10 + (averageConfidence - 60), 25);
    } else if (overallSignal === "bearish" && averageConfidence > 60) {
      recommendation = "sell";
      allocationPercentage = 0;
    }

    recommendations[ticker] = {
      signal: overallSignal,
      confidence: averageConfidence,
      recommendation,
      allocation_percentage: allocationPercentage,
      current_price: currentPrices[ticker] || 0,
    };
  }

  return recommendations;
}
