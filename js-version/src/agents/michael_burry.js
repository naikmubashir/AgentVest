import { z } from "zod";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  searchLineItems,
  getInsiderTrades,
  getTechnicalIndicators,
} from "../tools/api.js";
import { callLLM } from "../utils/llm.js";
import { progress } from "../utils/progress.js";
import { getApiKeyFromState } from "../utils/api_key.js";

// Define the schema for Michael Burry's analysis signal
const MichaelBurrySignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Michael Burry's contrarian approach
 * Focuses on identifying overlooked value, market bubbles, and asymmetric opportunities
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Michael Burry's analysis
 */
export async function michaelBurryAgent(
  state,
  agentId = "michael_burry_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const burryAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Fetching financial metrics");
    const metrics = await getFinancialMetrics(
      ticker,
      endDate,
      "annual",
      5,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Getting market cap");
    const marketCap = await getMarketCap(ticker, endDate, apiKey);

    progress.updateStatus(agentId, ticker, "Gathering financial line items");
    const financialLineItems = await searchLineItems(
      ticker,
      [
        "revenue",
        "net_income",
        "total_assets",
        "total_liabilities",
        "cash_and_equivalents",
        "total_debt",
        "inventory",
        "accounts_receivable",
        "capital_expenditure",
        "free_cash_flow",
      ],
      endDate,
      5,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Fetching insider trading data");
    const insiderTrades = await getInsiderTrades(ticker, endDate, 10, apiKey);

    progress.updateStatus(agentId, ticker, "Getting technical indicators");
    const technicalData = await getTechnicalIndicators(
      ticker,
      endDate,
      90,
      apiKey
    );

    progress.updateStatus(
      agentId,
      ticker,
      "Analyzing fundamental red flags and hidden value"
    );
    const fundamentalAnalysis = analyzeFundamentals(
      metrics,
      financialLineItems,
      marketCap
    );

    progress.updateStatus(
      agentId,
      ticker,
      "Analyzing market sentiment and positioning"
    );
    const sentimentAnalysis = analyzeSentimentAndPositioning(
      insiderTrades,
      technicalData
    );

    progress.updateStatus(agentId, ticker, "Assessing contrarian opportunity");
    const contrarianAnalysis = assessContrarianOpportunity(
      fundamentalAnalysis,
      sentimentAnalysis,
      technicalData
    );

    // Combine analyses to determine preliminary signal
    // For Burry, we weight fundamentals higher than sentiment/technicals
    const combinedScore =
      fundamentalAnalysis.score * 0.6 +
      sentimentAnalysis.score * 0.2 +
      contrarianAnalysis.score * 0.2;

    // Scale 0-1
    const normalizedScore = combinedScore / 5;

    // Burry is naturally skeptical, so we bias slightly toward bearish
    let signal = "neutral";
    let confidence = 0.5;

    if (normalizedScore > 0.7) {
      signal = "bullish";
      confidence = 0.6 + (normalizedScore - 0.7) * 0.75; // 0.6 to 0.9
    } else if (normalizedScore < 0.4) {
      // Note the asymmetry here (0.4 not 0.3)
      signal = "bearish";
      confidence = 0.6 + (0.4 - normalizedScore) * 0.75; // 0.6 to 0.9
    } else {
      // Neutral zone - confidence increases as it moves away from 0.5
      confidence = 0.5 + Math.abs(normalizedScore - 0.5) * 0.2;
    }

    // Store analysis data for LLM reasoning
    analysisData[ticker] = {
      metrics,
      financialLineItems,
      marketCap,
      insiderTrades,
      technicalData,
      fundamentalAnalysis,
      sentimentAnalysis,
      contrarianAnalysis,
      combinedScore,
      normalizedScore,
      preliminarySignal: signal,
      preliminaryConfidence: confidence,
    };

    progress.updateStatus(agentId, ticker, "Generating Michael Burry analysis");
    const burryOutput = await generateBurryOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    burryAnalysis[ticker] = {
      signal: burryOutput.signal,
      confidence: burryOutput.confidence,
      reasoning: burryOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: burryOutput.reasoning,
    });
  }

  // Show reasoning if requested
  if (state.metadata && state.metadata.show_reasoning) {
    showAgentReasoning(burryAnalysis, "Michael Burry Agent");
  }

  // Add signals to the overall state
  state.data.analyst_signals[agentId] = burryAnalysis;

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(burryAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Analyze fundamentals for red flags and hidden value
 *
 * @param {Array} metrics - Financial metrics
 * @param {Array} financialLineItems - Financial line items
 * @param {Object} marketCap - Market cap data
 * @returns {Object} - Fundamental analysis
 */
function analyzeFundamentals(metrics, financialLineItems, marketCap) {
  // Initialize with a slightly negative bias (Burry is skeptical)
  let score = 2.0;
  const insights = [];
  const redFlags = [];
  const valueSignals = [];

  if (!metrics || metrics.length === 0 || !financialLineItems || !marketCap) {
    return {
      score,
      insights: "Insufficient data for fundamental analysis",
      redFlags,
      valueSignals,
    };
  }

  // Helper to find the most recent value for a line item
  const findMostRecent = (lineItemName) => {
    // Handle both array and object formats
    if (Array.isArray(financialLineItems)) {
      const items = financialLineItems
        .filter((item) => item.line_item === lineItemName)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      return items.length > 0 ? items[0].value : null;
    } else if (financialLineItems && typeof financialLineItems === "object") {
      // If it's an object, directly access the property
      const lineItem = financialLineItems[lineItemName];
      return lineItem ? lineItem.value : null;
    }
    return null;
  };

  // Helper to get historical values for a line item
  const getHistorical = (lineItemName) => {
    // Handle both array and object formats
    if (Array.isArray(financialLineItems)) {
      return financialLineItems
        .filter((item) => item.line_item === lineItemName)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((item) => item.value);
    } else if (financialLineItems && typeof financialLineItems === "object") {
      // If it's an object, return the value in an array
      const lineItem = financialLineItems[lineItemName];
      return lineItem ? [lineItem.value] : [];
    }
    return [];
  };

  // 1. Debt Analysis - Burry often focuses on excessive debt
  const totalDebt = findMostRecent("total_debt");
  const totalAssets = findMostRecent("total_assets");
  const cash = findMostRecent("cash_and_equivalents");

  if (totalDebt !== null && totalAssets !== null && totalAssets > 0) {
    const debtToAssets = totalDebt / totalAssets;

    if (debtToAssets > 0.5) {
      score -= 0.5;
      redFlags.push(`High debt-to-assets ratio of ${debtToAssets.toFixed(2)}`);
    }

    // Net debt (debt minus cash)
    if (cash !== null) {
      const netDebt = totalDebt - cash;
      if (netDebt > 0 && netDebt / totalAssets > 0.4) {
        score -= 0.5;
        redFlags.push(
          `High net debt position of ${(netDebt / 1000000).toFixed(1)}M`
        );
      } else if (netDebt < 0) {
        score += 0.5;
        valueSignals.push(
          `Net cash position of ${(Math.abs(netDebt) / 1000000).toFixed(1)}M`
        );
      }
    }
  }

  // 2. Earnings vs Cash Flow Divergence - Burry looks for accounting discrepancies
  const netIncome = getHistorical("net_income");
  const freeCashFlow = getHistorical("free_cash_flow");

  if (netIncome.length > 1 && freeCashFlow.length > 1) {
    // Check if earnings are consistently higher than cash flow
    let divergenceCount = 0;

    for (let i = 0; i < Math.min(netIncome.length, freeCashFlow.length); i++) {
      if (netIncome[i] > freeCashFlow[i] * 1.2) {
        divergenceCount++;
      }
    }

    if (divergenceCount >= 2) {
      score -= 1.0;
      redFlags.push(
        `Earnings consistently exceeding cash flow by >20% (potential accounting issues)`
      );
    }

    // Check for deteriorating cash flow with stable earnings
    if (
      netIncome[0] >= netIncome[1] &&
      freeCashFlow[0] < freeCashFlow[1] * 0.8
    ) {
      score -= 0.5;
      redFlags.push(`Deteriorating cash flow while earnings remain stable`);
    }
  }

  // 3. Inventory and Receivables Analysis
  const inventory = getHistorical("inventory");
  const revenue = getHistorical("revenue");
  const receivables = getHistorical("accounts_receivable");

  // Check for inventory growth outpacing revenue
  if (inventory.length > 1 && revenue.length > 1) {
    const inventoryGrowth = inventory[0] / inventory[1] - 1;
    const revenueGrowth = revenue[0] / revenue[1] - 1;

    if (inventoryGrowth > revenueGrowth * 1.5 && inventoryGrowth > 0.1) {
      score -= 0.5;
      redFlags.push(
        `Inventory growing faster than revenue (${(
          inventoryGrowth * 100
        ).toFixed(1)}% vs ${(revenueGrowth * 100).toFixed(1)}%)`
      );
    }
  }

  // Check for receivables growth outpacing revenue
  if (receivables && receivables.length > 1 && revenue.length > 1) {
    const receivablesGrowth = receivables[0] / receivables[1] - 1;
    const revenueGrowth = revenue[0] / revenue[1] - 1;

    if (receivablesGrowth > revenueGrowth * 1.5 && receivablesGrowth > 0.1) {
      score -= 0.5;
      redFlags.push(
        `Accounts receivable growing faster than revenue (${(
          receivablesGrowth * 100
        ).toFixed(1)}% vs ${(revenueGrowth * 100).toFixed(1)}%)`
      );
    }
  }

  // 4. Valuation Analysis - Burry looks for extreme undervaluation
  if (metrics.length > 0 && marketCap.market_cap > 0) {
    // Check for extremely low P/E
    if (
      metrics[0].price_to_earnings_ratio !== undefined &&
      metrics[0].price_to_earnings_ratio > 0 &&
      metrics[0].price_to_earnings_ratio < 8
    ) {
      score += 1.0;
      valueSignals.push(
        `Very low P/E ratio of ${metrics[0].price_to_earnings_ratio.toFixed(1)}`
      );
    }

    // Check for low price-to-book
    if (
      metrics[0].price_to_book_ratio !== undefined &&
      metrics[0].price_to_book_ratio < 1.0
    ) {
      score += 0.5;
      valueSignals.push(
        `Trading below book value (P/B: ${metrics[0].price_to_book_ratio.toFixed(
          2
        )})`
      );
    }

    // Check for strong cash position relative to market cap
    if (cash !== null && cash / marketCap.market_cap > 0.3) {
      score += 1.0;
      valueSignals.push(
        `Large cash position representing ${(
          (cash / marketCap.market_cap) *
          100
        ).toFixed(1)}% of market cap`
      );
    }
  }

  // 5. Capital Allocation
  const capex = getHistorical("capital_expenditure");

  if (capex.length > 1 && freeCashFlow.length > 1) {
    // Check for declining capex (potential underinvestment)
    if (capex[0] < capex[1] * 0.7) {
      score -= 0.3;
      redFlags.push(
        `Significant decline in capital expenditure (${(
          (1 - capex[0] / capex[1]) *
          100
        ).toFixed(1)}% reduction)`
      );
    }

    // Check for excessive capex relative to cash flow
    if (capex[0] > Math.abs(freeCashFlow[0]) * 2) {
      score -= 0.3;
      redFlags.push(
        `Excessive capital expenditure relative to cash flow generation`
      );
    }
  }

  // Compile insights
  if (redFlags.length > 0) {
    insights.push(`Red Flags: ${redFlags.join(". ")}`);
  }

  if (valueSignals.length > 0) {
    insights.push(`Value Signals: ${valueSignals.join(". ")}`);
  }

  // Final adjustment - ensure score is within 0-5 range
  return {
    score: Math.min(Math.max(score, 0), 5),
    insights: insights.join(". "),
    redFlags,
    valueSignals,
  };
}

/**
 * Analyze sentiment and market positioning
 *
 * @param {Array} insiderTrades - Insider trading data
 * @param {Array} technicalData - Technical indicators
 * @returns {Object} - Sentiment analysis
 */
function analyzeSentimentAndPositioning(insiderTrades, technicalData) {
  let score = 2.5; // Start neutral
  const insights = [];

  if (
    !insiderTrades ||
    !technicalData ||
    insiderTrades.length === 0 ||
    technicalData.length === 0
  ) {
    return {
      score,
      insights: "Insufficient data for sentiment analysis",
    };
  }

  // 1. Insider Trading Analysis
  const buyTrades = insiderTrades.filter(
    (trade) => trade.transaction_type === "Buy"
  );
  const sellTrades = insiderTrades.filter(
    (trade) => trade.transaction_type === "Sell"
  );

  let buyVolume = 0;
  let sellVolume = 0;

  buyTrades.forEach((trade) => {
    buyVolume += trade.total_value;
  });

  sellTrades.forEach((trade) => {
    sellVolume += trade.total_value;
  });

  // Significant insider buying is a positive signal
  if (buyVolume > sellVolume * 2 && buyTrades.length >= 2) {
    score += 1.0;
    insights.push(
      `Strong insider buying: ${buyTrades.length} buys totaling $${(
        buyVolume / 1000000
      ).toFixed(2)}M`
    );
  }
  // Significant insider selling can be a negative
  else if (sellVolume > buyVolume * 3 && sellTrades.length > 2) {
    score -= 0.75;
    insights.push(
      `Substantial insider selling: ${sellTrades.length} sells totaling $${(
        sellVolume / 1000000
      ).toFixed(2)}M`
    );
  }

  // 2. Technical Indicators - Burry primarily uses these as contrarian signals
  // Sort data chronologically
  const sortedData = [...technicalData].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const recentData = sortedData[sortedData.length - 1];

  // Check for extreme overbought conditions
  if (recentData.rsi > 80) {
    score -= 1.0;
    insights.push(
      `Extreme overbought conditions: RSI at ${recentData.rsi.toFixed(1)}`
    );
  }
  // Check for extreme oversold conditions - Burry might see value here
  else if (recentData.rsi < 25) {
    score += 0.75;
    insights.push(
      `Extreme oversold conditions: RSI at ${recentData.rsi.toFixed(1)}`
    );
  }

  // Check Bollinger Band positioning
  if (recentData.upper_bollinger && recentData.lower_bollinger) {
    const bwidth =
      (recentData.upper_bollinger - recentData.lower_bollinger) /
      recentData.middle_bollinger;

    // Extremely tight bands suggest potential volatility breakout
    if (bwidth < 0.1) {
      score += 0.5;
      insights.push(
        `Unusually tight Bollinger Bands suggesting potential volatility breakout`
      );
    }

    // Price at extreme bands can be a contrarian signal
    if (recentData.close > recentData.upper_bollinger * 0.98) {
      score -= 0.5;
      insights.push(
        `Price testing upper Bollinger Band (potential reversal point)`
      );
    } else if (recentData.close < recentData.lower_bollinger * 1.02) {
      score += 0.5;
      insights.push(
        `Price testing lower Bollinger Band (potential value zone)`
      );
    }
  }

  // Calculate volume trends
  const recentVolumes = sortedData.slice(-10).map((d) => d.volume);
  const avgRecentVolume =
    recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;

  const olderVolumes = sortedData.slice(-30, -10).map((d) => d.volume);
  const avgOlderVolume =
    olderVolumes.reduce((sum, vol) => sum + vol, 0) / olderVolumes.length;

  // Unusual volume spikes can signal market extremes
  if (avgRecentVolume > avgOlderVolume * 2) {
    score -= 0.5;
    insights.push(
      `Unusual volume spike (${(avgRecentVolume / avgOlderVolume).toFixed(
        1
      )}x normal) suggesting potential capitulation or euphoria`
    );
  }

  return {
    score: Math.min(Math.max(score, 0), 5),
    insights: insights.join(". "),
  };
}

/**
 * Assess contrarian opportunity
 *
 * @param {Object} fundamentalAnalysis - Fundamental analysis
 * @param {Object} sentimentAnalysis - Sentiment analysis
 * @param {Array} technicalData - Technical indicators
 * @returns {Object} - Contrarian analysis
 */
function assessContrarianOpportunity(
  fundamentalAnalysis,
  sentimentAnalysis,
  technicalData
) {
  let score = 2.5; // Start neutral
  const insights = [];

  // 1. Look for divergence between fundamentals and sentiment
  const fundamentalScore = fundamentalAnalysis.score;
  const sentimentScore = sentimentAnalysis.score;

  if (fundamentalScore > 3.5 && sentimentScore < 2.0) {
    score += 1.5;
    insights.push(
      "Strong contrarian buy signal: Solid fundamentals with negative sentiment"
    );
  } else if (fundamentalScore < 1.5 && sentimentScore > 3.5) {
    score -= 1.5;
    insights.push(
      "Strong contrarian sell signal: Poor fundamentals with excessive optimism"
    );
  }

  // 2. Check for sentiment extremes in either direction
  if (sentimentScore > 4.0) {
    score -= 1.0;
    insights.push(
      "Market excessively optimistic - contrarian caution warranted"
    );
  } else if (sentimentScore < 1.0) {
    score += 1.0;
    insights.push(
      "Market excessively pessimistic - contrarian opportunity possible"
    );
  }

  // 3. Assess asymmetric risk/reward
  const redFlagCount = fundamentalAnalysis.redFlags
    ? fundamentalAnalysis.redFlags.length
    : 0;
  const valueSignalCount = fundamentalAnalysis.valueSignals
    ? fundamentalAnalysis.valueSignals.length
    : 0;

  if (valueSignalCount >= 2 && redFlagCount <= 1) {
    score += 1.0;
    insights.push("Asymmetric upside potential with limited downside risks");
  } else if (redFlagCount >= 3 && valueSignalCount === 0) {
    score -= 1.0;
    insights.push(
      "Multiple red flags with limited upside - significant downside risk"
    );
  }

  // 4. Price trend vs. fundamental trend analysis
  if (technicalData && technicalData.length > 30) {
    const sortedData = [...technicalData].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    const firstPrice = sortedData[0].close;
    const lastPrice = sortedData[sortedData.length - 1].close;
    const priceChange = (lastPrice - firstPrice) / firstPrice;

    // If price trend contradicts fundamental quality, that's a contrarian signal
    if (priceChange < -0.15 && fundamentalScore > 3.5) {
      score += 1.0;
      insights.push(
        `Price declined ${(priceChange * 100).toFixed(
          1
        )}% despite solid fundamentals - potential value opportunity`
      );
    } else if (priceChange > 0.25 && fundamentalScore < 2.0) {
      score -= 1.0;
      insights.push(
        `Price rallied ${(priceChange * 100).toFixed(
          1
        )}% despite weak fundamentals - potential shorting opportunity`
      );
    }
  }

  return {
    score: Math.min(Math.max(score, 0), 5),
    insights: insights.join(". "),
  };
}

/**
 * Generate Michael Burry's analysis output using LLM
 *
 * @param {string} ticker - The stock ticker
 * @param {Object} analysisData - Analysis data for the ticker
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Michael Burry's analysis
 */
async function generateBurryOutput(ticker, analysisData, state, agentId) {
  const {
    fundamentalAnalysis,
    sentimentAnalysis,
    contrarianAnalysis,
    normalizedScore,
    preliminarySignal,
    preliminaryConfidence,
  } = analysisData;

  const prompt = `
  You are Michael Burry, the investor known for predicting the 2008 housing market crash, identifying market bubbles, and taking contrarian positions based on deep fundamental analysis.

  Based on the following analysis of ${ticker}, provide your investment recommendation:

  Fundamental Analysis:
  ${fundamentalAnalysis.insights}

  Sentiment & Positioning Analysis:
  ${sentimentAnalysis.insights}

  Contrarian Opportunity Assessment:
  ${contrarianAnalysis.insights}

  Overall Score: ${(normalizedScore * 10).toFixed(1)}/10
  Preliminary Signal: ${preliminarySignal.toUpperCase()}
  Confidence Level: ${preliminaryConfidence.toFixed(2)}

  Please respond with:
  1. Your investment signal (bullish, bearish, or neutral)
  2. Your confidence level (0.0 to 1.0)
  3. Your detailed reasoning in Michael Burry's voice, focusing on:
     - Critical assessment of company fundamentals and accounting quality
     - Identification of market misconceptions or blind spots
     - Contrarian thesis that goes against prevailing sentiment
     - Risk assessment and potential catalysts
     - Overall investment recommendation with emphasis on asymmetric opportunities

  JSON format:
  {
    "signal": "bullish|bearish|neutral",
    "confidence": 0.XX,
    "reasoning": "Your detailed analysis..."
  }
  `;

  progress.updateStatus(agentId, ticker, "Generating LLM analysis");
  const llmResponse = await callLLM(state, prompt);

  try {
    // Handle both string and object responses
    let jsonResponse;
    if (typeof llmResponse === "string") {
      jsonResponse = JSON.parse(llmResponse);
    } else {
      jsonResponse = llmResponse;
    }

    return MichaelBurrySignalSchema.parse(jsonResponse);
  } catch (error) {
    console.error("Error parsing Michael Burry LLM response:", error);
    return {
      signal: preliminarySignal,
      confidence: preliminaryConfidence,
      reasoning:
        "Error generating detailed analysis. Using quantitative signals only.",
    };
  }
}
