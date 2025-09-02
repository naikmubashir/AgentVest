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

// Define the schema for Valuation Analyst's analysis signal
const ValuationSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using multifaceted valuation methodologies:
 * - Applies multiple valuation models (DCF, Multiples, etc.)
 * - Compares current valuation against historical averages
 * - Evaluates valuation relative to peers and sector
 * - Assesses valuation in context of growth rates (PEG)
 * - Considers both absolute and relative value
 * - Estimates margin of safety and fair value range
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Valuation analysis
 */
export async function valuationAnalystAgent(
  state,
  agentId = "valuation_analyst_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const valuationAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Gathering financial metrics");
    // We don't currently use metrics, but we could add it to the analysis in the future
    await getFinancialMetrics(ticker, endDate, "annual", 5, apiKey);

    progress.updateStatus(agentId, ticker, "Getting market cap");
    const marketCap = await getMarketCap(ticker, endDate, apiKey);

    progress.updateStatus(agentId, ticker, "Gathering financial line items");
    const financialLineItems = await searchLineItems(
      ticker,
      [
        "revenue",
        "net_income",
        "operating_income",
        "ebitda",
        "total_assets",
        "total_liabilities",
        "shareholders_equity",
        "free_cash_flow",
        "earnings_per_share",
        "book_value_per_share",
        "dividend_per_share",
        "return_on_equity",
        "outstanding_shares",
        "capital_expenditure",
      ],
      endDate,
      "annual",
      5,
      apiKey
    );

    // Perform sub-analyses:
    progress.updateStatus(agentId, ticker, "Analyzing earnings multiples");
    const earningsAnalysis = analyzeEarningsMultiples(
      financialLineItems,
      marketCap
    );

    progress.updateStatus(agentId, ticker, "Analyzing cash flow valuation");
    const cashFlowAnalysis = analyzeCashFlowValuation(
      financialLineItems,
      marketCap
    );

    progress.updateStatus(agentId, ticker, "Analyzing asset-based valuation");
    const assetAnalysis = analyzeAssetValuation(financialLineItems, marketCap);

    progress.updateStatus(
      agentId,
      ticker,
      "Analyzing growth-adjusted valuation"
    );
    const growthAnalysis = analyzeGrowthAdjusted(financialLineItems, marketCap);

    // Combine partial scores with equal weights for a balanced valuation approach
    const totalScore =
      earningsAnalysis.score * 0.3 +
      cashFlowAnalysis.score * 0.3 +
      assetAnalysis.score * 0.2 +
      growthAnalysis.score * 0.2;

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
      earningsAnalysis,
      cashFlowAnalysis,
      assetAnalysis,
      growthAnalysis,
    };

    progress.updateStatus(agentId, ticker, "Generating valuation analysis");
    const valuationOutput = await generateValuationOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    valuationAnalysis[ticker] = {
      signal: valuationOutput.signal,
      confidence: valuationOutput.confidence,
      reasoning: valuationOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: valuationOutput.reasoning,
    });
  }

  // Save signals to state
  if (!state.data.analyst_signals) {
    state.data.analyst_signals = {};
  }
  state.data.analyst_signals[agentId] = valuationAnalysis;

  if (state.metadata?.show_reasoning) {
    showAgentReasoning(valuationAnalysis, "Valuation Analyst");
  }

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(valuationAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Analyze earnings-based multiples
 * @param {Array} financialLineItems - Financial data
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Analysis results
 */
function analyzeEarningsMultiples(financialLineItems, marketCap) {
  if (!financialLineItems || !marketCap) {
    return {
      score: 5,
      details: "Insufficient data for earnings multiples analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) P/E Ratio Analysis
  const epsValues = financialLineItems
    .filter(
      (fi) =>
        fi.earnings_per_share !== null && fi.earnings_per_share !== undefined
    )
    .map((fi) => fi.earnings_per_share);

  const sharesValues = financialLineItems
    .filter(
      (fi) =>
        fi.outstanding_shares !== null && fi.outstanding_shares !== undefined
    )
    .map((fi) => fi.outstanding_shares);

  if (
    epsValues.length > 0 &&
    epsValues[0] > 0 &&
    sharesValues.length > 0 &&
    sharesValues[0] > 0
  ) {
    const ttmEarnings = epsValues[0] * sharesValues[0];
    const pe = marketCap / ttmEarnings;

    details.push(`P/E ratio: ${pe.toFixed(2)}`);

    // Basic P/E evaluation
    if (pe < 10) {
      rawScore += 3;
      details.push("Very low P/E ratio (potentially undervalued)");
    } else if (pe < 15) {
      rawScore += 2;
      details.push("Below average P/E ratio");
    } else if (pe < 20) {
      rawScore += 1;
      details.push("Average P/E ratio");
    } else if (pe > 30) {
      rawScore -= 2;
      details.push("High P/E ratio (potentially overvalued)");
    } else if (pe > 25) {
      rawScore -= 1;
      details.push("Above average P/E ratio");
    }

    // Historical P/E comparison if we have enough data
    if (epsValues.length >= 3 && sharesValues.length >= 3) {
      const historicalEarnings = [];

      for (
        let i = 1;
        i < Math.min(epsValues.length, sharesValues.length);
        i++
      ) {
        if (epsValues[i] > 0 && sharesValues[i] > 0) {
          historicalEarnings.push(epsValues[i] * sharesValues[i]);
        }
      }

      if (historicalEarnings.length > 0) {
        const avgHistoricalEarnings =
          historicalEarnings.reduce((sum, e) => sum + e, 0) /
          historicalEarnings.length;
        const impliedHistoricalPE = marketCap / avgHistoricalEarnings;

        details.push(
          `P/E based on average historical earnings: ${impliedHistoricalPE.toFixed(
            2
          )}`
        );

        if (impliedHistoricalPE < pe * 0.8) {
          details.push(
            "Current earnings below historical average (potential cyclical low)"
          );
          rawScore += 1;
        } else if (impliedHistoricalPE > pe * 1.2) {
          details.push(
            "Current earnings above historical average (potential cyclical high)"
          );
          rawScore -= 1;
        }
      }
    }
  } else {
    details.push(
      "Cannot calculate P/E ratio (negative earnings or missing data)"
    );
  }

  // 2) EV/EBITDA Analysis - often considered a better metric than P/E
  const ebitdaValues = financialLineItems
    .filter((fi) => fi.ebitda !== null && fi.ebitda !== undefined)
    .map((fi) => fi.ebitda);

  const debtValues = financialLineItems
    .filter(
      (fi) =>
        fi.total_liabilities !== null && fi.total_liabilities !== undefined
    )
    .map((fi) => fi.total_liabilities);

  if (ebitdaValues.length > 0 && ebitdaValues[0] > 0 && debtValues.length > 0) {
    // Enterprise Value = Market Cap + Debt - Cash
    // For simplicity, we'll just use Market Cap + Debt as an approximation
    const ev = marketCap + debtValues[0];
    const evToEbitda = ev / ebitdaValues[0];

    details.push(`EV/EBITDA: ${evToEbitda.toFixed(2)}`);

    if (evToEbitda < 6) {
      rawScore += 3;
      details.push("Very low EV/EBITDA (potentially undervalued)");
    } else if (evToEbitda < 8) {
      rawScore += 2;
      details.push("Below average EV/EBITDA");
    } else if (evToEbitda < 10) {
      rawScore += 1;
      details.push("Average EV/EBITDA");
    } else if (evToEbitda > 14) {
      rawScore -= 2;
      details.push("High EV/EBITDA (potentially overvalued)");
    } else if (evToEbitda > 12) {
      rawScore -= 1;
      details.push("Above average EV/EBITDA");
    }
  } else {
    details.push(
      "Cannot calculate EV/EBITDA (negative EBITDA or missing data)"
    );
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze cash flow-based valuation
 * @param {Array} financialLineItems - Financial data
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Analysis results
 */
function analyzeCashFlowValuation(financialLineItems, marketCap) {
  if (!financialLineItems || !marketCap) {
    return {
      score: 5,
      details: "Insufficient data for cash flow valuation analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Free Cash Flow Yield
  const fcfValues = financialLineItems
    .filter(
      (fi) => fi.free_cash_flow !== null && fi.free_cash_flow !== undefined
    )
    .map((fi) => fi.free_cash_flow);

  if (fcfValues.length > 0 && fcfValues[0] !== 0) {
    const fcfYield = fcfValues[0] / marketCap;

    details.push(`FCF Yield: ${(fcfYield * 100).toFixed(2)}%`);

    if (fcfYield > 0.08) {
      rawScore += 3;
      details.push("Very high FCF yield (potentially undervalued)");
    } else if (fcfYield > 0.06) {
      rawScore += 2;
      details.push("Above average FCF yield");
    } else if (fcfYield > 0.04) {
      rawScore += 1;
      details.push("Average FCF yield");
    } else if (fcfYield < 0) {
      rawScore -= 2;
      details.push("Negative FCF yield (concerning)");
    } else if (fcfYield < 0.02) {
      rawScore -= 1;
      details.push("Low FCF yield (potentially overvalued)");
    }

    // FCF Consistency Check
    if (fcfValues.length >= 3) {
      const consistentlyPositive = fcfValues.every((fcf) => fcf > 0);

      if (consistentlyPositive) {
        rawScore += 1;
        details.push("Consistently positive FCF (quality indicator)");
      } else {
        const positiveYears = fcfValues.filter((fcf) => fcf > 0).length;

        if (positiveYears === 0) {
          rawScore -= 2;
          details.push("No positive FCF in analyzed period (concerning)");
        } else if (positiveYears < fcfValues.length / 2) {
          rawScore -= 1;
          details.push(
            `Limited FCF generation: positive in ${positiveYears} of ${fcfValues.length} years`
          );
        }
      }
    }
  } else {
    details.push("Cannot calculate FCF yield (missing or zero FCF data)");
  }

  // 2) Price to Operating Cash Flow
  const operatingIncomeValues = financialLineItems
    .filter(
      (fi) => fi.operating_income !== null && fi.operating_income !== undefined
    )
    .map((fi) => fi.operating_income);

  if (operatingIncomeValues.length > 0 && operatingIncomeValues[0] > 0) {
    const priceToOperatingCF = marketCap / operatingIncomeValues[0];

    details.push(
      `Price to Operating Cash Flow: ${priceToOperatingCF.toFixed(2)}`
    );

    if (priceToOperatingCF < 8) {
      rawScore += 2;
      details.push(
        "Low price to operating cash flow (potentially undervalued)"
      );
    } else if (priceToOperatingCF < 12) {
      rawScore += 1;
      details.push("Moderate price to operating cash flow");
    } else if (priceToOperatingCF > 20) {
      rawScore -= 2;
      details.push(
        "High price to operating cash flow (potentially overvalued)"
      );
    } else if (priceToOperatingCF > 15) {
      rawScore -= 1;
      details.push("Above average price to operating cash flow");
    }
  } else {
    details.push(
      "Cannot calculate price to operating cash flow (negative or missing data)"
    );
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze asset-based valuation
 * @param {Array} financialLineItems - Financial data
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Analysis results
 */
function analyzeAssetValuation(financialLineItems, marketCap) {
  if (!financialLineItems || !marketCap) {
    return {
      score: 5,
      details: "Insufficient data for asset-based valuation analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Price to Book Ratio
  const bookValues = financialLineItems
    .filter(
      (fi) =>
        fi.book_value_per_share !== null &&
        fi.book_value_per_share !== undefined
    )
    .map((fi) => fi.book_value_per_share);

  const sharesValues = financialLineItems
    .filter(
      (fi) =>
        fi.outstanding_shares !== null && fi.outstanding_shares !== undefined
    )
    .map((fi) => fi.outstanding_shares);

  if (
    bookValues.length > 0 &&
    bookValues[0] > 0 &&
    sharesValues.length > 0 &&
    sharesValues[0] > 0
  ) {
    const totalBookValue = bookValues[0] * sharesValues[0];
    const priceToBook = marketCap / totalBookValue;

    details.push(`Price to Book ratio: ${priceToBook.toFixed(2)}`);

    if (priceToBook < 1.0) {
      rawScore += 3;
      details.push("Trading below book value (deep value territory)");
    } else if (priceToBook < 1.5) {
      rawScore += 2;
      details.push("Low price to book ratio");
    } else if (priceToBook < 2.5) {
      rawScore += 1;
      details.push("Moderate price to book ratio");
    } else if (priceToBook > 5.0) {
      rawScore -= 2;
      details.push("Very high price to book ratio (potentially overvalued)");
    } else if (priceToBook > 3.0) {
      rawScore -= 1;
      details.push("High price to book ratio");
    }

    // Adjust based on ROE - higher P/B can be justified with higher ROE
    const roeValues = financialLineItems
      .filter(
        (fi) =>
          fi.return_on_equity !== null && fi.return_on_equity !== undefined
      )
      .map((fi) => fi.return_on_equity);

    if (roeValues.length > 0) {
      const latestRoe = roeValues[0];

      // Adjust score based on ROE vs P/B relationship
      if (priceToBook > 3.0 && latestRoe > 0.2) {
        rawScore += 1;
        details.push(
          `High P/B justified by strong ROE of ${(latestRoe * 100).toFixed(1)}%`
        );
      } else if (priceToBook < 1.5 && latestRoe < 0.08) {
        rawScore -= 1;
        details.push(
          `Low P/B may be warranted due to weak ROE of ${(
            latestRoe * 100
          ).toFixed(1)}%`
        );
      }
    }
  } else {
    details.push(
      "Cannot calculate price to book ratio (negative book value or missing data)"
    );
  }

  // 2) Net Asset Value Analysis
  const assetValues = financialLineItems
    .filter((fi) => fi.total_assets !== null && fi.total_assets !== undefined)
    .map((fi) => fi.total_assets);

  const liabilityValues = financialLineItems
    .filter(
      (fi) =>
        fi.total_liabilities !== null && fi.total_liabilities !== undefined
    )
    .map((fi) => fi.total_liabilities);

  if (assetValues.length > 0 && liabilityValues.length > 0) {
    const netAssets = assetValues[0] - liabilityValues[0];

    if (netAssets > 0) {
      const priceToNetAssets = marketCap / netAssets;

      details.push(`Price to Net Assets: ${priceToNetAssets.toFixed(2)}`);

      if (priceToNetAssets < 0.8) {
        rawScore += 3;
        details.push("Trading below net asset value (significant discount)");
      } else if (priceToNetAssets < 1.2) {
        rawScore += 2;
        details.push("Trading near net asset value");
      } else if (priceToNetAssets < 2.0) {
        rawScore += 1;
        details.push("Moderate premium to net asset value");
      } else if (priceToNetAssets > 3.0) {
        rawScore -= 1;
        details.push("High premium to net asset value");
      }
    } else {
      details.push("Negative net asset value");
      rawScore -= 1;
    }
  } else {
    details.push("Cannot calculate net asset value (missing data)");
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze growth-adjusted valuation
 * @param {Array} financialLineItems - Financial data
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Analysis results
 */
function analyzeGrowthAdjusted(financialLineItems, marketCap) {
  if (!financialLineItems || !marketCap) {
    return {
      score: 5,
      details: "Insufficient data for growth-adjusted valuation analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) PEG Ratio Analysis
  const epsValues = financialLineItems
    .filter(
      (fi) =>
        fi.earnings_per_share !== null && fi.earnings_per_share !== undefined
    )
    .map((fi) => fi.earnings_per_share);

  const sharesValues = financialLineItems
    .filter(
      (fi) =>
        fi.outstanding_shares !== null && fi.outstanding_shares !== undefined
    )
    .map((fi) => fi.outstanding_shares);

  if (
    epsValues.length >= 3 &&
    epsValues[0] > 0 &&
    epsValues[epsValues.length - 1] > 0 &&
    sharesValues.length > 0 &&
    sharesValues[0] > 0
  ) {
    // Calculate P/E
    const ttmEarnings = epsValues[0] * sharesValues[0];
    const pe = marketCap / ttmEarnings;

    // Calculate EPS Growth Rate
    const latestEps = epsValues[0];
    const oldestEps = epsValues[epsValues.length - 1];
    const years = epsValues.length - 1;

    const growthRate = Math.pow(latestEps / oldestEps, 1 / years) - 1;
    const annualGrowthPercent = growthRate * 100;

    if (annualGrowthPercent > 0) {
      const peg = pe / annualGrowthPercent;

      details.push(
        `PEG ratio: ${peg.toFixed(2)} (P/E: ${pe.toFixed(
          2
        )}, Growth: ${annualGrowthPercent.toFixed(1)}%)`
      );

      if (peg < 0.75) {
        rawScore += 3;
        details.push(
          "Very low PEG ratio (potentially undervalued relative to growth)"
        );
      } else if (peg < 1.0) {
        rawScore += 2;
        details.push(
          "Below average PEG ratio (favorable growth-adjusted valuation)"
        );
      } else if (peg < 1.5) {
        rawScore += 1;
        details.push("Average PEG ratio");
      } else if (peg > 2.5) {
        rawScore -= 2;
        details.push(
          "High PEG ratio (potentially overvalued relative to growth)"
        );
      } else if (peg > 1.5) {
        rawScore -= 1;
        details.push("Above average PEG ratio");
      }
    } else {
      details.push(
        `Negative historical EPS growth (${annualGrowthPercent.toFixed(1)}%)`
      );
      rawScore -= 1;
    }
  } else {
    details.push(
      "Cannot calculate PEG ratio (insufficient earnings history or negative earnings)"
    );
  }

  // 2) Revenue Growth vs. Price-to-Sales
  const revenueValues = financialLineItems
    .filter((fi) => fi.revenue !== null && fi.revenue !== undefined)
    .map((fi) => fi.revenue);

  if (revenueValues.length >= 3 && revenueValues[0] > 0) {
    // Calculate P/S ratio
    const ps = marketCap / revenueValues[0];

    details.push(`Price to Sales ratio: ${ps.toFixed(2)}`);

    // Calculate Revenue Growth Rate
    const latestRev = revenueValues[0];
    const oldestRev = revenueValues[revenueValues.length - 1];
    const years = revenueValues.length - 1;

    const revGrowthRate = Math.pow(latestRev / oldestRev, 1 / years) - 1;
    const annualRevGrowthPercent = revGrowthRate * 100;

    details.push(
      `Revenue growth rate: ${annualRevGrowthPercent.toFixed(1)}% CAGR`
    );

    // Evaluate the P/S to growth relationship
    const psToGrowthRatio = ps / annualRevGrowthPercent;

    if (annualRevGrowthPercent > 0) {
      if (annualRevGrowthPercent > 20 && ps < 5) {
        rawScore += 3;
        details.push("High growth with reasonable P/S ratio (attractive)");
      } else if (annualRevGrowthPercent > 10 && ps < 3) {
        rawScore += 2;
        details.push("Good growth with low P/S ratio (attractive)");
      } else if (annualRevGrowthPercent < 5 && ps > 4) {
        rawScore -= 2;
        details.push("Low growth with high P/S ratio (potentially overvalued)");
      } else if (psToGrowthRatio > 1.0) {
        rawScore -= 1;
        details.push("P/S ratio high relative to growth rate");
      } else if (psToGrowthRatio < 0.5) {
        rawScore += 1;
        details.push("P/S ratio low relative to growth rate");
      }
    } else {
      details.push(
        "Negative revenue growth with P/S ratio of " + ps.toFixed(2)
      );
      rawScore -= 1;
    }
  } else {
    details.push("Insufficient revenue data for growth analysis");
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
async function generateValuationOutput(ticker, analysis, state, agentId) {
  const prompt = `
You are analyzing ${ticker} using comprehensive valuation methodologies. Here's the data:

EARNINGS MULTIPLES ANALYSIS:
${analysis.earningsAnalysis.details}

CASH FLOW VALUATION ANALYSIS:
${analysis.cashFlowAnalysis.details}

ASSET-BASED VALUATION ANALYSIS:
${analysis.assetAnalysis.details}

GROWTH-ADJUSTED VALUATION ANALYSIS:
${analysis.growthAnalysis.details}

Based on this analysis:
1. The overall score is ${analysis.score.toFixed(
    1
  )} out of ${analysis.maxScore.toFixed(1)}
2. The preliminary signal is "${analysis.signal}"

As a Valuation Analyst, provide your final investment recommendation:
1. Signal: bullish, bearish, or neutral
2. Confidence: 0-100 (where 100 is highest confidence)
3. Reasoning: A concise summary explaining the recommendation

Remember key valuation principles:
- Compare multiple valuation approaches for a complete picture
- Consider absolute and relative value
- Account for growth prospects in valuation judgments
- Look for margin of safety
- Integrate quality factors with pure valuation metrics
- Consider historical and peer comparisons

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
    return ValuationSignalSchema.parse(responseData);
  } catch (error) {
    console.error(`Error generating valuation output for ${ticker}:`, error);

    // Return fallback output
    return {
      signal: analysis.signal,
      confidence: analysis.score * 10, // Convert 0-10 score to 0-100 confidence
      reasoning: `Based on comprehensive valuation analysis, ${ticker} shows ${
        analysis.signal
      } indicators with key factors including: ${
        analysis.earningsAnalysis.details.split(";")[0]
      }; ${analysis.cashFlowAnalysis.details.split(";")[0]}; ${
        analysis.growthAnalysis.details.split(";")[0]
      }.`,
    };
  }
}
