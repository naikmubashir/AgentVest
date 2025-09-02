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

// Define the schema for Mohnish Pabrai's analysis signal
const MohnishPabraiSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Mohnish Pabrai's value investing approach:
 * - Looks for "heads I win, tails I don't lose much" opportunities
 * - Focuses on simple businesses with understandable models
 * - Values low valuation multiples and high margin of safety
 * - Prefers companies with low downside risk but high upside potential
 * - Avoids excessive debt and complex corporate structures
 * - Clones successful strategies from other investors
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Mohnish Pabrai's analysis
 */
export async function mohnishPabraiAgent(
  state,
  agentId = "mohnish_pabrai_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const pabraiAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Gathering financial metrics");
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
        "operating_income",
        "total_assets",
        "total_liabilities",
        "shareholders_equity",
        "cash_and_equivalents",
        "total_debt",
        "tangible_book_value",
        "return_on_equity",
        "return_on_assets",
      ],
      endDate,
      "annual",
      5,
      apiKey
    );

    // Perform sub-analyses:
    progress.updateStatus(agentId, ticker, "Analyzing margin of safety");
    const safetyAnalysis = analyzeMarginOfSafety(financialLineItems, marketCap);

    progress.updateStatus(agentId, ticker, "Analyzing business simplicity");
    const simplicityAnalysis = analyzeBusinessSimplicity(
      metrics,
      financialLineItems
    );

    progress.updateStatus(agentId, ticker, "Analyzing upside potential");
    const upsideAnalysis = analyzeUpsidePotential(
      financialLineItems,
      marketCap
    );

    progress.updateStatus(agentId, ticker, "Analyzing financial health");
    const healthAnalysis = analyzeFinancialHealth(financialLineItems);

    // Combine partial scores with weights according to Pabrai's priorities:
    // 40% Margin of Safety, 25% Business Simplicity, 20% Upside Potential, 15% Financial Health
    const totalScore =
      safetyAnalysis.score * 0.4 +
      simplicityAnalysis.score * 0.25 +
      upsideAnalysis.score * 0.2 +
      healthAnalysis.score * 0.15;

    const maxPossibleScore = 10.0;

    // Map final score to signal
    let signal;
    if (totalScore >= 7.0) {
      signal = "bullish";
    } else if (totalScore <= 4.0) {
      signal = "bearish";
    } else {
      signal = "neutral";
    }

    analysisData[ticker] = {
      signal,
      score: totalScore,
      maxScore: maxPossibleScore,
      safetyAnalysis,
      simplicityAnalysis,
      upsideAnalysis,
      healthAnalysis,
    };

    progress.updateStatus(
      agentId,
      ticker,
      "Generating Mohnish Pabrai analysis"
    );
    const pabraiOutput = await generatePabraiOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    pabraiAnalysis[ticker] = {
      signal: pabraiOutput.signal,
      confidence: pabraiOutput.confidence,
      reasoning: pabraiOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: pabraiOutput.reasoning,
    });
  }

  // Save signals to state
  if (!state.data.analyst_signals) {
    state.data.analyst_signals = {};
  }
  state.data.analyst_signals[agentId] = pabraiAnalysis;

  if (state.metadata?.show_reasoning) {
    showAgentReasoning(pabraiAnalysis, "Mohnish Pabrai Agent");
  }

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(pabraiAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Analyze the margin of safety
 * @param {Array} financialLineItems - Financial data
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Analysis results
 */
function analyzeMarginOfSafety(financialLineItems, marketCap) {
  if (!financialLineItems || !marketCap) {
    return {
      score: 0,
      details: "Insufficient data for margin of safety analysis",
    };
  }

  const details = [];
  let rawScore = 0;

  // 1) Price to Book Value - Pabrai loves bargains
  const tangibleBookValues = financialLineItems
    .filter(
      (fi) =>
        fi.tangible_book_value !== null && fi.tangible_book_value !== undefined
    )
    .map((fi) => fi.tangible_book_value);

  if (tangibleBookValues.length > 0 && tangibleBookValues[0] > 0) {
    const priceToBookRatio = marketCap / tangibleBookValues[0];

    details.push(`Price to tangible book: ${priceToBookRatio.toFixed(2)}`);

    if (priceToBookRatio < 1.0) {
      rawScore += 4;
      details.push(
        "Trading below tangible book value (significant margin of safety)"
      );
    } else if (priceToBookRatio < 1.5) {
      rawScore += 3;
      details.push("Trading at modest premium to tangible book value");
    } else if (priceToBookRatio < 2.5) {
      rawScore += 1;
      details.push("Trading at moderate premium to tangible book value");
    } else {
      details.push("Trading at high premium to tangible book value");
    }
  } else {
    details.push("No tangible book value data available");
  }

  // 2) P/E Ratio - Pabrai likes low P/E ratios
  const netIncomes = financialLineItems
    .filter((fi) => fi.net_income !== null && fi.net_income !== undefined)
    .map((fi) => fi.net_income);

  if (netIncomes.length > 0 && netIncomes[0] > 0) {
    const pe = marketCap / netIncomes[0];

    details.push(`P/E ratio: ${pe.toFixed(2)}`);

    if (pe < 10) {
      rawScore += 3;
      details.push("Very low P/E ratio (significant margin of safety)");
    } else if (pe < 15) {
      rawScore += 2;
      details.push("Attractive P/E ratio");
    } else if (pe < 20) {
      rawScore += 1;
      details.push("Moderate P/E ratio");
    } else {
      details.push("High P/E ratio");
    }
  } else {
    details.push("No positive earnings data available for P/E calculation");
  }

  // 3) Asset-based valuation - Pabrai often looks at assets minus liabilities
  const totalAssets = financialLineItems
    .filter((fi) => fi.total_assets !== null && fi.total_assets !== undefined)
    .map((fi) => fi.total_assets);

  const totalLiabilities = financialLineItems
    .filter(
      (fi) =>
        fi.total_liabilities !== null && fi.total_liabilities !== undefined
    )
    .map((fi) => fi.total_liabilities);

  if (totalAssets.length > 0 && totalLiabilities.length > 0) {
    const netAssets = totalAssets[0] - totalLiabilities[0];

    if (netAssets > 0) {
      const priceToNetAssets = marketCap / netAssets;

      details.push(`Price to net assets: ${priceToNetAssets.toFixed(2)}`);

      if (priceToNetAssets < 0.8) {
        rawScore += 3;
        details.push("Trading significantly below net asset value");
      } else if (priceToNetAssets < 1.2) {
        rawScore += 2;
        details.push("Trading near net asset value");
      } else if (priceToNetAssets < 2.0) {
        rawScore += 1;
        details.push("Trading at moderate premium to net asset value");
      } else {
        details.push("Trading at high premium to net asset value");
      }
    } else {
      details.push("Negative net assets");
    }
  } else {
    details.push("Insufficient asset/liability data");
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, rawScore);
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze business simplicity
 * @param {Object} metrics - Financial metrics
 * @param {Array} financialLineItems - Financial data
 * @returns {Object} - Analysis results
 */
function analyzeBusinessSimplicity(metrics, financialLineItems) {
  if (!metrics && (!financialLineItems || financialLineItems.length === 0)) {
    return {
      score: 5,
      details: "Insufficient data for business simplicity analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Business model consistency (revenue and earnings stability)
  const revenues = financialLineItems
    .filter((fi) => fi.revenue !== null && fi.revenue !== undefined)
    .map((fi) => fi.revenue);

  const netIncomes = financialLineItems
    .filter((fi) => fi.net_income !== null && fi.net_income !== undefined)
    .map((fi) => fi.net_income);

  if (revenues.length >= 3) {
    // Calculate volatility in revenue
    const revenueGrowthRates = [];
    for (let i = 0; i < revenues.length - 1; i++) {
      if (revenues[i + 1] > 0) {
        revenueGrowthRates.push(
          (revenues[i] - revenues[i + 1]) / revenues[i + 1]
        );
      }
    }

    if (revenueGrowthRates.length >= 2) {
      const avgGrowth =
        revenueGrowthRates.reduce((sum, rate) => sum + rate, 0) /
        revenueGrowthRates.length;
      const volatility = Math.sqrt(
        revenueGrowthRates.reduce(
          (sum, rate) => sum + Math.pow(rate - avgGrowth, 2),
          0
        ) / revenueGrowthRates.length
      );

      if (volatility < 0.1) {
        rawScore += 2;
        details.push(
          "Very stable revenue growth (simple, predictable business)"
        );
      } else if (volatility < 0.2) {
        rawScore += 1;
        details.push("Moderately stable revenue growth");
      } else if (volatility > 0.3) {
        rawScore -= 1;
        details.push(
          "Highly volatile revenue growth (complex, unpredictable business)"
        );
      }
    }
  }

  if (netIncomes.length >= 3) {
    // Check for consistent profitability
    const consistentlyProfitable = netIncomes.every((income) => income > 0);

    if (consistentlyProfitable) {
      rawScore += 2;
      details.push("Consistently profitable (indicates business simplicity)");
    } else {
      const profitableYears = netIncomes.filter((income) => income > 0).length;
      const profitabilityRatio = profitableYears / netIncomes.length;

      if (profitabilityRatio >= 0.8) {
        rawScore += 1;
        details.push(
          `Mostly profitable (${profitableYears} of ${netIncomes.length} years)`
        );
      } else if (profitabilityRatio <= 0.2) {
        rawScore -= 1;
        details.push(
          `Rarely profitable (${profitableYears} of ${netIncomes.length} years)`
        );
      }
    }
  }

  // 2) Margin consistency - Pabrai likes stable margins that are easy to understand
  const operatingMargins = financialLineItems
    .filter(
      (fi) =>
        fi.operating_income !== null &&
        fi.operating_income !== undefined &&
        fi.revenue > 0
    )
    .map((fi) => fi.operating_income / fi.revenue);

  if (operatingMargins.length >= 3) {
    const avgMargin =
      operatingMargins.reduce((sum, margin) => sum + margin, 0) /
      operatingMargins.length;
    const marginVolatility = Math.sqrt(
      operatingMargins.reduce(
        (sum, margin) => sum + Math.pow(margin - avgMargin, 2),
        0
      ) / operatingMargins.length
    );

    if (marginVolatility < 0.02) {
      rawScore += 2;
      details.push(
        "Very stable operating margins (simple, predictable business)"
      );
    } else if (marginVolatility < 0.05) {
      rawScore += 1;
      details.push("Moderately stable operating margins");
    } else if (marginVolatility > 0.1) {
      rawScore -= 1;
      details.push(
        "Highly volatile operating margins (complex, unpredictable business)"
      );
    }
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze upside potential
 * @param {Array} financialLineItems - Financial data
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Analysis results
 */
function analyzeUpsidePotential(financialLineItems, marketCap) {
  if (!financialLineItems || !marketCap) {
    return {
      score: 5,
      details: "Insufficient data for upside potential analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Return on Equity - Pabrai likes businesses that can compound capital
  const roeValues = financialLineItems
    .filter(
      (fi) => fi.return_on_equity !== null && fi.return_on_equity !== undefined
    )
    .map((fi) => fi.return_on_equity);

  if (roeValues.length > 0) {
    const averageRoe =
      roeValues.reduce((sum, roe) => sum + roe, 0) / roeValues.length;

    if (averageRoe > 0.2) {
      rawScore += 3;
      details.push(
        `Excellent average ROE: ${(averageRoe * 100).toFixed(
          1
        )}% (high compounding potential)`
      );
    } else if (averageRoe > 0.15) {
      rawScore += 2;
      details.push(`Good average ROE: ${(averageRoe * 100).toFixed(1)}%`);
    } else if (averageRoe > 0.1) {
      rawScore += 1;
      details.push(`Decent average ROE: ${(averageRoe * 100).toFixed(1)}%`);
    } else if (averageRoe <= 0.05) {
      rawScore -= 1;
      details.push(
        `Poor average ROE: ${(averageRoe * 100).toFixed(
          1
        )}% (limited compounding potential)`
      );
    }
  } else {
    details.push("No ROE data available");
  }

  // 2) Earnings Growth Potential
  const netIncomes = financialLineItems
    .filter((fi) => fi.net_income !== null && fi.net_income !== undefined)
    .map((fi) => fi.net_income);

  if (netIncomes.length >= 3) {
    const latestIncome = netIncomes[0];
    const oldestIncome = netIncomes[netIncomes.length - 1];

    if (oldestIncome > 0 && latestIncome > oldestIncome) {
      const years = netIncomes.length - 1;
      const cagr = Math.pow(latestIncome / oldestIncome, 1 / years) - 1;

      if (cagr > 0.2) {
        rawScore += 2;
        details.push(
          `Strong historical earnings CAGR: ${(cagr * 100).toFixed(1)}%`
        );
      } else if (cagr > 0.1) {
        rawScore += 1;
        details.push(
          `Good historical earnings CAGR: ${(cagr * 100).toFixed(1)}%`
        );
      } else {
        details.push(
          `Modest historical earnings CAGR: ${(cagr * 100).toFixed(1)}%`
        );
      }
    } else if (latestIncome < oldestIncome) {
      rawScore -= 1;
      details.push("Declining earnings trend (limited upside potential)");
    }
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze financial health
 * @param {Array} financialLineItems - Financial data
 * @returns {Object} - Analysis results
 */
function analyzeFinancialHealth(financialLineItems) {
  if (!financialLineItems || financialLineItems.length === 0) {
    return {
      score: 5,
      details: "Insufficient data for financial health analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Debt to Equity - Pabrai avoids excessive debt
  const debtValues = financialLineItems
    .filter((fi) => fi.total_debt !== null && fi.total_debt !== undefined)
    .map((fi) => fi.total_debt);

  const equityValues = financialLineItems
    .filter(
      (fi) =>
        fi.shareholders_equity !== null && fi.shareholders_equity !== undefined
    )
    .map((fi) => fi.shareholders_equity);

  if (
    debtValues.length > 0 &&
    equityValues.length > 0 &&
    debtValues.length === equityValues.length &&
    equityValues[0] > 0
  ) {
    const debtToEquity = debtValues[0] / equityValues[0];

    details.push(`Debt to equity ratio: ${debtToEquity.toFixed(2)}`);

    if (debtToEquity < 0.3) {
      rawScore += 3;
      details.push("Very low debt (strong financial position)");
    } else if (debtToEquity < 0.7) {
      rawScore += 2;
      details.push("Manageable debt levels");
    } else if (debtToEquity < 1.2) {
      details.push("Moderate debt levels");
    } else if (debtToEquity > 2.0) {
      rawScore -= 2;
      details.push("High debt levels (potential financial risk)");
    } else {
      rawScore -= 1;
      details.push("Above average debt levels");
    }
  } else if (equityValues.length > 0 && equityValues[0] <= 0) {
    rawScore -= 3;
    details.push("Negative equity (high financial risk)");
  } else {
    details.push("Insufficient debt/equity data");
  }

  // 2) Cash position - Pabrai likes companies with adequate cash reserves
  const cashValues = financialLineItems
    .filter(
      (fi) =>
        fi.cash_and_equivalents !== null &&
        fi.cash_and_equivalents !== undefined
    )
    .map((fi) => fi.cash_and_equivalents);

  if (cashValues.length > 0 && debtValues.length > 0) {
    const cashToDebt = debtValues[0] > 0 ? cashValues[0] / debtValues[0] : 999;

    if (cashToDebt > 1.0) {
      rawScore += 2;
      details.push("Cash exceeds total debt (excellent liquidity)");
    } else if (cashToDebt > 0.5) {
      rawScore += 1;
      details.push("Strong cash position relative to debt");
    } else if (cashToDebt < 0.2) {
      rawScore -= 1;
      details.push("Low cash relative to debt (liquidity concern)");
    }
  } else if (cashValues.length > 0 && debtValues.length === 0) {
    rawScore += 2;
    details.push("Strong cash position with minimal debt");
  } else {
    details.push("Insufficient cash data");
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Generate the final analysis output using LLM
 * @param {string} ticker - Stock ticker
 * @param {Object} analysis - Analysis data
 * @param {Object} state - Current state
 * @param {string} agentId - Agent identifier
 * @returns {Object} - Final output with signal, confidence, and reasoning
 */
async function generatePabraiOutput(ticker, analysis, state, agentId) {
  const prompt = `
You are analyzing ${ticker} using Mohnish Pabrai's investment approach. Here's the data:

MARGIN OF SAFETY ANALYSIS:
${analysis.safetyAnalysis.details}

BUSINESS SIMPLICITY ANALYSIS:
${analysis.simplicityAnalysis.details}

UPSIDE POTENTIAL ANALYSIS:
${analysis.upsideAnalysis.details}

FINANCIAL HEALTH ANALYSIS:
${analysis.healthAnalysis.details}

Based on this analysis and using Mohnish Pabrai's methodology:
1. The overall score is ${analysis.score.toFixed(
    1
  )} out of ${analysis.maxScore.toFixed(1)}
2. The preliminary signal is "${analysis.signal}"

As Mohnish Pabrai, provide your final investment recommendation:
1. Signal: bullish, bearish, or neutral
2. Confidence: 0-100 (where 100 is highest confidence)
3. Reasoning: A concise summary explaining the recommendation

Remember Pabrai's key principles:
- Look for "heads I win, tails I don't lose much" opportunities
- Focus on simple businesses with understandable models
- Value low valuation multiples and high margin of safety
- Prefer companies with low downside risk but high upside potential
- Avoid excessive debt and complex corporate structures

Respond ONLY with a JSON object in this format:
{
  "signal": "bullish|bearish|neutral",
  "confidence": <0-100>,
  "reasoning": "<explanation>"
}
`;

  try {
    const result = await callLLM(prompt, {
      model: state.metadata?.llm_model || "gpt-4",
      temperature: 0.1,
      max_tokens: 800,
      stop: ["}"],
    });

    // Parse LLM response to get valid JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in LLM response");
    }

    const jsonStr = jsonMatch[0];
    const responseData = JSON.parse(jsonStr);

    // Validate with Zod schema
    return MohnishPabraiSignalSchema.parse(responseData);
  } catch (error) {
    console.error(`Error generating Pabrai output for ${ticker}:`, error);

    // Return fallback output
    return {
      signal: analysis.signal,
      confidence: analysis.score * 10, // Convert 0-10 score to 0-100 confidence
      reasoning: `Based on Mohnish Pabrai's principles, ${ticker} shows ${
        analysis.signal
      } indicators with key factors including: ${
        analysis.safetyAnalysis.details.split(";")[0]
      }; ${analysis.simplicityAnalysis.details.split(";")[0]}; ${
        analysis.financialHealth.details?.split(";")[0] ||
        "moderate financial health"
      }.`,
    };
  }
}
