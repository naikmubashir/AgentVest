import { z } from "zod";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  searchLineItems,
  getSectorPerformance,
  getEconomicIndicators,
} from "../tools/api.js";
import { callLLM } from "../utils/llm.js";
import { progress } from "../utils/progress.js";
import { getApiKeyFromState } from "../utils/api_key.js";

/**
 * Helper function to extract line item values, handling both array and object formats
 * @param {Array|Object} financialLineItems - Financial line items in array or object format
 * @param {string} lineItemName - The name of the line item to extract
 * @returns {Array} - Array of values for the specified line item
 */
function extractLineItemValues(financialLineItems, lineItemName) {
  if (!financialLineItems) {
    return [];
  }

  // Handle array format
  if (Array.isArray(financialLineItems)) {
    return financialLineItems
      .filter((item) => item.line_item === lineItemName)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((item) => item.value);
  }
  // Handle object format
  else if (typeof financialLineItems === "object") {
    const item = financialLineItems[lineItemName];
    return item && item.value !== undefined ? [item.value] : [];
  }

  return [];
}

// Define the schema for Rakesh Jhunjhunwala's analysis signal
const RakeshJhunjhunwalaSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Rakesh Jhunjhunwala's approach:
 * - Focuses on secular growth stories in emerging markets
 * - Looks for strong management with skin in the game
 * - Values industry leadership and potential for market share gains
 * - Emphasizes long-term growth potential over short-term performance
 * - Combines fundamental analysis with macro trend identification
 * - Prefers sectors experiencing structural changes or government focus
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Rakesh Jhunjhunwala's analysis
 */
export async function rakeshJhunjhunwalaAgent(
  state,
  agentId = "rakesh_jhunjhunwala_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const jhunjhunwalaAnalysis = {};

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
        "gross_margin",
        "operating_margin",
        "return_on_equity",
        "total_debt",
        "shareholders_equity",
      ],
      endDate,
      "annual",
      5,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Getting sector performance");
    const sectorData = await getSectorPerformance(ticker, endDate, 365, apiKey);

    progress.updateStatus(agentId, ticker, "Getting economic indicators");
    const economicData = await getEconomicIndicators(endDate, 365, apiKey);

    // Perform sub-analyses:
    progress.updateStatus(agentId, ticker, "Analyzing growth story");
    const growthAnalysis = analyzeGrowthStory(financialLineItems, metrics);

    progress.updateStatus(agentId, ticker, "Analyzing sector dynamics");
    const sectorAnalysis = analyzeSectorDynamics(sectorData, economicData);

    progress.updateStatus(agentId, ticker, "Analyzing competitive position");
    const competitiveAnalysis = analyzeCompetitivePosition(
      financialLineItems,
      metrics,
      marketCap
    );

    progress.updateStatus(agentId, ticker, "Analyzing financial strength");
    const financialAnalysis = analyzeFinancialStrength(financialLineItems);

    // Combine partial scores with weights typical for Jhunjhunwala:
    // 35% Growth Story, 25% Sector Dynamics, 25% Competitive Position, 15% Financial Strength
    const totalScore =
      growthAnalysis.score * 0.35 +
      sectorAnalysis.score * 0.25 +
      competitiveAnalysis.score * 0.25 +
      financialAnalysis.score * 0.15;

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
      growthAnalysis,
      sectorAnalysis,
      competitiveAnalysis,
      financialAnalysis,
    };

    progress.updateStatus(
      agentId,
      ticker,
      "Generating Rakesh Jhunjhunwala analysis"
    );
    const jhunjhunwalaOutput = await generateJhunjhunwalaOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    jhunjhunwalaAnalysis[ticker] = {
      signal: jhunjhunwalaOutput.signal,
      confidence: jhunjhunwalaOutput.confidence,
      reasoning: jhunjhunwalaOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: jhunjhunwalaOutput.reasoning,
    });
  }

  // Save signals to state
  if (!state.data.analyst_signals) {
    state.data.analyst_signals = {};
  }
  state.data.analyst_signals[agentId] = jhunjhunwalaAnalysis;

  if (state.metadata?.show_reasoning) {
    showAgentReasoning(jhunjhunwalaAnalysis, "Rakesh Jhunjhunwala Agent");
  }

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [
      { content: JSON.stringify(jhunjhunwalaAnalysis), name: agentId },
    ],
    data: state.data,
  };
}

/**
 * Analyze the company's growth story
 * @param {Array|Object} financialLineItems - Financial data
 * @param {Object} metrics - Financial metrics
 * @returns {Object} - Analysis results
 */
function analyzeGrowthStory(financialLineItems, metrics) {
  if (!financialLineItems) {
    return { score: 5, details: "Insufficient data for growth story analysis" };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Revenue Growth - Jhunjhunwala valued strong topline growth
  const revenues = extractLineItemValues(financialLineItems, "revenue");

  if (revenues.length >= 3) {
    // Calculate multi-year CAGR
    const latestRev = revenues[0];
    const oldestRev = revenues[revenues.length - 1];
    const years = revenues.length - 1;

    if (oldestRev > 0) {
      const cagr = Math.pow(latestRev / oldestRev, 1 / years) - 1;

      if (cagr > 0.2) {
        rawScore += 3;
        details.push(`Exceptional revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      } else if (cagr > 0.15) {
        rawScore += 2;
        details.push(`Strong revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      } else if (cagr > 0.1) {
        rawScore += 1;
        details.push(`Good revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      } else if (cagr < 0) {
        rawScore -= 2;
        details.push(`Declining revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      } else {
        details.push(`Modest revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      }
    }
  } else {
    details.push("Insufficient revenue history to calculate CAGR");
  }

  // 2) Earnings Growth - Jhunjhunwala wanted to see earnings increase alongside revenue
  const netIncomes = extractLineItemValues(financialLineItems, "net_income");

  if (
    netIncomes.length >= 3 &&
    netIncomes[0] > 0 &&
    netIncomes[netIncomes.length - 1] > 0
  ) {
    const latestIncome = netIncomes[0];
    const oldestIncome = netIncomes[netIncomes.length - 1];
    const years = netIncomes.length - 1;

    const earningsCagr = Math.pow(latestIncome / oldestIncome, 1 / years) - 1;

    if (earningsCagr > 0.25) {
      rawScore += 3;
      details.push(
        `Exceptional earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`
      );
    } else if (earningsCagr > 0.18) {
      rawScore += 2;
      details.push(`Strong earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`);
    } else if (earningsCagr > 0.1) {
      rawScore += 1;
      details.push(`Good earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`);
    } else if (earningsCagr < 0) {
      rawScore -= 1;
      details.push(
        `Declining earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`
      );
    } else {
      details.push(`Modest earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`);
    }
  } else if (netIncomes.length >= 2) {
    // Check profitability trend if we can't calculate CAGR
    const profitableYears = netIncomes.filter((income) => income > 0).length;
    const profitabilityRatio = profitableYears / netIncomes.length;

    if (profitabilityRatio === 1) {
      rawScore += 1;
      details.push("Consistently profitable in available data");
    } else if (profitabilityRatio < 0.5) {
      rawScore -= 1;
      details.push("Mostly unprofitable in available data");
    }
  } else {
    details.push("Insufficient earnings history");
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze sector dynamics
 * @param {Object} sectorData - Sector performance data
 * @param {Object} economicData - Economic indicators
 * @returns {Object} - Analysis results
 */
function analyzeSectorDynamics(sectorData, economicData) {
  if (!sectorData) {
    return {
      score: 5,
      details: "Insufficient data for sector dynamics analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Sector Performance - Jhunjhunwala often invested in sectors experiencing growth
  if (sectorData && sectorData.performance) {
    const sectorReturn = sectorData.performance.return_1yr || 0;

    if (sectorReturn > 0.25) {
      rawScore += 3;
      details.push(
        `Strong sector performance: ${(sectorReturn * 100).toFixed(
          1
        )}% 1-year return`
      );
    } else if (sectorReturn > 0.15) {
      rawScore += 2;
      details.push(
        `Good sector performance: ${(sectorReturn * 100).toFixed(
          1
        )}% 1-year return`
      );
    } else if (sectorReturn > 0.05) {
      rawScore += 1;
      details.push(
        `Positive sector performance: ${(sectorReturn * 100).toFixed(
          1
        )}% 1-year return`
      );
    } else if (sectorReturn < -0.15) {
      rawScore -= 2;
      details.push(
        `Poor sector performance: ${(sectorReturn * 100).toFixed(
          1
        )}% 1-year return`
      );
    } else if (sectorReturn < 0) {
      rawScore -= 1;
      details.push(
        `Negative sector performance: ${(sectorReturn * 100).toFixed(
          1
        )}% 1-year return`
      );
    } else {
      details.push(
        `Flat sector performance: ${(sectorReturn * 100).toFixed(
          1
        )}% 1-year return`
      );
    }

    // Relative sector strength
    if (sectorData.performance.relative_strength > 0.1) {
      rawScore += 2;
      details.push("Sector outperforming the broader market");
    } else if (sectorData.performance.relative_strength > 0) {
      rawScore += 1;
      details.push("Sector slightly outperforming the broader market");
    } else if (sectorData.performance.relative_strength < -0.1) {
      rawScore -= 2;
      details.push("Sector significantly underperforming the broader market");
    } else if (sectorData.performance.relative_strength < 0) {
      rawScore -= 1;
      details.push("Sector slightly underperforming the broader market");
    }
  } else {
    details.push("No sector performance data available");
  }

  // 2) Economic Alignment - Jhunjhunwala looked for sectors benefiting from economic trends
  if (economicData && economicData.indicators) {
    const gdpGrowth =
      economicData.indicators.filter((i) => i.name === "gdp_growth")[0]
        ?.value || 0;

    if (gdpGrowth > 3) {
      rawScore += 1;
      details.push(`Strong GDP growth environment: ${gdpGrowth.toFixed(1)}%`);
    } else if (gdpGrowth < 0) {
      rawScore -= 1;
      details.push(`Recessionary environment: ${gdpGrowth.toFixed(1)}%`);
    }
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze competitive position
 * @param {Array|Object} financialLineItems - Financial data
 * @param {Object} metrics - Financial metrics
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Analysis results
 */
function analyzeCompetitivePosition(financialLineItems, metrics, marketCap) {
  if (!financialLineItems) {
    return {
      score: 5,
      details: "Insufficient data for competitive position analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Margin Analysis - Jhunjhunwala liked companies with strong margins
  const margins = extractLineItemValues(financialLineItems, "operating_margin");

  if (margins.length > 0) {
    const latestMargin = margins[0];

    if (latestMargin > 0.25) {
      rawScore += 2;
      details.push(
        `Excellent operating margin: ${(latestMargin * 100).toFixed(1)}%`
      );
    } else if (latestMargin > 0.15) {
      rawScore += 1;
      details.push(
        `Good operating margin: ${(latestMargin * 100).toFixed(1)}%`
      );
    } else if (latestMargin < 0.05) {
      rawScore -= 1;
      details.push(`Low operating margin: ${(latestMargin * 100).toFixed(1)}%`);
    } else if (latestMargin < 0) {
      rawScore -= 2;
      details.push(
        `Negative operating margin: ${(latestMargin * 100).toFixed(1)}%`
      );
    }

    // Check margin trend
    if (margins.length >= 3) {
      const oldestMargin = margins[margins.length - 1];
      const marginTrend = latestMargin - oldestMargin;

      if (marginTrend > 0.05) {
        rawScore += 2;
        details.push(
          `Strongly improving margins: +${(marginTrend * 100).toFixed(
            1
          )} percentage points`
        );
      } else if (marginTrend > 0.02) {
        rawScore += 1;
        details.push(
          `Improving margins: +${(marginTrend * 100).toFixed(
            1
          )} percentage points`
        );
      } else if (marginTrend < -0.05) {
        rawScore -= 2;
        details.push(
          `Deteriorating margins: ${(marginTrend * 100).toFixed(
            1
          )} percentage points`
        );
      } else if (marginTrend < -0.02) {
        rawScore -= 1;
        details.push(
          `Slightly deteriorating margins: ${(marginTrend * 100).toFixed(
            1
          )} percentage points`
        );
      }
    }
  } else {
    details.push("No margin data available");
  }

  // 2) Return on Equity - Jhunjhunwala focused on capital efficiency
  const roeValues = extractLineItemValues(
    financialLineItems,
    "return_on_equity"
  );

  if (roeValues.length > 0) {
    const latestRoe = roeValues[0];

    if (latestRoe > 0.25) {
      rawScore += 3;
      details.push(`Excellent ROE: ${(latestRoe * 100).toFixed(1)}%`);
    } else if (latestRoe > 0.18) {
      rawScore += 2;
      details.push(`Strong ROE: ${(latestRoe * 100).toFixed(1)}%`);
    } else if (latestRoe > 0.12) {
      rawScore += 1;
      details.push(`Good ROE: ${(latestRoe * 100).toFixed(1)}%`);
    } else if (latestRoe < 0.08) {
      rawScore -= 1;
      details.push(`Below average ROE: ${(latestRoe * 100).toFixed(1)}%`);
    } else if (latestRoe < 0) {
      rawScore -= 2;
      details.push(`Negative ROE: ${(latestRoe * 100).toFixed(1)}%`);
    }
  } else {
    details.push("No ROE data available");
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze financial strength
 * @param {Array|Object} financialLineItems - Financial data
 * @returns {Object} - Analysis results
 */
function analyzeFinancialStrength(financialLineItems) {
  if (!financialLineItems) {
    return {
      score: 5,
      details: "Insufficient data for financial strength analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Debt Position - Jhunjhunwala was cautious about excessive debt
  const debtValues = extractLineItemValues(financialLineItems, "total_debt");
  const equityValues = extractLineItemValues(
    financialLineItems,
    "shareholders_equity"
  );

  if (debtValues.length > 0 && equityValues.length > 0 && equityValues[0] > 0) {
    const debtToEquity = debtValues[0] / equityValues[0];

    if (debtToEquity < 0.3) {
      rawScore += 2;
      details.push(`Very low debt-to-equity: ${debtToEquity.toFixed(2)}`);
    } else if (debtToEquity < 0.7) {
      rawScore += 1;
      details.push(`Manageable debt-to-equity: ${debtToEquity.toFixed(2)}`);
    } else if (debtToEquity > 1.5) {
      rawScore -= 2;
      details.push(`High debt-to-equity: ${debtToEquity.toFixed(2)}`);
    } else if (debtToEquity > 1.0) {
      rawScore -= 1;
      details.push(`Above average debt-to-equity: ${debtToEquity.toFixed(2)}`);
    } else {
      details.push(`Moderate debt-to-equity: ${debtToEquity.toFixed(2)}`);
    }
  } else if (equityValues.length > 0 && equityValues[0] <= 0) {
    rawScore -= 3;
    details.push("Negative equity (financial risk)");
  }

  // 2) Profitability Consistency - Jhunjhunwala liked consistent profitability
  const incomeValues = extractLineItemValues(financialLineItems, "net_income");

  if (incomeValues.length >= 3) {
    const profitableYears = incomeValues.filter((income) => income > 0).length;

    if (profitableYears === incomeValues.length) {
      rawScore += 3;
      details.push(`Consistently profitable all ${profitableYears} years`);
    } else if (profitableYears >= incomeValues.length - 1) {
      rawScore += 2;
      details.push(
        `Profitable in ${profitableYears} of ${incomeValues.length} years`
      );
    } else if (profitableYears >= incomeValues.length / 2) {
      rawScore += 1;
      details.push(
        `Profitable in ${profitableYears} of ${incomeValues.length} years`
      );
    } else if (profitableYears === 0) {
      rawScore -= 3;
      details.push("Not profitable in any of the analyzed years");
    } else {
      rawScore -= 1;
      details.push(
        `Limited profitability: ${profitableYears} of ${incomeValues.length} years`
      );
    }
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
async function generateJhunjhunwalaOutput(ticker, analysis, state, agentId) {
  const prompt = `
You are analyzing ${ticker} using Rakesh Jhunjhunwala's investment approach. Here's the data:

GROWTH STORY ANALYSIS:
${analysis.growthAnalysis.details}

SECTOR DYNAMICS ANALYSIS:
${analysis.sectorAnalysis.details}

COMPETITIVE POSITION ANALYSIS:
${analysis.competitiveAnalysis.details}

FINANCIAL STRENGTH ANALYSIS:
${analysis.financialAnalysis.details}

Based on this analysis and using Rakesh Jhunjhunwala's methodology:
1. The overall score is ${analysis.score.toFixed(
    1
  )} out of ${analysis.maxScore.toFixed(1)}
2. The preliminary signal is "${analysis.signal}"

As Rakesh Jhunjhunwala, provide your final investment recommendation:
1. Signal: bullish, bearish, or neutral
2. Confidence: 0-100 (where 100 is highest confidence)
3. Reasoning: A concise summary explaining the recommendation

Remember Jhunjhunwala's key principles:
- Focus on secular growth stories in emerging markets
- Look for strong management with skin in the game
- Value industry leadership and potential for market share gains
- Emphasize long-term growth potential over short-term performance
- Combine fundamental analysis with macro trend identification
- Prefer sectors experiencing structural changes or government focus

Respond ONLY with a JSON object in this format:
{
  "signal": "bullish|bearish|neutral",
  "confidence": <0-100>,
  "reasoning": "<explanation>"
}
`;

  try {
    // If mock data is being used, return a realistic response without calling LLM
    if (state.metadata?.mock) {
      return {
        signal: "neutral",
        confidence: 50,
        reasoning: `Based on Rakesh Jhunjhunwala's principles, ${ticker} appears to have decent growth potential with moderate sector tailwinds.`,
      };
    }

    // Only proceed to LLM call if not in mock mode
    const result = await callLLM(prompt, {
      model: state.metadata?.llm_model || "gpt-4",
      temperature: 0.1,
      max_tokens: 800,
      stop: ["}"],
    });

    // Parse LLM response to get valid JSON
    let responseData;

    if (typeof result === "object") {
      // If result is already an object, use it directly
      responseData = result;
    } else if (typeof result === "string") {
      // If result is a string, try to extract JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in LLM response");
      }
      const jsonStr = jsonMatch[0];
      responseData = JSON.parse(jsonStr);
    } else {
      throw new Error(`Unexpected result type: ${typeof result}`);
    }

    // Validate with Zod schema
    return RakeshJhunjhunwalaSignalSchema.parse(responseData);
  } catch (error) {
    console.error(`Error generating Jhunjhunwala output for ${ticker}:`, error);

    // Return fallback output
    return {
      signal: analysis.signal,
      confidence: analysis.score * 10, // Convert 0-10 score to 0-100 confidence
      reasoning: `Based on Rakesh Jhunjhunwala's principles, ${ticker} shows ${
        analysis.signal
      } indicators with key factors including: ${
        analysis.growthAnalysis.details.split(";")[0]
      }; ${analysis.sectorAnalysis.details.split(";")[0]}; ${
        analysis.competitiveAnalysis.details.split(";")[0]
      }.`,
    };
  }
}
