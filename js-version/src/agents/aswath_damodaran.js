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

// Define the schema for Aswath Damodaran's analysis signal
const AswathDamodaranSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
  valuation: z.number().optional(),
  upside: z.number().optional(),
});

/**
 * Analyzes stocks using Aswath Damodaran's valuation principles
 * Focuses on DCF valuation, growth rates, risk assessment, and relative valuation
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Aswath Damodaran's analysis
 */
export async function aswathDamodaranAgent(
  state,
  agentId = "aswath_damodaran_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const damodaranAnalysis = {};

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
        "free_cash_flow",
        "capital_expenditure",
        "total_assets",
        "total_debt",
        "total_equity",
        "cash_and_equivalents",
        "interest_expense",
        "income_tax",
        "depreciation_and_amortization",
      ],
      endDate,
      5,
      apiKey
    );

    progress.updateStatus(
      agentId,
      ticker,
      "Calculating growth rates and historical patterns"
    );
    const growthAnalysis = calculateGrowthRates(financialLineItems);

    progress.updateStatus(agentId, ticker, "Estimating cost of capital");
    const costOfCapital = estimateCostOfCapital(financialLineItems, metrics);

    progress.updateStatus(agentId, ticker, "Running DCF valuation model");
    const dcfValuation = performDCFValuation(
      financialLineItems,
      growthAnalysis,
      costOfCapital
    );

    progress.updateStatus(agentId, ticker, "Performing relative valuation");
    const relativeValuation = performRelativeValuation(metrics, marketCap);

    progress.updateStatus(
      agentId,
      ticker,
      "Assessing valuation and margin of safety"
    );
    const valuationAssessment = assessValuation(
      dcfValuation,
      relativeValuation,
      marketCap
    );

    // Collect analysis data
    analysisData[ticker] = {
      metrics,
      financialLineItems,
      marketCap,
      growthAnalysis,
      costOfCapital,
      dcfValuation,
      relativeValuation,
      valuationAssessment,
    };

    progress.updateStatus(
      agentId,
      ticker,
      "Generating Aswath Damodaran valuation analysis"
    );
    const damodaranOutput = await generateDamodaranOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    damodaranAnalysis[ticker] = {
      signal: damodaranOutput.signal,
      confidence: damodaranOutput.confidence,
      reasoning: damodaranOutput.reasoning,
      valuation: damodaranOutput.valuation,
      upside: damodaranOutput.upside,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: damodaranOutput.reasoning,
    });
  }

  // Show reasoning if requested
  if (state.metadata.show_reasoning) {
    showAgentReasoning(damodaranAnalysis, "Aswath Damodaran Agent");
  }

  // Add signals to the overall state
  state.data.analyst_signals[agentId] = damodaranAnalysis;

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(damodaranAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Calculate historical growth rates for key financial metrics
 *
 * @param {Array} financialLineItems - Financial line items
 * @returns {Object} - Growth rate analysis
 */
function calculateGrowthRates(financialLineItems) {
  const growthRates = {
    revenue: calculateCAGR(financialLineItems, "revenue"),
    netIncome: calculateCAGR(financialLineItems, "net_income"),
    freeCashFlow: calculateCAGR(financialLineItems, "free_cash_flow"),
  };

  return {
    historicalGrowth: growthRates,
    sustainableGrowthRate: estimateSustainableGrowthRate(growthRates),
  };
}

/**
 * Calculate Compound Annual Growth Rate (CAGR) for a specific line item
 *
 * @param {Array} financialLineItems - Financial line items
 * @param {string} lineItemName - Name of the line item
 * @returns {number} - CAGR value or null if cannot be calculated
 */
function calculateCAGR(financialLineItems, lineItemName) {
  const lineItems = financialLineItems
    .filter((item) => item.line_item === lineItemName)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (lineItems.length < 2) {
    return null;
  }

  const mostRecent = lineItems[0];
  const oldest = lineItems[lineItems.length - 1];

  if (oldest.value <= 0) {
    return null;
  }

  const years =
    (new Date(mostRecent.date) - new Date(oldest.date)) /
    (365 * 24 * 60 * 60 * 1000);

  if (years <= 0) {
    return null;
  }

  return Math.pow(mostRecent.value / oldest.value, 1 / years) - 1;
}

/**
 * Estimate sustainable growth rate based on historical growth rates
 *
 * @param {Object} growthRates - Historical growth rates
 * @returns {number} - Estimated sustainable growth rate
 */
function estimateSustainableGrowthRate(growthRates) {
  const rates = [];

  if (growthRates.revenue !== null) rates.push(growthRates.revenue);
  if (growthRates.netIncome !== null) rates.push(growthRates.netIncome);
  if (growthRates.freeCashFlow !== null) rates.push(growthRates.freeCashFlow);

  if (rates.length === 0) {
    return 0.03; // Default assumption of 3% growth if no data
  }

  // Weight FCF growth more heavily if available
  if (growthRates.freeCashFlow !== null) {
    rates.push(growthRates.freeCashFlow); // Add it twice for more weight
  }

  const avgGrowth = rates.reduce((a, b) => a + b, 0) / rates.length;

  // Cap the sustainable growth at reasonable levels
  // Usually, no company can grow faster than the economy indefinitely
  return Math.min(Math.max(avgGrowth, 0.02), 0.15);
}

/**
 * Estimate the weighted average cost of capital (WACC)
 *
 * @param {Array} financialLineItems - Financial line items
 * @param {Array} metrics - Financial metrics
 * @returns {number} - Estimated WACC
 */
function estimateCostOfCapital(financialLineItems, metrics) {
  // In a real implementation, this would use more sophisticated methods
  // Here we use a simplified approach based on financial metrics

  // Default assumptions
  let costOfEquity = 0.08; // 8% default
  let costOfDebt = 0.04; // 4% default
  let taxRate = 0.25; // 25% default
  let debtRatio = 0.3; // 30% default

  // Try to extract debt ratio from financial data
  const totalDebt = findMostRecent(financialLineItems, "total_debt");
  const totalEquity = findMostRecent(financialLineItems, "total_equity");

  if (totalDebt !== null && totalEquity !== null && totalEquity > 0) {
    const totalCapital = totalDebt + totalEquity;
    debtRatio = totalDebt / totalCapital;
  }

  // Try to extract tax rate from financial data
  const incomeTax = findMostRecent(financialLineItems, "income_tax");
  const netIncome = findMostRecent(financialLineItems, "net_income");

  if (incomeTax !== null && netIncome !== null && netIncome > 0) {
    taxRate = incomeTax / (incomeTax + netIncome);
    taxRate = Math.min(Math.max(taxRate, 0.15), 0.35); // Reasonableness check
  }

  // Adjust cost of equity based on metrics if available
  if (metrics && metrics.length > 0) {
    // Higher debt to equity increases risk and cost of equity
    if (metrics[0].debt_to_equity !== undefined) {
      costOfEquity += metrics[0].debt_to_equity > 1 ? 0.02 : 0;
    }

    // Higher volatility or market beta would increase cost of equity
    // This is a placeholder - in a real implementation, you'd use market beta
    costOfEquity += 0.01; // Risk premium assumption
  }

  // Calculate WACC
  const wacc =
    costOfEquity * (1 - debtRatio) + costOfDebt * (1 - taxRate) * debtRatio;

  return Math.round(wacc * 100) / 100; // Round to 2 decimal places
}

/**
 * Find the most recent value for a specific line item
 *
 * @param {Array} financialLineItems - Financial line items
 * @param {string} lineItemName - Name of the line item
 * @returns {number|null} - Most recent value or null if not found
 */
function findMostRecent(financialLineItems, lineItemName) {
  const items = financialLineItems
    .filter((item) => item.line_item === lineItemName)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return items.length > 0 ? items[0].value : null;
}

/**
 * Perform a Discounted Cash Flow valuation
 *
 * @param {Array} financialLineItems - Financial line items
 * @param {Object} growthAnalysis - Growth rate analysis
 * @param {number} wacc - Weighted average cost of capital
 * @returns {Object} - DCF valuation results
 */
function performDCFValuation(financialLineItems, growthAnalysis, wacc) {
  // Get most recent free cash flow
  const baseFCF = findMostRecent(financialLineItems, "free_cash_flow");

  if (baseFCF === null || baseFCF <= 0) {
    return {
      estimatedValue: null,
      assumptions: {
        message: "Cannot perform DCF: negative or missing free cash flow data",
      },
    };
  }

  // Set up growth assumptions
  const growthPhases = setupGrowthAssumptions(growthAnalysis);

  // Calculate present value of projected cash flows
  let totalPV = 0;
  let currentFCF = baseFCF;

  // Project 10 years of cash flows
  for (let year = 1; year <= 10; year++) {
    let growthRate;

    if (year <= 5) {
      growthRate = growthPhases.initialGrowth;
    } else {
      // Transition to terminal growth
      const transitionYears = 5;
      const yearsIntoTransition = year - 5;
      const transitionWeight = yearsIntoTransition / transitionYears;

      growthRate =
        growthPhases.initialGrowth * (1 - transitionWeight) +
        growthPhases.terminalGrowth * transitionWeight;
    }

    currentFCF *= 1 + growthRate;
    const presentValue = currentFCF / Math.pow(1 + wacc, year);
    totalPV += presentValue;
  }

  // Calculate terminal value
  const terminalFCF = currentFCF * (1 + growthPhases.terminalGrowth);
  const terminalValue = terminalFCF / (wacc - growthPhases.terminalGrowth);
  const presentTerminalValue = terminalValue / Math.pow(1 + wacc, 10);

  // Total enterprise value
  const enterpriseValue = totalPV + presentTerminalValue;

  // Adjust for cash and debt
  const cash = findMostRecent(financialLineItems, "cash_and_equivalents") || 0;
  const debt = findMostRecent(financialLineItems, "total_debt") || 0;
  const equityValue = enterpriseValue + cash - debt;

  return {
    estimatedValue: equityValue,
    assumptions: {
      baseFCF,
      wacc,
      initialGrowthRate: growthPhases.initialGrowth,
      terminalGrowthRate: growthPhases.terminalGrowth,
      projectionYears: 10,
    },
    components: {
      presentValueOfProjectedCashFlows: totalPV,
      presentValueOfTerminalValue: presentTerminalValue,
      enterpriseValue,
      cash,
      debt,
      equityValue,
    },
  };
}

/**
 * Set up growth assumptions for DCF model
 *
 * @param {Object} growthAnalysis - Growth rate analysis
 * @returns {Object} - Growth phase assumptions
 */
function setupGrowthAssumptions(growthAnalysis) {
  const sustainableGrowth = growthAnalysis.sustainableGrowthRate;

  let initialGrowth;
  if (growthAnalysis.historicalGrowth.freeCashFlow !== null) {
    initialGrowth = growthAnalysis.historicalGrowth.freeCashFlow;
  } else if (growthAnalysis.historicalGrowth.netIncome !== null) {
    initialGrowth = growthAnalysis.historicalGrowth.netIncome;
  } else {
    initialGrowth =
      growthAnalysis.historicalGrowth.revenue !== null
        ? growthAnalysis.historicalGrowth.revenue
        : 0.05;
  }

  // Apply reasonableness checks
  initialGrowth = Math.min(Math.max(initialGrowth, 0.02), 0.25);

  // Terminal growth is typically close to long-term inflation/GDP growth (2-3%)
  const terminalGrowth = 0.025;

  return {
    initialGrowth,
    terminalGrowth,
  };
}

/**
 * Perform relative valuation using multiples
 *
 * @param {Array} metrics - Financial metrics
 * @param {Object} marketCap - Market cap data
 * @returns {Object} - Relative valuation analysis
 */
function performRelativeValuation(metrics, marketCap) {
  if (!metrics || metrics.length === 0 || !marketCap) {
    return {
      multiples: {},
      interpretation: "Insufficient data for relative valuation",
    };
  }

  const currentMetrics = metrics[0];
  const multiples = {};
  const interpretation = [];

  // Calculate and interpret P/E ratio
  if (
    currentMetrics.earnings_per_share &&
    currentMetrics.earnings_per_share > 0
  ) {
    multiples.pe =
      marketCap.market_cap /
      (currentMetrics.earnings_per_share * marketCap.shares_outstanding);

    if (multiples.pe < 10) {
      interpretation.push("Low P/E ratio suggests potential undervaluation");
    } else if (multiples.pe > 25) {
      interpretation.push(
        "High P/E ratio may indicate overvaluation or high growth expectations"
      );
    } else {
      interpretation.push("P/E ratio is within a reasonable range");
    }
  }

  // Calculate and interpret P/B ratio
  if (currentMetrics.price_to_book_ratio) {
    multiples.pb = currentMetrics.price_to_book_ratio;

    if (multiples.pb < 1) {
      interpretation.push(
        "Trading below book value, potential deep value opportunity"
      );
    } else if (multiples.pb < 2) {
      interpretation.push(
        "P/B ratio suggests reasonable valuation relative to assets"
      );
    } else {
      interpretation.push("High P/B ratio indicates premium to asset value");
    }
  }

  // Calculate and interpret P/S ratio
  if (currentMetrics.price_to_sales_ratio) {
    multiples.ps = currentMetrics.price_to_sales_ratio;

    if (multiples.ps < 1) {
      interpretation.push("Low P/S ratio may indicate undervaluation");
    } else if (multiples.ps > 5) {
      interpretation.push(
        "High P/S ratio suggests premium valuation or high growth expectations"
      );
    }
  }

  return {
    multiples,
    interpretation: interpretation.join(". "),
  };
}

/**
 * Assess valuation and determine signal based on DCF and relative valuation
 *
 * @param {Object} dcfValuation - DCF valuation results
 * @param {Object} relativeValuation - Relative valuation results
 * @param {Object} marketCap - Market cap data
 * @returns {Object} - Valuation assessment and signal
 */
function assessValuation(dcfValuation, relativeValuation, marketCap) {
  const signal = { value: "neutral", confidence: 0.5 };
  const insights = [];
  let intrinsicValue = 0;
  let upside = 0;

  // Check if DCF valuation is available
  if (dcfValuation.estimatedValue && marketCap && marketCap.market_cap > 0) {
    intrinsicValue = dcfValuation.estimatedValue;
    upside = intrinsicValue / marketCap.market_cap - 1;

    insights.push(
      `DCF valuation: $${Math.round(
        intrinsicValue / 1000000
      ).toLocaleString()}M`
    );
    insights.push(
      `Current market cap: $${Math.round(
        marketCap.market_cap / 1000000
      ).toLocaleString()}M`
    );
    insights.push(`Estimated upside/downside: ${Math.round(upside * 100)}%`);

    // Determine signal based on upside potential
    if (upside > 0.3) {
      signal.value = "bullish";
      signal.confidence = Math.min(0.5 + upside * 0.5, 0.9);
      insights.push("Significant undervaluation detected");
    } else if (upside < -0.3) {
      signal.value = "bearish";
      signal.confidence = Math.min(0.5 + Math.abs(upside) * 0.5, 0.9);
      insights.push("Significant overvaluation detected");
    } else if (upside > 0.1) {
      signal.value = "bullish";
      signal.confidence = 0.5 + upside * 0.5;
      insights.push("Moderate undervaluation detected");
    } else if (upside < -0.1) {
      signal.value = "bearish";
      signal.confidence = 0.5 + Math.abs(upside) * 0.5;
      insights.push("Moderate overvaluation detected");
    } else {
      insights.push("Valuation appears fair");
    }
  } else {
    insights.push(
      "DCF valuation could not be calculated, relying on relative valuation"
    );
  }

  // Consider relative valuation insights
  if (
    relativeValuation.multiples &&
    Object.keys(relativeValuation.multiples).length > 0
  ) {
    insights.push(relativeValuation.interpretation);

    // Adjust signal based on relative valuation if DCF wasn't available
    if (
      !dcfValuation.estimatedValue &&
      relativeValuation.interpretation.includes("undervaluation")
    ) {
      signal.value = "bullish";
      signal.confidence = 0.6;
    } else if (
      !dcfValuation.estimatedValue &&
      relativeValuation.interpretation.includes("overvaluation")
    ) {
      signal.value = "bearish";
      signal.confidence = 0.6;
    }
  }

  return {
    signal: signal.value,
    confidence: signal.confidence,
    intrinsicValue,
    upside,
    insights: insights.join(". "),
  };
}

/**
 * Generate Aswath Damodaran's analysis output using LLM
 *
 * @param {string} ticker - The stock ticker
 * @param {Object} analysisData - Analysis data for the ticker
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Aswath Damodaran's analysis
 */
async function generateDamodaranOutput(ticker, analysisData, state, agentId) {
  const {
    metrics,
    marketCap,
    growthAnalysis,
    costOfCapital,
    dcfValuation,
    relativeValuation,
    valuationAssessment,
  } = analysisData;

  // Format data for DCF presentation
  let dcfSummary =
    "DCF analysis could not be performed due to insufficient data.";
  let intrinsicValue = null;
  let upside = null;

  if (dcfValuation.estimatedValue) {
    intrinsicValue = dcfValuation.estimatedValue;
    upside = valuationAssessment.upside;

    dcfSummary = `
    DCF Summary:
    - Base FCF: $${Math.round(dcfValuation.assumptions.baseFCF / 1000000)}M
    - WACC: ${(dcfValuation.assumptions.wacc * 100).toFixed(1)}%
    - Initial Growth Rate: ${(
      dcfValuation.assumptions.initialGrowthRate * 100
    ).toFixed(1)}%
    - Terminal Growth Rate: ${(
      dcfValuation.assumptions.terminalGrowthRate * 100
    ).toFixed(1)}%
    - Intrinsic Value: $${Math.round(intrinsicValue / 1000000)}M
    - Current Market Cap: $${Math.round(marketCap.market_cap / 1000000)}M
    - Upside/Downside: ${Math.round(upside * 100)}%
    `;
  }

  // Format relative valuation data
  const multiplesData = relativeValuation.multiples;
  let multiplesText = "Relative valuation metrics not available.";

  if (Object.keys(multiplesData).length > 0) {
    multiplesText = `
    Relative Valuation Multiples:
    ${multiplesData.pe ? `- P/E Ratio: ${multiplesData.pe.toFixed(2)}` : ""}
    ${multiplesData.pb ? `- P/B Ratio: ${multiplesData.pb.toFixed(2)}` : ""}
    ${multiplesData.ps ? `- P/S Ratio: ${multiplesData.ps.toFixed(2)}` : ""}
    
    Interpretation: ${relativeValuation.interpretation}
    `;
  }

  const prompt = `
  You are Aswath Damodaran, a finance professor known as the "Dean of Valuation" with expertise in equity valuation and corporate finance.

  Based on the following analysis of ${ticker}, provide your investment recommendation:

  Growth Analysis:
  - Historical Revenue CAGR: ${
    growthAnalysis.historicalGrowth.revenue
      ? (growthAnalysis.historicalGrowth.revenue * 100).toFixed(1) + "%"
      : "N/A"
  }
  - Historical Net Income CAGR: ${
    growthAnalysis.historicalGrowth.netIncome
      ? (growthAnalysis.historicalGrowth.netIncome * 100).toFixed(1) + "%"
      : "N/A"
  }
  - Historical FCF CAGR: ${
    growthAnalysis.historicalGrowth.freeCashFlow
      ? (growthAnalysis.historicalGrowth.freeCashFlow * 100).toFixed(1) + "%"
      : "N/A"
  }
  - Estimated Sustainable Growth: ${(
    growthAnalysis.sustainableGrowthRate * 100
  ).toFixed(1)}%

  Cost of Capital:
  - Estimated WACC: ${(costOfCapital * 100).toFixed(1)}%

  ${dcfSummary}

  ${multiplesText}

  Overall Assessment:
  ${valuationAssessment.insights}

  Please respond with:
  1. Your investment signal (bullish, bearish, or neutral)
  2. Your confidence level (0.0 to 1.0)
  3. Your detailed reasoning in Aswath Damodaran's voice, focusing on:
     - Assessment of intrinsic value vs. market price
     - Analysis of growth assumptions and their reasonableness
     - Explanation of the DCF methodology and key drivers
     - Discussion of relative valuation multiples
     - Overall investment recommendation with emphasis on valuation

  JSON format:
  {
    "signal": "bullish|bearish|neutral",
    "confidence": 0.XX,
    "reasoning": "Your detailed analysis...",
    "valuation": 123456789,
    "upside": 0.XX
  }
  `;

  progress.updateStatus(agentId, ticker, "Generating LLM analysis");
  const llmResponse = await callLLM(state, prompt);

  try {
    // Parse the response and validate with Zod schema
    const jsonResponse = JSON.parse(llmResponse);
    return AswathDamodaranSignalSchema.parse({
      ...jsonResponse,
      valuation: intrinsicValue,
      upside: upside,
    });
  } catch (error) {
    console.error("Error parsing Aswath Damodaran LLM response:", error);
    return {
      signal: valuationAssessment.signal,
      confidence: valuationAssessment.confidence,
      reasoning:
        "Error generating detailed analysis. Using quantitative signals only.",
      valuation: intrinsicValue,
      upside: upside,
    };
  }
}
