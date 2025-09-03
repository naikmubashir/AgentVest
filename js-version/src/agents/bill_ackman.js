import { z } from "zod";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  searchLineItems,
} from "../tools/api.js";
import { callLLM } from "../utils/llm.js";
import { progress } from "../utils/progress.js";
import { getApiKeyFromState } from "../utils/api_key.js";

// Define the schema for Bill Ackman's analysis signal
const BillAckmanSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Bill Ackman's investing principles and LLM reasoning.
 * Fetches multiple periods of data for a more robust long-term view.
 * Incorporates brand/competitive advantage, activism potential, and other key factors.
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Bill Ackman's analysis
 */
export async function billAckmanAgent(state, agentId = "bill_ackman_agent") {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  // Collect all analysis for LLM reasoning
  const analysisData = {};
  const ackmanAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Fetching financial metrics");
    // Fetch required data - request more periods for better trend analysis
    const metrics = await getFinancialMetrics(
      ticker,
      endDate,
      "annual",
      5,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Gathering financial line items");
    // Request multiple periods of data for a more robust long-term view
    const financialLineItems = await searchLineItems(
      ticker,
      [
        "revenue",
        "operating_margin",
        "debt_to_equity",
        "free_cash_flow",
        "total_assets",
        "total_liabilities",
        "dividends_and_other_cash_distributions",
        "outstanding_shares",
        // Optional: intangible_assets if available
      ],
      endDate,
      5,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Getting market cap");
    const marketCap = await getMarketCap(ticker, endDate, apiKey);

    progress.updateStatus(agentId, ticker, "Analyzing business quality");
    const qualityAnalysis = analyzeBusinessQuality(metrics, financialLineItems);

    progress.updateStatus(
      agentId,
      ticker,
      "Analyzing balance sheet and capital structure"
    );
    const balanceSheetAnalysis = analyzeFinancialDiscipline(
      metrics,
      financialLineItems
    );

    progress.updateStatus(agentId, ticker, "Analyzing activism potential");
    const activismAnalysis = analyzeActivismPotential(financialLineItems);

    progress.updateStatus(
      agentId,
      ticker,
      "Calculating intrinsic value & margin of safety"
    );
    const valuationAnalysis = analyzeValuation(financialLineItems, marketCap);

    // Combine partial scores or signals
    const totalScore =
      qualityAnalysis.score +
      balanceSheetAnalysis.score +
      activismAnalysis.score +
      valuationAnalysis.score;
    const maxPossibleScore = 20; // Adjust weighting as desired (5 from each sub-analysis)

    // Generate a simple buy/hold/sell (bullish/neutral/bearish) signal
    let signal = "neutral";
    if (totalScore >= 0.7 * maxPossibleScore) {
      signal = "bullish";
    } else if (totalScore <= 0.3 * maxPossibleScore) {
      signal = "bearish";
    }

    analysisData[ticker] = {
      signal,
      score: totalScore,
      maxScore: maxPossibleScore,
      qualityAnalysis,
      balanceSheetAnalysis,
      activismAnalysis,
      valuationAnalysis,
    };

    progress.updateStatus(agentId, ticker, "Generating Bill Ackman analysis");
    const ackmanOutput = await generateAckmanOutput(
      ticker,
      analysisData,
      state,
      agentId
    );

    ackmanAnalysis[ticker] = {
      signal: ackmanOutput.signal,
      confidence: ackmanOutput.confidence,
      reasoning: ackmanOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: ackmanOutput.reasoning,
    });
  }

  // Show reasoning if requested
  if (state.metadata && state.metadata.show_reasoning) {
    showAgentReasoning(ackmanAnalysis, "Bill Ackman Agent");
  }

  // Add signals to the overall state
  state.data.analyst_signals[agentId] = ackmanAnalysis;

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(ackmanAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Analyze whether the company has a high-quality business with stable or growing cash flows,
 * durable competitive advantages (moats), and potential for long-term growth.
 * Also tries to infer brand strength if intangible_assets data is present (optional).
 *
 * @param {Array} metrics - Financial metrics data
 * @param {Object|Array} financialLineItems - Financial line items (object from mock data or array from API)
 * @returns {Object} - Analysis results
 */
function analyzeBusinessQuality(metrics, financialLineItems) {
  let score = 0;
  const details = [];

  if (!metrics || !financialLineItems || metrics.length === 0) {
    return {
      score: 0,
      details: "Insufficient data to analyze business quality",
    };
  }

  // Check operating margins
  const operatingMargins = metrics
    .filter((m) => m.operating_margin !== undefined)
    .map((m) => m.operating_margin);

  if (operatingMargins.length > 0) {
    const avgMargin =
      operatingMargins.reduce((a, b) => a + b, 0) / operatingMargins.length;
    if (avgMargin > 0.2) {
      score += 1.5;
      details.push("Strong operating margins (>20%)");
    } else if (avgMargin > 0.15) {
      score += 1;
      details.push("Good operating margins (>15%)");
    } else if (avgMargin > 0.1) {
      score += 0.5;
      details.push("Acceptable operating margins (>10%)");
    }
  }

  // Check revenue growth
  // Handle financialLineItems as object (from mock data) or array (from real API)
  const revenueItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter((item) => item.line_item === "revenue")
    : financialLineItems.revenue || [];

  const revenues = revenueItems.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  if (revenues.length > 1) {
    const growthRates = [];
    for (let i = 0; i < revenues.length - 1; i++) {
      const currentRev = revenues[i].value;
      const prevRev = revenues[i + 1].value;
      if (prevRev > 0) {
        const growthRate = (currentRev - prevRev) / prevRev;
        growthRates.push(growthRate);
      }
    }

    if (growthRates.length > 0) {
      const avgGrowth =
        growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
      if (avgGrowth > 0.15) {
        score += 1.5;
        details.push("Strong revenue growth (>15%)");
      } else if (avgGrowth > 0.08) {
        score += 1;
        details.push("Good revenue growth (>8%)");
      } else if (avgGrowth > 0.03) {
        score += 0.5;
        details.push("Moderate revenue growth (>3%)");
      }
    }
  }

  // Check free cash flow trends
  // Handle financialLineItems as object (from mock data) or array (from real API)
  const fcfItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter((item) => item.line_item === "free_cash_flow")
    : financialLineItems.free_cash_flow || [];

  const fcf = fcfItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (fcf.length > 0) {
    const positiveFCF = fcf.filter((item) => item.value > 0).length;
    const fcfRatio = positiveFCF / fcf.length;

    if (fcfRatio === 1) {
      score += 2;
      details.push("Consistently positive free cash flow");
    } else if (fcfRatio > 0.75) {
      score += 1;
      details.push("Mostly positive free cash flow");
    } else if (fcfRatio > 0.5) {
      score += 0.5;
      details.push("Mixed free cash flow generation");
    }
  }

  return {
    score: Math.min(score, 5), // Cap at 5 points max
    details: details.join("; "),
  };
}

/**
 * Analyze the company's financial discipline, capital allocation, and balance sheet strength
 *
 * @param {Array} metrics - Financial metrics data
 * @param {Array} financialLineItems - Financial line items
 * @returns {Object} - Analysis results
 */
function analyzeFinancialDiscipline(metrics, financialLineItems) {
  let score = 0;
  const details = [];

  if (!metrics || !financialLineItems || metrics.length === 0) {
    return {
      score: 0,
      details: "Insufficient data to analyze financial discipline",
    };
  }

  // Check debt levels
  const debtToEquity = metrics
    .filter((m) => m.debt_to_equity !== undefined)
    .map((m) => m.debt_to_equity);

  if (debtToEquity.length > 0) {
    const avgDebt =
      debtToEquity.reduce((a, b) => a + b, 0) / debtToEquity.length;
    if (avgDebt < 0.5) {
      score += 2;
      details.push("Very low debt levels (D/E < 0.5)");
    } else if (avgDebt < 1.0) {
      score += 1;
      details.push("Moderate debt levels (D/E < 1.0)");
    } else if (avgDebt < 1.5) {
      score += 0.5;
      details.push("Acceptable debt levels (D/E < 1.5)");
    }
  }

  // Check dividends and capital returns
  // Handle financialLineItems as object (from mock data) or array (from real API)
  const dividendItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter(
        (item) => item.line_item === "dividends_and_other_cash_distributions"
      )
    : financialLineItems.dividends_and_other_cash_distributions || [];

  const dividends = dividendItems.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  if (dividends.length > 0) {
    const positiveDividends = dividends.filter((item) => item.value > 0).length;
    if (positiveDividends === dividends.length) {
      score += 1.5;
      details.push("Consistent shareholder returns via dividends/buybacks");
    } else if (positiveDividends > dividends.length / 2) {
      score += 0.75;
      details.push("Some shareholder returns via dividends/buybacks");
    }
  }

  // Check overall balance sheet strength
  // Handle financialLineItems as object (from mock data) or array (from real API)
  const assetItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter((item) => item.line_item === "total_assets")
    : financialLineItems.totalAssets || [];

  const assets = assetItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Handle financialLineItems as object (from mock data) or array (from real API)
  const liabilityItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter(
        (item) => item.line_item === "total_liabilities"
      )
    : financialLineItems.totalLiabilities || [];

  const liabilities = liabilityItems.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  if (assets.length > 0 && liabilities.length > 0 && assets[0].value > 0) {
    const liabToAssets = liabilities[0].value / assets[0].value;

    if (liabToAssets < 0.4) {
      score += 1.5;
      details.push("Very strong balance sheet (liabilities < 40% of assets)");
    } else if (liabToAssets < 0.6) {
      score += 1;
      details.push("Strong balance sheet (liabilities < 60% of assets)");
    } else if (liabToAssets < 0.8) {
      score += 0.5;
      details.push("Adequate balance sheet (liabilities < 80% of assets)");
    }
  }

  return {
    score: Math.min(score, 5), // Cap at 5 points max
    details: details.join("; "),
  };
}

/**
 * Analyze the company's potential for activism
 *
 * @param {Object|Array} financialLineItems - Financial line items (object from mock data or array from API)
 * @returns {Object} - Analysis results
 */
function analyzeActivismPotential(financialLineItems) {
  let score = 0;
  const details = [];

  if (!financialLineItems || financialLineItems.length === 0) {
    return {
      score: 0,
      details: "Insufficient data to analyze activism potential",
    };
  }

  // Look for inefficient capital allocation
  // Handle financialLineItems as object (from mock data) or array (from real API)
  const fcfItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter((item) => item.line_item === "free_cash_flow")
    : financialLineItems.free_cash_flow || [];

  const fcf = fcfItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Handle financialLineItems as object (from mock data) or array (from real API)
  const dividendItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter(
        (item) => item.line_item === "dividends_and_other_cash_distributions"
      )
    : financialLineItems.dividends_and_other_cash_distributions || [];

  const dividends = dividendItems.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  if (fcf.length > 0 && dividends.length > 0 && fcf[0].value > 0) {
    const payoutRatio = dividends[0].value / fcf[0].value;

    if (payoutRatio < 0.2 && fcf[0].value > 0) {
      score += 2;
      details.push(
        "Low payout ratio with positive FCF (potential activism target)"
      );
    } else if (payoutRatio < 0.4 && fcf[0].value > 0) {
      score += 1;
      details.push("Moderate payout ratio with positive FCF");
    }
  }

  // Check for operational inefficiency
  // Handle financialLineItems as object (from mock data) or array (from real API)
  const marginItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter((item) => item.line_item === "operating_margin")
    : financialLineItems.operating_margin || [];

  const operatingMargins = marginItems.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  if (operatingMargins.length > 1) {
    const recentMargin = operatingMargins[0].value;
    const previousMargin = operatingMargins[1].value;

    if (recentMargin < previousMargin * 0.8) {
      score += 2;
      details.push(
        "Declining operating margins (potential for operational improvements)"
      );
    } else if (recentMargin < previousMargin * 0.9) {
      score += 1;
      details.push("Slightly declining operating margins");
    }
  }

  // Check for conglomerate structure or complex business model
  // This is harder to quantify with just financial data, so this is a placeholder
  // In a real implementation, you might use industry classification or other data
  if (score > 0) {
    score += 1;
    details.push(
      "Potential for structural improvements (simplified assumption)"
    );
  }

  return {
    score: Math.min(score, 5), // Cap at 5 points max
    details: details.join("; "),
  };
}

/**
 * Analyze the company's valuation and margin of safety
 *
 * @param {Object|Array} financialLineItems - Financial line items (object from mock data or array from API)
 * @param {Object} marketCap - Market cap data
 * @returns {Object} - Analysis results
 */
function analyzeValuation(financialLineItems, marketCap) {
  let score = 0;
  const details = [];

  if (!financialLineItems || !marketCap || financialLineItems.length === 0) {
    return {
      score: 0,
      details: "Insufficient data to analyze valuation",
    };
  }

  // Check FCF yield
  // Handle financialLineItems as object (from mock data) or array (from real API)
  const fcfItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter((item) => item.line_item === "free_cash_flow")
    : financialLineItems.free_cash_flow || [];

  const fcf = fcfItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (fcf.length > 0 && fcf[0].value > 0 && marketCap.market_cap > 0) {
    const fcfYield = fcf[0].value / marketCap.market_cap;

    if (fcfYield > 0.08) {
      score += 2;
      details.push("High FCF yield (>8%)");
    } else if (fcfYield > 0.05) {
      score += 1.5;
      details.push("Good FCF yield (>5%)");
    } else if (fcfYield > 0.03) {
      score += 0.5;
      details.push("Average FCF yield (>3%)");
    }
  }

  // Check asset value vs market cap
  // Handle financialLineItems as object (from mock data) or array (from real API)
  const assetItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter((item) => item.line_item === "total_assets")
    : financialLineItems.totalAssets || [];

  const assets = assetItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Handle financialLineItems as object (from mock data) or array (from real API)
  const liabilityItems = Array.isArray(financialLineItems)
    ? financialLineItems.filter(
        (item) => item.line_item === "total_liabilities"
      )
    : financialLineItems.totalLiabilities || [];

  if (assets.length > 0 && liabilities.length > 0 && marketCap.market_cap > 0) {
    const netAssetValue = assets[0].value - liabilities[0].value;
    const priceToBook = marketCap.market_cap / netAssetValue;

    if (priceToBook < 1.0) {
      score += 2;
      details.push("Trading below book value (P/B < 1.0)");
    } else if (priceToBook < 1.5) {
      score += 1;
      details.push("Trading at reasonable book value (P/B < 1.5)");
    } else if (priceToBook < 2.5) {
      score += 0.5;
      details.push("Acceptable valuation relative to book (P/B < 2.5)");
    }
  }

  // Check revenue valuation
  const revenues = financialLineItems
    .filter((item) => item.line_item === "revenue")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (
    revenues.length > 0 &&
    revenues[0].value > 0 &&
    marketCap.market_cap > 0
  ) {
    const priceToSales = marketCap.market_cap / revenues[0].value;

    if (priceToSales < 1.0) {
      score += 1;
      details.push("Low price-to-sales ratio (P/S < 1.0)");
    } else if (priceToSales < 2.0) {
      score += 0.5;
      details.push("Reasonable price-to-sales ratio (P/S < 2.0)");
    }
  }

  return {
    score: Math.min(score, 5), // Cap at 5 points max
    details: details.join("; "),
  };
}

/**
 * Generate Bill Ackman's analysis output using LLM
 *
 * @param {string} ticker - The stock ticker
 * @param {Object} analysisData - Analysis data for the ticker
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Bill Ackman's analysis
 */
async function generateAckmanOutput(ticker, analysisData, state, agentId) {
  const tickerData = analysisData[ticker];

  const prompt = `
  You are Bill Ackman, a renowned activist investor known for taking concentrated positions in high-quality businesses and pushing for changes to unlock shareholder value.

  Based on the following analysis of ${ticker}, provide your investment recommendation:

  Business Quality Analysis:
  ${tickerData.qualityAnalysis.details}

  Financial Discipline & Capital Structure:
  ${tickerData.balanceSheetAnalysis.details}

  Activism Potential:
  ${tickerData.activismAnalysis.details}

  Valuation Analysis:
  ${tickerData.valuationAnalysis.details}

  Overall Score: ${tickerData.score} out of ${tickerData.maxScore} possible points

  Please respond with:
  1. Your investment signal (bullish, bearish, or neutral)
  2. Your confidence level (0.0 to 1.0)
  3. Your detailed reasoning in Bill Ackman's voice, including:
     - Assessment of the business quality and competitive advantages
     - Analysis of management's capital allocation decisions
     - Potential for activist intervention or operational improvements
     - Valuation assessment and margin of safety
     - Overall investment thesis and expected catalysts

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
    // Parse the response and validate with Zod schema
    const jsonResponse =
      typeof llmResponse === "string" ? JSON.parse(llmResponse) : llmResponse;
    return BillAckmanSignalSchema.parse(jsonResponse);
  } catch (error) {
    console.error("Error parsing Bill Ackman LLM response:", error);
    return {
      signal: tickerData.signal,
      confidence: 0.5,
      reasoning:
        "Error generating detailed analysis. Using quantitative signals only.",
    };
  }
}
