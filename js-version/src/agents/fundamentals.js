/**
 * Fundamentals Analyst Agent
 * Analyzes fundamental data and generates trading signals for multiple tickers.
 */
import { HumanMessage } from "langchain/schema";
import { showAgentReasoning } from "../graph/state.js";
import { getApiKeyFromState } from "../utils/api_key.js";
import { progress } from "../utils/progress.js";
import { getFinancialMetrics } from "../tools/api.js";

/**
 * Analyzes fundamental data and generates trading signals for multiple tickers
 *
 * @param {Object} state - The agent state
 * @param {string} agentId - The agent ID
 * @returns {Object} Updated state with fundamental analysis
 */
export function fundamentalsAnalystAgent(
  state,
  agentId = "fundamentals_analyst_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  // Initialize fundamental analysis for each ticker
  const fundamentalAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Fetching financial metrics");

    // Get the financial metrics
    const financialMetrics = getFinancialMetrics(
      ticker,
      endDate,
      "ttm",
      10,
      apiKey
    );

    if (!financialMetrics || financialMetrics.length === 0) {
      progress.updateStatus(
        agentId,
        ticker,
        "Failed: No financial metrics found"
      );
      continue;
    }

    // Pull the most recent financial metrics
    const metrics = financialMetrics[0];

    // Initialize signals list for different fundamental aspects
    const signals = [];
    const reasoning = {};

    progress.updateStatus(agentId, ticker, "Analyzing profitability");
    // 1. Profitability Analysis
    const returnOnEquity = metrics.return_on_equity;
    const netMargin = metrics.net_margin;
    const operatingMargin = metrics.operating_margin;

    const profitabilityThresholds = [
      [returnOnEquity, 0.15], // Strong ROE above 15%
      [netMargin, 0.2], // Healthy profit margins
      [operatingMargin, 0.15], // Strong operating efficiency
    ];

    const profitabilityScore = profitabilityThresholds.reduce(
      (score, [metric, threshold]) => {
        return (
          score +
          (metric !== null && metric !== undefined && metric > threshold
            ? 1
            : 0)
        );
      },
      0
    );

    signals.push(
      profitabilityScore >= 2
        ? "bullish"
        : profitabilityScore === 0
        ? "bearish"
        : "neutral"
    );
    reasoning.profitability_signal = {
      signal: signals[0],
      details:
        `${
          returnOnEquity
            ? `ROE: ${(returnOnEquity * 100).toFixed(2)}%`
            : "ROE: N/A"
        }, ` +
        `${
          netMargin
            ? `Net Margin: ${(netMargin * 100).toFixed(2)}%`
            : "Net Margin: N/A"
        }, ` +
        `${
          operatingMargin
            ? `Op Margin: ${(operatingMargin * 100).toFixed(2)}%`
            : "Op Margin: N/A"
        }`,
    };

    progress.updateStatus(agentId, ticker, "Analyzing growth");
    // 2. Growth Analysis
    const revenueGrowth = metrics.revenue_growth;
    const earningsGrowth = metrics.earnings_growth;
    const bookValueGrowth = metrics.book_value_growth;

    const growthThresholds = [
      [revenueGrowth, 0.1], // 10% revenue growth
      [earningsGrowth, 0.1], // 10% earnings growth
      [bookValueGrowth, 0.1], // 10% book value growth
    ];

    const growthScore = growthThresholds.reduce(
      (score, [metric, threshold]) => {
        return (
          score +
          (metric !== null && metric !== undefined && metric > threshold
            ? 1
            : 0)
        );
      },
      0
    );

    signals.push(
      growthScore >= 2 ? "bullish" : growthScore === 0 ? "bearish" : "neutral"
    );
    reasoning.growth_signal = {
      signal: signals[1],
      details:
        `${
          revenueGrowth
            ? `Revenue Growth: ${(revenueGrowth * 100).toFixed(2)}%`
            : "Revenue Growth: N/A"
        }, ` +
        `${
          earningsGrowth
            ? `Earnings Growth: ${(earningsGrowth * 100).toFixed(2)}%`
            : "Earnings Growth: N/A"
        }`,
    };

    progress.updateStatus(agentId, ticker, "Analyzing financial health");
    // 3. Financial Health
    const currentRatio = metrics.current_ratio;
    const debtToEquity = metrics.debt_to_equity;
    const freeCashFlowPerShare = metrics.free_cash_flow_per_share;
    const earningsPerShare = metrics.earnings_per_share;

    let healthScore = 0;
    if (currentRatio && currentRatio > 1.5) {
      // Strong liquidity
      healthScore += 1;
    }
    if (debtToEquity && debtToEquity < 0.5) {
      // Conservative debt levels
      healthScore += 1;
    }
    if (
      freeCashFlowPerShare &&
      earningsPerShare &&
      freeCashFlowPerShare > earningsPerShare * 0.8
    ) {
      // Strong FCF conversion
      healthScore += 1;
    }

    signals.push(
      healthScore >= 2 ? "bullish" : healthScore === 0 ? "bearish" : "neutral"
    );
    reasoning.financial_health_signal = {
      signal: signals[2],
      details:
        `${
          currentRatio
            ? `Current Ratio: ${currentRatio.toFixed(2)}`
            : "Current Ratio: N/A"
        }, ` +
        `${debtToEquity ? `D/E: ${debtToEquity.toFixed(2)}` : "D/E: N/A"}`,
    };

    progress.updateStatus(agentId, ticker, "Analyzing valuation ratios");
    // 4. Price to X ratios
    const peRatio = metrics.price_to_earnings_ratio;
    const pbRatio = metrics.price_to_book_ratio;
    const psRatio = metrics.price_to_sales_ratio;

    const priceThresholds = [
      [peRatio, 25], // Reasonable P/E ratio
      [pbRatio, 3], // Reasonable P/B ratio
      [psRatio, 5], // Reasonable P/S ratio
    ];

    const priceRatioScore = priceThresholds.reduce(
      (score, [metric, threshold]) => {
        return (
          score +
          (metric !== null && metric !== undefined && metric > threshold
            ? 1
            : 0)
        );
      },
      0
    );

    signals.push(
      priceRatioScore >= 2
        ? "bearish"
        : priceRatioScore === 0
        ? "bullish"
        : "neutral"
    );
    reasoning.price_ratios_signal = {
      signal: signals[3],
      details:
        `${peRatio ? `P/E: ${peRatio.toFixed(2)}` : "P/E: N/A"}, ` +
        `${pbRatio ? `P/B: ${pbRatio.toFixed(2)}` : "P/B: N/A"}, ` +
        `${psRatio ? `P/S: ${psRatio.toFixed(2)}` : "P/S: N/A"}`,
    };

    progress.updateStatus(agentId, ticker, "Calculating final signal");
    // Determine overall signal
    const bullishSignals = signals.filter(
      (signal) => signal === "bullish"
    ).length;
    const bearishSignals = signals.filter(
      (signal) => signal === "bearish"
    ).length;

    let overallSignal;
    if (bullishSignals > bearishSignals) {
      overallSignal = "bullish";
    } else if (bearishSignals > bullishSignals) {
      overallSignal = "bearish";
    } else {
      overallSignal = "neutral";
    }

    // Calculate confidence level
    const totalSignals = signals.length;
    const confidence = Math.round(
      (Math.max(bullishSignals, bearishSignals) / totalSignals) * 100
    );

    fundamentalAnalysis[ticker] = {
      signal: overallSignal,
      confidence,
      reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: JSON.stringify(reasoning, null, 4),
    });
  }

  // Create the fundamental analysis message
  const message = new HumanMessage({
    content: JSON.stringify(fundamentalAnalysis),
    name: agentId,
  });

  // Print the reasoning if the flag is set
  if (state.metadata.show_reasoning) {
    showAgentReasoning(fundamentalAnalysis, "Fundamental Analysis Agent");
  }

  // Add the signal to the analyst_signals list
  state.data.analyst_signals = state.data.analyst_signals || {};
  state.data.analyst_signals[agentId] = fundamentalAnalysis;

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [message],
    data,
  };
}
