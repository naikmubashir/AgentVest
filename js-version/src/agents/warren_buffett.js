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

// Define the schema for Warren Buffett's analysis signal
const WarrenBuffettSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Buffett's principles and LLM reasoning
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Warren Buffett's analysis
 */
export async function warrenBuffettAgent(
  state,
  agentId = "warren_buffett_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  // Collect all analysis for LLM reasoning
  const analysisData = {};
  const buffettAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Fetching financial metrics");
    // Fetch required data - request more periods for better trend analysis
    const metrics = await getFinancialMetrics(
      ticker,
      endDate,
      "ttm",
      10,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Gathering financial line items");
    const financialLineItems = await searchLineItems(
      ticker,
      [
        "capital_expenditure",
        "depreciation_and_amortization",
        "net_income",
        "outstanding_shares",
        "total_assets",
        "total_liabilities",
        "shareholders_equity",
        "dividends_and_other_cash_distributions",
        "issuance_or_purchase_of_equity_shares",
        "gross_profit",
        "revenue",
        "free_cash_flow",
      ],
      endDate,
      "ttm",
      10,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Getting market cap");
    // Get current market cap
    const marketCap = await getMarketCap(ticker, endDate, apiKey);

    progress.updateStatus(agentId, ticker, "Analyzing fundamentals");
    // Analyze fundamentals
    const fundamentalAnalysis = analyzeFundamentals(metrics);

    progress.updateStatus(agentId, ticker, "Analyzing consistency");
    const consistencyAnalysis = analyzeConsistency(financialLineItems);

    progress.updateStatus(agentId, ticker, "Analyzing competitive moat");
    const moatAnalysis = analyzeMoat(metrics);

    progress.updateStatus(agentId, ticker, "Analyzing pricing power");
    const pricingPowerAnalysis = analyzePricingPower(
      financialLineItems,
      metrics
    );

    progress.updateStatus(agentId, ticker, "Analyzing book value growth");
    const bookValueAnalysis = analyzeBookValueGrowth(financialLineItems);

    progress.updateStatus(agentId, ticker, "Analyzing management quality");
    const mgmtAnalysis = analyzeManagementQuality(financialLineItems);

    progress.updateStatus(agentId, ticker, "Calculating intrinsic value");
    const intrinsicValueAnalysis = calculateIntrinsicValue(financialLineItems);

    // Calculate total score without circle of competence (LLM will handle that)
    const totalScore =
      fundamentalAnalysis.score +
      consistencyAnalysis.score +
      moatAnalysis.score +
      mgmtAnalysis.score +
      pricingPowerAnalysis.score +
      bookValueAnalysis.score;

    // Update max possible score calculation
    const maxPossibleScore =
      10 + // fundamental_analysis (ROE, debt, margins, current ratio)
      moatAnalysis.maxScore +
      mgmtAnalysis.maxScore +
      5 + // pricing_power (0-5)
      5; // book_value_growth (0-5)

    // Store analysis for this ticker
    analysisData[ticker] = {
      metrics,
      financialLineItems,
      marketCap,
      fundamentalAnalysis,
      consistencyAnalysis,
      moatAnalysis,
      pricingPowerAnalysis,
      bookValueAnalysis,
      mgmtAnalysis,
      intrinsicValueAnalysis,
      totalScore,
      maxPossibleScore,
    };
  }

  // Now let's use the LLM to analyze all tickers
  for (const ticker of tickers) {
    const analysis = analysisData[ticker];

    progress.updateStatus(agentId, ticker, "Applying Warren Buffett's wisdom");

    // Format the prompt
    const buffettPrompt = `
You are Warren Buffett, the legendary value investor who has achieved extraordinary returns for decades. 
You are analyzing ${ticker} as a potential investment. Apply your principles:

1. Focus on businesses with consistent earning power, not just earnings
2. Invest in businesses with strong economic moats (competitive advantages)
3. Invest in companies with honest and competent management
4. Look for businesses with predictable earnings and high returns on equity
5. Prefer businesses that are simple and understandable
6. Be cautious with debt-laden companies
7. Demand a margin of safety when making investment decisions
8. Be fearful when others are greedy and greedy when others are fearful

Here's the analysis of ${ticker}:

Fundamental Analysis:
${JSON.stringify(analysis.fundamentalAnalysis, null, 2)}

Consistency Analysis:
${JSON.stringify(analysis.consistencyAnalysis, null, 2)}

Competitive Moat Analysis:
${JSON.stringify(analysis.moatAnalysis, null, 2)}

Pricing Power Analysis:
${JSON.stringify(analysis.pricingPowerAnalysis, null, 2)}

Book Value Growth Analysis:
${JSON.stringify(analysis.bookValueAnalysis, null, 2)}

Management Quality Analysis:
${JSON.stringify(analysis.mgmtAnalysis, null, 2)}

Intrinsic Value Analysis:
${JSON.stringify(analysis.intrinsicValueAnalysis, null, 2)}

Overall Score: ${analysis.totalScore} out of a possible ${
      analysis.maxPossibleScore
    }

Based on the data provided and your investment philosophy, provide your analysis. Is this stock bullish (a good investment), bearish (a poor investment), or neutral (needs more research)? Include your reasoning.

Return your analysis in this format:
{
  "signal": "bullish|bearish|neutral",
  "confidence": 0-1 (a number between 0 and 1, where 1 is highest confidence),
  "reasoning": "Your detailed analysis explaining why this is a good or bad investment according to your principles"
}
`;

    // Call the LLM for Warren Buffett's analysis
    const buffettResult = await callLLM(
      buffettPrompt,
      WarrenBuffettSignalSchema,
      agentId,
      state
    );

    // Store the result
    buffettAnalysis[ticker] = buffettResult;

    // Show the reasoning if enabled
    showAgentReasoning(state, "Warren Buffett", buffettResult.reasoning);
  }

  // Update state with Warren Buffett's analysis
  const newState = {
    ...state,
    data: {
      ...state.data,
      agent_signals: {
        ...state.data.agent_signals,
        warren_buffett: buffettAnalysis,
      },
    },
  };

  return newState;
}

/**
 * Analyze fundamental metrics
 *
 * @param {Array} metrics - Financial metrics
 * @returns {Object} - Analysis results
 */
function analyzeFundamentals(metrics) {
  let score = 0;
  const results = {
    roe: null,
    debt: null,
    margins: null,
    liquidity: null,
    details: {},
    score: 0,
  };

  if (!metrics || metrics.length === 0) {
    return results;
  }

  // Get the most recent metrics
  const latest = metrics[0];

  // Analyze ROE - Buffett loves high ROE (>15%)
  if (latest.roe !== null && latest.roe !== undefined) {
    const roe = latest.roe * 100; // Convert to percentage
    results.roe = roe;
    results.details.roe = { value: roe, score: 0 };

    if (roe > 20) {
      results.details.roe.score = 3;
      score += 3;
    } else if (roe > 15) {
      results.details.roe.score = 2;
      score += 2;
    } else if (roe > 10) {
      results.details.roe.score = 1;
      score += 1;
    }
  }

  // Analyze debt - Buffett prefers low debt
  if (latest.debt_to_equity !== null && latest.debt_to_equity !== undefined) {
    const debtToEquity = latest.debt_to_equity;
    results.debt = debtToEquity;
    results.details.debt = { value: debtToEquity, score: 0 };

    if (debtToEquity < 0.3) {
      results.details.debt.score = 3;
      score += 3;
    } else if (debtToEquity < 0.5) {
      results.details.debt.score = 2;
      score += 2;
    } else if (debtToEquity < 1.0) {
      results.details.debt.score = 1;
      score += 1;
    }
  }

  // Analyze margins - Buffett likes high margins
  if (latest.net_margin !== null && latest.net_margin !== undefined) {
    const netMargin = latest.net_margin * 100; // Convert to percentage
    results.margins = netMargin;
    results.details.margins = { value: netMargin, score: 0 };

    if (netMargin > 20) {
      results.details.margins.score = 2;
      score += 2;
    } else if (netMargin > 10) {
      results.details.margins.score = 1;
      score += 1;
    }
  }

  // Analyze liquidity - Buffett wants strong balance sheets
  if (latest.current_ratio !== null && latest.current_ratio !== undefined) {
    const currentRatio = latest.current_ratio;
    results.liquidity = currentRatio;
    results.details.liquidity = { value: currentRatio, score: 0 };

    if (currentRatio > 1.5) {
      results.details.liquidity.score = 2;
      score += 2;
    } else if (currentRatio > 1.0) {
      results.details.liquidity.score = 1;
      score += 1;
    }
  }

  results.score = score;
  return results;
}

/**
 * Analyze consistency of financial metrics
 *
 * @param {Array} lineItems - Financial line items
 * @returns {Object} - Analysis results
 */
function analyzeConsistency(lineItems) {
  // This is a simplified implementation
  return {
    details: {},
    score: 3, // Placeholder score
  };
}

/**
 * Analyze the competitive moat
 *
 * @param {Array} metrics - Financial metrics
 * @returns {Object} - Analysis results
 */
function analyzeMoat(metrics) {
  // This is a simplified implementation
  return {
    details: {},
    score: 4,
    maxScore: 10,
  };
}

/**
 * Analyze pricing power
 *
 * @param {Array} lineItems - Financial line items
 * @param {Array} metrics - Financial metrics
 * @returns {Object} - Analysis results
 */
function analyzePricingPower(lineItems, metrics) {
  // This is a simplified implementation
  return {
    details: {},
    score: 3,
  };
}

/**
 * Analyze book value growth
 *
 * @param {Array} lineItems - Financial line items
 * @returns {Object} - Analysis results
 */
function analyzeBookValueGrowth(lineItems) {
  // This is a simplified implementation
  return {
    details: {},
    score: 3,
  };
}

/**
 * Analyze management quality
 *
 * @param {Array} lineItems - Financial line items
 * @returns {Object} - Analysis results
 */
function analyzeManagementQuality(lineItems) {
  // This is a simplified implementation
  return {
    details: {},
    score: 4,
    maxScore: 10,
  };
}

/**
 * Calculate intrinsic value
 *
 * @param {Array} lineItems - Financial line items
 * @returns {Object} - Analysis results
 */
function calculateIntrinsicValue(lineItems) {
  // This is a simplified implementation
  return {
    details: {},
    intrinsicValue: 0,
  };
}
