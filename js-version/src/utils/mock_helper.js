/**
 * Creates a safe mock response object that doesn't rely on potentially undefined properties
 * @param {Object} analysis - The analysis object with signal and score
 * @param {string} ticker - The ticker symbol
 * @param {string} agentName - The name of the agent
 * @returns {Object} A safe mock response with signal, confidence, and reasoning
 */
export function createSafeMockResponse(analysis, ticker, agentName) {
  return {
    signal: analysis?.signal || "neutral",
    confidence: Math.round((analysis?.score || 5) * 10), // Convert 0-10 score to 0-100 confidence
    reasoning: `Based on ${agentName}'s principles, ${ticker} shows ${
      analysis?.signal || "neutral"
    } indicators.`,
  };
}
