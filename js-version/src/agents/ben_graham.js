import { z } from "zod";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  searchLineItems,
} from "../tools/api.js";
import { callLLM } from "../utils/llm.js";
import progress from "../utils/progress.js";
import { getApiKeyFromState } from "../utils/api_key.js";

// Define the schema for Ben Graham's analysis signal
const BenGrahamSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Benjamin Graham's value investing principles
 * Focuses on financial health, valuation, and margin of safety
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Ben Graham's analysis
 */
export async function benGrahamAgent(state, agentId = "ben_graham_agent") {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const grahamAnalysis = {};

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
        "current_assets",
        "current_liabilities",
        "total_assets",
        "total_liabilities",
        "total_debt",
        "total_equity",
        "book_value",
        "earnings_per_share",
        "dividends_per_share",
        "revenue",
        "net_income",
      ],
      endDate,
      5,
      apiKey
    );

    progress.updateStatus(
      agentId,
      ticker,
      "Checking Graham's quantitative criteria"
    );
    const grahamCriteria = checkGrahamCriteria(
      ticker,
      metrics,
      financialLineItems,
      marketCap
    );

    // Calculate the overall score and determine signal
    const totalScore = grahamCriteria.reduce(
      (sum, criterion) => sum + (criterion.passed ? 1 : 0),
      0
    );
    const maxScore = grahamCriteria.length;
    const scoreRatio = totalScore / maxScore;

    let signal = "neutral";
    let confidence = 0.5;

    if (scoreRatio >= 0.7) {
      signal = "bullish";
      confidence = 0.6 + scoreRatio * 0.3; // 0.6 to 0.9 confidence
    } else if (scoreRatio <= 0.3) {
      signal = "bearish";
      confidence = 0.6 + (1 - scoreRatio) * 0.3; // 0.6 to 0.9 confidence
    } else {
      confidence = 0.5 + Math.abs(scoreRatio - 0.5);
    }

    // Store analysis data for LLM reasoning
    analysisData[ticker] = {
      metrics,
      financialLineItems,
      marketCap,
      grahamCriteria,
      scoreRatio,
      totalScore,
      maxScore,
      preliminarySignal: signal,
      preliminaryConfidence: confidence,
    };

    progress.updateStatus(agentId, ticker, "Generating Ben Graham analysis");
    const grahamOutput = await generateGrahamOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    grahamAnalysis[ticker] = {
      signal: grahamOutput.signal,
      confidence: grahamOutput.confidence,
      reasoning: grahamOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: grahamOutput.reasoning,
    });
  }

  // Show reasoning if requested
  if (state.metadata.show_reasoning) {
    showAgentReasoning(grahamAnalysis, "Ben Graham Agent");
  }

  // Add signals to the overall state
  state.data.analyst_signals[agentId] = grahamAnalysis;

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(grahamAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Check Graham's key investment criteria
 *
 * @param {string} ticker - Stock ticker
 * @param {Array} metrics - Financial metrics
 * @param {Array} financialLineItems - Financial line items
 * @param {Object} marketCap - Market cap data
 * @returns {Array} - Array of criteria with their status
 */
function checkGrahamCriteria(ticker, metrics, financialLineItems, marketCap) {
  const criteria = [];

  // Helper to find the most recent value for a line item
  const findMostRecent = (lineItemName) => {
    const items = financialLineItems
      .filter((item) => item.line_item === lineItemName)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return items.length > 0 ? items[0].value : null;
  };

  // 1. Adequate Size - not too small to ensure stability
  criteria.push({
    name: "Adequate Size",
    description: "Company should not be too small (Market Cap > $2B)",
    passed: marketCap && marketCap.market_cap > 2000000000,
    details: marketCap
      ? `Market Cap: $${(marketCap.market_cap / 1000000000).toFixed(2)} billion`
      : "Market cap data unavailable",
  });

  // 2. Strong Financial Condition - Current ratio > 2
  const currentAssets = findMostRecent("current_assets");
  const currentLiabilities = findMostRecent("current_liabilities");
  let currentRatio = null;

  if (
    currentAssets !== null &&
    currentLiabilities !== null &&
    currentLiabilities > 0
  ) {
    currentRatio = currentAssets / currentLiabilities;
  }

  criteria.push({
    name: "Strong Financial Condition",
    description: "Current ratio should be at least 2",
    passed: currentRatio !== null && currentRatio >= 2,
    details:
      currentRatio !== null
        ? `Current Ratio: ${currentRatio.toFixed(2)}`
        : "Current ratio data unavailable",
  });

  // 3. Earnings Stability - Positive earnings for at least 5 years
  const earnings = financialLineItems
    .filter((item) => item.line_item === "net_income")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const earningsStability = earnings.every((item) => item.value > 0);
  const earningsYears = earnings.length;

  criteria.push({
    name: "Earnings Stability",
    description: "Positive earnings for at least the past 5 years",
    passed: earningsYears >= 5 && earningsStability,
    details: `${
      earningsStability ? "Consistent" : "Inconsistent"
    } positive earnings over ${earningsYears} years`,
  });

  // 4. Dividend Record - Uninterrupted dividends for at least 20 years
  // This is a strict criterion, so we'll adapt it to be more practical
  const dividends = financialLineItems
    .filter((item) => item.line_item === "dividends_per_share")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const hasDividends =
    dividends.length > 0 && dividends.every((item) => item.value > 0);

  criteria.push({
    name: "Dividend Record",
    description: "Consistent dividend payments",
    passed: hasDividends,
    details: hasDividends
      ? "Consistent dividend payments"
      : "Inconsistent or no dividend payments",
  });

  // 5. Earnings Growth - Minimum 33% increase in EPS over past 10 years
  // Adapting to available data (which may be less than 10 years)
  const eps = financialLineItems
    .filter((item) => item.line_item === "earnings_per_share")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  let earningsGrowth = false;
  let earningsGrowthDetails = "Insufficient EPS history";

  if (eps.length >= 2) {
    const mostRecentEPS = eps[0].value;
    const oldestEPS = eps[eps.length - 1].value;

    if (oldestEPS > 0) {
      const growthRate = (mostRecentEPS - oldestEPS) / oldestEPS;
      const years = Math.min(eps.length, 10);
      const annualizedGrowth = Math.pow(1 + growthRate, 1 / years) - 1;

      earningsGrowth = growthRate >= 0.33; // 33% total growth
      earningsGrowthDetails = `${(growthRate * 100).toFixed(
        2
      )}% total EPS growth over ${years} years (${(
        annualizedGrowth * 100
      ).toFixed(2)}% annualized)`;
    }
  }

  criteria.push({
    name: "Earnings Growth",
    description: "At least 33% growth in EPS over available history",
    passed: earningsGrowth,
    details: earningsGrowthDetails,
  });

  // 6. Moderate P/E Ratio - P/E should not be greater than 15
  let peRatio = null;

  if (metrics && metrics.length > 0 && metrics[0].price_to_earnings_ratio) {
    peRatio = metrics[0].price_to_earnings_ratio;
  } else if (
    marketCap &&
    eps.length > 0 &&
    eps[0].value > 0 &&
    marketCap.shares_outstanding
  ) {
    peRatio =
      marketCap.market_cap / (eps[0].value * marketCap.shares_outstanding);
  }

  criteria.push({
    name: "Moderate P/E Ratio",
    description: "P/E ratio should not exceed 15",
    passed: peRatio !== null && peRatio <= 15,
    details:
      peRatio !== null
        ? `P/E Ratio: ${peRatio.toFixed(2)}`
        : "P/E ratio data unavailable",
  });

  // 7. Moderate P/B Ratio - P/B should not be greater than 1.5
  let pbRatio = null;

  if (metrics && metrics.length > 0 && metrics[0].price_to_book_ratio) {
    pbRatio = metrics[0].price_to_book_ratio;
  } else {
    const bookValue = findMostRecent("book_value");

    if (marketCap && bookValue && bookValue > 0) {
      pbRatio = marketCap.market_cap / bookValue;
    }
  }

  criteria.push({
    name: "Moderate P/B Ratio",
    description: "P/B ratio should not exceed 1.5",
    passed: pbRatio !== null && pbRatio <= 1.5,
    details:
      pbRatio !== null
        ? `P/B Ratio: ${pbRatio.toFixed(2)}`
        : "P/B ratio data unavailable",
  });

  // 8. Graham's Number - P/E * P/B should be less than 22.5
  let grahamNumber = null;

  if (peRatio !== null && pbRatio !== null) {
    grahamNumber = peRatio * pbRatio;
  }

  criteria.push({
    name: "Graham's Number",
    description: "P/E * P/B should be less than 22.5",
    passed: grahamNumber !== null && grahamNumber <= 22.5,
    details:
      grahamNumber !== null
        ? `Graham Number: ${grahamNumber.toFixed(2)}`
        : "Cannot calculate Graham Number",
  });

  // 9. Debt to Asset Ratio - Long-term debt should not exceed working capital
  const totalDebt = findMostRecent("total_debt");
  const workingCapital =
    currentAssets !== null && currentLiabilities !== null
      ? currentAssets - currentLiabilities
      : null;

  let debtRatio = null;
  let debtCheck = false;
  let debtDetails = "Insufficient debt data";

  if (totalDebt !== null && workingCapital !== null && workingCapital > 0) {
    debtRatio = totalDebt / workingCapital;
    debtCheck = totalDebt <= workingCapital;
    debtDetails = `Debt to Working Capital Ratio: ${debtRatio.toFixed(2)}`;
  } else if (totalAssets !== null && totalDebt !== null && totalAssets > 0) {
    // Alternative check if working capital not available
    debtRatio = totalDebt / totalAssets;
    debtCheck = debtRatio <= 0.3; // Debt shouldn't exceed 30% of assets
    debtDetails = `Debt to Total Assets Ratio: ${debtRatio.toFixed(2)}`;
  }

  criteria.push({
    name: "Debt to Asset Ratio",
    description: "Debt should not exceed working capital",
    passed: debtCheck,
    details: debtDetails,
  });

  // 10. Margin of Safety - Current price should be at least 25% below intrinsic value
  // For simplicity, we use a basic Graham Number approach for intrinsic value
  let marginOfSafety = null;
  let marginDetails = "Cannot calculate margin of safety";

  if (eps.length > 0 && eps[0].value > 0) {
    const mostRecentEPS = eps[0].value;
    const bookValuePerShare =
      findMostRecent("book_value") / marketCap.shares_outstanding;

    if (bookValuePerShare > 0) {
      const grahamIntrinsicValue = Math.sqrt(
        15 * 1.5 * mostRecentEPS * bookValuePerShare
      );
      const currentPrice = marketCap.market_cap / marketCap.shares_outstanding;

      marginOfSafety =
        (grahamIntrinsicValue - currentPrice) / grahamIntrinsicValue;
      marginDetails = `Margin of Safety: ${(marginOfSafety * 100).toFixed(2)}%`;
    }
  }

  criteria.push({
    name: "Margin of Safety",
    description: "Price should be at least 25% below intrinsic value",
    passed: marginOfSafety !== null && marginOfSafety >= 0.25,
    details: marginDetails,
  });

  return criteria;
}

/**
 * Generate Ben Graham's analysis output using LLM
 *
 * @param {string} ticker - The stock ticker
 * @param {Object} analysisData - Analysis data for the ticker
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Ben Graham's analysis
 */
async function generateGrahamOutput(ticker, analysisData, state, agentId) {
  const {
    grahamCriteria,
    scoreRatio,
    totalScore,
    maxScore,
    preliminarySignal,
    preliminaryConfidence,
  } = analysisData;

  // Format criteria for LLM
  const criteriaText = grahamCriteria
    .map((c) => `${c.name}: ${c.passed ? "✓" : "✗"} - ${c.details}`)
    .join("\n");

  const prompt = `
  You are Benjamin Graham, the father of value investing and author of "The Intelligent Investor".

  Based on the following analysis of ${ticker}, provide your investment recommendation:

  Graham's Criteria Checklist:
  ${criteriaText}

  Overall Score: ${totalScore}/${maxScore} criteria met (${(
    scoreRatio * 100
  ).toFixed(0)}%)
  Preliminary Signal: ${preliminarySignal.toUpperCase()}
  Confidence Level: ${preliminaryConfidence.toFixed(2)}

  Please respond with:
  1. Your investment signal (bullish, bearish, or neutral)
  2. Your confidence level (0.0 to 1.0)
  3. Your detailed reasoning in Benjamin Graham's voice, focusing on:
     - Assessment of each criterion and its importance
     - Discussion of margin of safety
     - Evaluation of financial stability
     - Overall investment recommendation with emphasis on long-term value

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
    const jsonResponse = JSON.parse(llmResponse);
    return BenGrahamSignalSchema.parse(jsonResponse);
  } catch (error) {
    console.error("Error parsing Ben Graham LLM response:", error);
    return {
      signal: preliminarySignal,
      confidence: preliminaryConfidence,
      reasoning:
        "Error generating detailed analysis. Using quantitative signals only.",
    };
  }
}
