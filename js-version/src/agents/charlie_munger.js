/**
 * Charlie Munger Agent
 * Analyzes stocks using Charlie Munger's investing principles and mental models.
 * Focuses on moat strength, management quality, predictability, and valuation.
 */
import { HumanMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  searchLineItems,
  getInsiderTrades,
  getCompanyNews,
} from "../tools/api.js";
import { progress } from "../utils/progress.js";
import { callLLM } from "../utils/llm.js";
import { getApiKeyFromState } from "../utils/api_key.js";

/**
 * Charlie Munger Signal Model
 * @typedef {Object} CharlieMungerSignal
 * @property {'bullish'|'bearish'|'neutral'} signal - Trading signal
 * @property {number} confidence - Confidence level (0-1)
 * @property {string} reasoning - Reasoning behind the signal
 */

/**
 * Analyzes stocks using Charlie Munger's investing principles and mental models
 *
 * @param {Object} state - The agent state
 * @param {string} agentId - The agent ID
 * @returns {Object} Updated state with Munger analysis
 */
export function charlieMungerAgent(state, agentId = "charlie_munger_agent") {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");
  const analysisData = {};
  const mungerAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Fetching financial metrics");
    const metrics = getFinancialMetrics(ticker, endDate, "annual", 10, apiKey); // Munger looks at longer periods

    progress.updateStatus(agentId, ticker, "Gathering financial line items");
    const financialLineItems = searchLineItems(
      ticker,
      [
        "revenue",
        "net_income",
        "operating_income",
        "return_on_invested_capital",
        "gross_margin",
        "operating_margin",
        "free_cash_flow",
        "capital_expenditure",
        "cash_and_equivalents",
        "total_debt",
        "shareholders_equity",
        "outstanding_shares",
        "research_and_development",
        "goodwill_and_intangible_assets",
      ],
      endDate,
      "annual",
      10, // Munger examines long-term trends
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Getting market cap");
    const marketCap = getMarketCap(ticker, endDate, apiKey);

    progress.updateStatus(agentId, ticker, "Fetching insider trades");
    // Munger values management with skin in the game
    const insiderTrades = getInsiderTrades(
      ticker,
      endDate,
      null, // Look back 2 years for insider trading patterns
      100,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Fetching company news");
    // Munger avoids businesses with frequent negative press
    const companyNews = getCompanyNews(
      ticker,
      endDate,
      365, // Look back 1 year for news
      100,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Analyzing moat strength");
    const moatAnalysis = analyzeMoatStrength(financialLineItems);

    progress.updateStatus(agentId, ticker, "Analyzing management quality");
    const managementAnalysis = analyzeManagementQuality(
      financialLineItems,
      insiderTrades
    );

    progress.updateStatus(agentId, ticker, "Analyzing business predictability");
    const predictabilityAnalysis = analyzePredictability(financialLineItems);

    progress.updateStatus(
      agentId,
      ticker,
      "Calculating Munger-style valuation"
    );
    const valuationAnalysis = calculateMungerValuation(
      financialLineItems,
      marketCap
    );

    // Combine partial scores with Munger's weighting preferences
    // Munger weights quality and predictability higher than current valuation
    const totalScore =
      moatAnalysis.score * 0.35 +
      managementAnalysis.score * 0.25 +
      predictabilityAnalysis.score * 0.25 +
      valuationAnalysis.score * 0.15;

    const maxPossibleScore = 10; // Scale to 0-10

    // Generate a simple buy/hold/sell signal
    let signal;
    if (totalScore >= 7.5) {
      // Munger has very high standards
      signal = "bullish";
    } else if (totalScore <= 4.5) {
      signal = "bearish";
    } else {
      signal = "neutral";
    }

    analysisData[ticker] = {
      signal,
      score: totalScore,
      max_score: maxPossibleScore,
      moat_analysis: moatAnalysis,
      management_analysis: managementAnalysis,
      predictability_analysis: predictabilityAnalysis,
      valuation_analysis: valuationAnalysis,
      // Include some qualitative assessment from news
      news_sentiment: companyNews
        ? analyzeNewsSentiment(companyNews)
        : "No news data available",
    };

    progress.updateStatus(
      agentId,
      ticker,
      "Generating Charlie Munger analysis"
    );
    const mungerOutput = generateMungerOutput(
      ticker,
      analysisData,
      state,
      agentId
    );

    mungerAnalysis[ticker] = {
      signal: mungerOutput.signal,
      confidence: mungerOutput.confidence,
      reasoning: mungerOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: mungerOutput.reasoning,
    });
  }

  // Wrap results in a single message for the chain
  const message = new HumanMessage({
    content: JSON.stringify(mungerAnalysis),
    name: agentId,
  });

  // Show reasoning if requested
  if (state.metadata.show_reasoning) {
    showAgentReasoning(mungerAnalysis, "Charlie Munger Agent");
  }

  progress.updateStatus(agentId, null, "Done");

  // Add signals to the overall state
  state.data.analyst_signals = state.data.analyst_signals || {};
  state.data.analyst_signals[agentId] = mungerAnalysis;

  return {
    messages: [message],
    data: state.data,
  };
}

/**
 * Analyze the business's competitive advantage using Munger's approach
 *
 * @param {Array} metrics - Financial metrics
 * @param {Array} financialLineItems - Financial line items
 * @returns {Object} Moat strength analysis
 */
function analyzeMoatStrength(financialLineItems) {
  const moatAnalysis = {
    roic: { value: null, strength: null },
    grossMargin: { value: null, strength: null },
    operatingMargin: { value: null, strength: null },
    fcfToRevenue: { value: null, strength: null },
    score: 0,
    details: [], // Add details array here
  };

  // Check if we have the data structure expected
  if (!financialLineItems || typeof financialLineItems !== "object") {
    return moatAnalysis;
  }

  // Handle both array and object formats
  const isArrayFormat = Array.isArray(
    financialLineItems.return_on_invested_capital
  );

  // 1. Return on Invested Capital (ROIC) analysis - Munger's favorite metric
  let roicValues = [];

  if (isArrayFormat) {
    roicValues = financialLineItems.return_on_invested_capital || [];
  } else if (Array.isArray(financialLineItems)) {
    roicValues = financialLineItems
      .filter(
        (item) =>
          item.return_on_invested_capital !== undefined &&
          item.return_on_invested_capital !== null
      )
      .map((item) => item.return_on_invested_capital);
  }

  if (roicValues.length > 0) {
    // Check if ROIC consistently above 15% (Munger's threshold)
    const highRoicCount = roicValues.filter((r) => r > 0.15).length;

    if (highRoicCount >= roicValues.length * 0.8) {
      // 80% of periods show high ROIC
      score += 3;
      details.push(
        `Excellent ROIC: >15% in ${highRoicCount}/${roicValues.length} periods`
      );
    } else if (highRoicCount >= roicValues.length * 0.5) {
      // 50% of periods
      score += 2;
      details.push(
        `Good ROIC: >15% in ${highRoicCount}/${roicValues.length} periods`
      );
    } else if (highRoicCount > 0) {
      score += 1;
      details.push(
        `Mixed ROIC: >15% in only ${highRoicCount}/${roicValues.length} periods`
      );
    } else {
      details.push("Poor ROIC: Never exceeds 15% threshold");
    }
  } else {
    details.push("No ROIC data available");
  }

  // 2. Gross Margin analysis - indicator of pricing power and moat
  let grossMargins = [];

  if (isArrayFormat) {
    grossMargins = financialLineItems.gross_margin || [];
  } else if (Array.isArray(financialLineItems)) {
    grossMargins = financialLineItems
      .filter(
        (item) => item.gross_margin !== undefined && item.gross_margin !== null
      )
      .map((item) => item.gross_margin);
  }

  if (grossMargins.length > 0) {
    const avgMargin =
      grossMargins.reduce((sum, margin) => sum + margin, 0) /
      grossMargins.length;

    // Check margin trend - Munger likes stable or improving margins
    const marginTrend = calculateTrend(grossMargins);

    if (avgMargin > 0.4 && marginTrend >= 0) {
      // Excellent margins with stable/upward trend
      score += 2;
      details.push(
        `Strong pricing power: ${(avgMargin * 100).toFixed(
          1
        )}% avg gross margin with ${
          marginTrend >= 0.005 ? "improving" : "stable"
        } trend`
      );
    } else if (avgMargin > 0.3 || (avgMargin > 0.25 && marginTrend > 0)) {
      score += 1;
      details.push(
        `Decent pricing power: ${(avgMargin * 100).toFixed(
          1
        )}% avg gross margin`
      );
    } else {
      details.push(
        `Weak pricing power: ${(avgMargin * 100).toFixed(1)}% avg gross margin`
      );
    }
  } else {
    details.push("No gross margin data available");
  }

  // 3. Capital requirements - Munger prefers businesses that don't need constant reinvestment
  const capexToRevenue = calculateCapexToRevenue(financialLineItems);
  if (capexToRevenue !== null) {
    if (capexToRevenue < 0.05) {
      // Low capital intensity
      score += 2;
      details.push(
        `Light capital requirements: ${(capexToRevenue * 100).toFixed(
          1
        )}% CapEx/Revenue`
      );
    } else if (capexToRevenue < 0.15) {
      score += 1;
      details.push(
        `Moderate capital requirements: ${(capexToRevenue * 100).toFixed(
          1
        )}% CapEx/Revenue`
      );
    } else {
      details.push(
        `Heavy capital requirements: ${(capexToRevenue * 100).toFixed(
          1
        )}% CapEx/Revenue`
      );
    }
  } else {
    details.push("Unable to assess capital requirements");
  }

  // 4. Intangible asset strength - R&D investments & goodwill as moat indicators
  const intangibleStrength = assessIntangibles(financialLineItems);
  if (intangibleStrength !== null) {
    score += intangibleStrength.score;
    details.push(intangibleStrength.detail);
  }

  return {
    score: Math.min(10, score), // Cap at 10
    details: details.join("; "),
  };
}

/**
 * Analyze management quality based on financial performance and insider activity
 *
 * @param {Array} financialLineItems - Financial line items
 * @param {Array} insiderTrades - Insider trading data
 * @returns {Object} Management quality analysis
 */
function analyzeManagementQuality(financialLineItems, insiderTrades) {
  let score = 0;
  const details = [];

  if (!financialLineItems || financialLineItems.length === 0) {
    return {
      score: 0,
      details: "Insufficient data to analyze management quality",
    };
  }

  // 1. Capital allocation - Munger focuses on how management deploys capital
  const roic = getAverageMetric(
    financialLineItems,
    "return_on_invested_capital"
  );
  if (roic !== null) {
    if (roic > 0.2) {
      // Excellent capital allocation
      score += 3;
      details.push(
        `Exceptional capital allocation: ${(roic * 100).toFixed(1)}% avg ROIC`
      );
    } else if (roic > 0.15) {
      score += 2;
      details.push(
        `Strong capital allocation: ${(roic * 100).toFixed(1)}% avg ROIC`
      );
    } else if (roic > 0.1) {
      score += 1;
      details.push(
        `Decent capital allocation: ${(roic * 100).toFixed(1)}% avg ROIC`
      );
    } else {
      details.push(
        `Poor capital allocation: ${(roic * 100).toFixed(1)}% avg ROIC`
      );
    }
  } else {
    details.push("No ROIC data available");
  }

  // 2. Financial conservatism - Munger prefers conservative financial management
  const debtToEquity = calculateDebtToEquity(financialLineItems);
  if (debtToEquity !== null) {
    if (debtToEquity < 0.3) {
      // Very conservative debt levels
      score += 2;
      details.push(
        `Conservative financial management: ${debtToEquity.toFixed(
          2
        )}x debt/equity`
      );
    } else if (debtToEquity < 0.7) {
      score += 1;
      details.push(
        `Prudent financial management: ${debtToEquity.toFixed(2)}x debt/equity`
      );
    } else if (debtToEquity < 1.5) {
      details.push(
        `Moderate leverage: ${debtToEquity.toFixed(2)}x debt/equity`
      );
    } else {
      score -= 1; // Penalize excessive leverage
      details.push(
        `Aggressive leverage: ${debtToEquity.toFixed(2)}x debt/equity`
      );
    }
  } else {
    details.push("Unable to assess financial conservatism");
  }

  // 3. Insider ownership and trading patterns
  if (insiderTrades && insiderTrades.length > 0) {
    // Net insider buying/selling over the period
    const netInsiderActivity = analyzeInsiderActivity(insiderTrades);

    if (netInsiderActivity.buyRatio > 0.7) {
      // Strong insider buying
      score += 2;
      details.push(
        `Strong insider confidence: ${netInsiderActivity.buyCount} buys vs ${netInsiderActivity.sellCount} sells`
      );
    } else if (netInsiderActivity.buyRatio > 0.5) {
      score += 1;
      details.push(
        `Positive insider activity: ${netInsiderActivity.buyCount} buys vs ${netInsiderActivity.sellCount} sells`
      );
    } else if (netInsiderActivity.buyRatio < 0.2) {
      score -= 1;
      details.push(
        `Concerning insider selling: ${netInsiderActivity.buyCount} buys vs ${netInsiderActivity.sellCount} sells`
      );
    } else {
      details.push(
        `Mixed insider activity: ${netInsiderActivity.buyCount} buys vs ${netInsiderActivity.sellCount} sells`
      );
    }
  } else {
    details.push("No insider trading data available");
  }

  return {
    score: Math.max(0, Math.min(10, score)), // Cap between 0-10
    details: details.join("; "),
  };
}

/**
 * Analyze business predictability based on financial stability
 *
 * @param {Array} financialLineItems - Financial line items
 * @returns {Object} Predictability analysis
 */
function analyzePredictability(financialLineItems) {
  let score = 0;
  const details = [];

  if (!financialLineItems || financialLineItems.length < 3) {
    // Need at least 3 years for trend analysis
    return {
      score: 0,
      details: "Insufficient data to analyze business predictability",
    };
  }

  // 1. Revenue stability and growth - Munger prizes predictable businesses
  const revenues = financialLineItems
    .filter((item) => item.revenue !== undefined && item.revenue !== null)
    .map((item) => item.revenue);

  if (revenues.length >= 3) {
    const revenueGrowthRates = calculateGrowthRates(revenues);
    const avgGrowthRate = calculateAverage(revenueGrowthRates);
    const growthVolatility = calculateStandardDeviation(revenueGrowthRates);

    // Assess growth rate and stability
    if (avgGrowthRate > 0.08 && growthVolatility < 0.1) {
      // Steady growth
      score += 3;
      details.push(
        `Highly predictable revenue: ${(avgGrowthRate * 100).toFixed(
          1
        )}% avg growth with low volatility`
      );
    } else if (avgGrowthRate > 0.05 && growthVolatility < 0.15) {
      score += 2;
      details.push(
        `Good revenue predictability: ${(avgGrowthRate * 100).toFixed(
          1
        )}% avg growth`
      );
    } else if (avgGrowthRate > 0 && growthVolatility < 0.25) {
      score += 1;
      details.push(
        `Moderate revenue predictability: ${(avgGrowthRate * 100).toFixed(
          1
        )}% avg growth`
      );
    } else {
      details.push(
        `Unpredictable revenue: ${(avgGrowthRate * 100).toFixed(
          1
        )}% avg growth with high volatility`
      );
    }
  } else {
    details.push("Insufficient revenue history");
  }

  // 2. Earnings stability - Even more important than revenue stability to Munger
  const netIncomes = financialLineItems
    .filter((item) => item.net_income !== undefined && item.net_income !== null)
    .map((item) => item.net_income);

  if (netIncomes.length >= 3) {
    // Count number of profitable years
    const profitableYears = netIncomes.filter((income) => income > 0).length;
    const profitabilityRatio = profitableYears / netIncomes.length;

    // Calculate earnings volatility
    const earningsVolatility = calculateCoefficientOfVariation(netIncomes);

    if (profitabilityRatio === 1 && earningsVolatility < 0.3) {
      // Consistently profitable with low volatility
      score += 4;
      details.push(
        `Exceptional earnings predictability: Profitable in all ${netIncomes.length} periods with low volatility`
      );
    } else if (profitabilityRatio > 0.8 && earningsVolatility < 0.5) {
      score += 2;
      details.push(
        `Good earnings predictability: Profitable in ${profitableYears}/${netIncomes.length} periods`
      );
    } else if (profitabilityRatio > 0.5) {
      score += 1;
      details.push(
        `Moderate earnings predictability: Profitable in ${profitableYears}/${netIncomes.length} periods`
      );
    } else {
      details.push(
        `Poor earnings predictability: Profitable in only ${profitableYears}/${netIncomes.length} periods`
      );
    }
  } else {
    details.push("Insufficient earnings history");
  }

  return {
    score: Math.min(10, score), // Cap at 10
    details: details.join("; "),
  };
}

/**
 * Calculate Munger-style valuation based on business quality and price
 *
 * @param {Array} financialLineItems - Financial line items
 * @param {number} marketCap - Current market cap
 * @returns {Object} Valuation analysis
 */
function calculateMungerValuation(financialLineItems, marketCap) {
  let score = 0;
  const details = [];

  if (!financialLineItems || !marketCap || marketCap <= 0) {
    return {
      score: 0,
      details: "Insufficient data to analyze valuation",
    };
  }

  // Get the most recent net income and free cash flow
  const recentFinancials = financialLineItems[0] || {};
  const netIncome = recentFinancials.net_income;
  const freeCashFlow = recentFinancials.free_cash_flow;

  // 1. Price-to-Earnings analysis - Munger considers this in context of quality
  if (netIncome !== undefined && netIncome !== null && netIncome > 0) {
    const peRatio = marketCap / netIncome;

    // Interpret PE based on growth and stability
    const revenues = financialLineItems
      .filter((item) => item.revenue !== undefined && item.revenue !== null)
      .map((item) => item.revenue);

    let growthRate = 0.05; // Default assumption
    if (revenues.length >= 3) {
      const revenueGrowthRates = calculateGrowthRates(revenues);
      growthRate = calculateAverage(revenueGrowthRates);
    }

    // Munger's "rule of thumb": Fair PE = Growth rate * 2 for high-quality businesses
    const reasonablePE = Math.max(10, growthRate * 100 * 2);

    if (peRatio < reasonablePE * 0.7) {
      // Significantly undervalued
      score += 4;
      details.push(
        `Undervalued: PE ${peRatio.toFixed(
          1
        )} vs reasonable PE ${reasonablePE.toFixed(1)}`
      );
    } else if (peRatio < reasonablePE) {
      score += 2;
      details.push(
        `Fairly valued: PE ${peRatio.toFixed(
          1
        )} vs reasonable PE ${reasonablePE.toFixed(1)}`
      );
    } else if (peRatio < reasonablePE * 1.5) {
      score += 1;
      details.push(
        `Fully valued: PE ${peRatio.toFixed(
          1
        )} vs reasonable PE ${reasonablePE.toFixed(1)}`
      );
    } else {
      details.push(
        `Overvalued: PE ${peRatio.toFixed(
          1
        )} vs reasonable PE ${reasonablePE.toFixed(1)}`
      );
    }
  } else {
    details.push("Unable to calculate PE ratio (negative or missing earnings)");
  }

  // 2. Free Cash Flow yield - Munger focuses on cash generation
  if (freeCashFlow !== undefined && freeCashFlow !== null && freeCashFlow > 0) {
    const fcfYield = freeCashFlow / marketCap;

    if (fcfYield > 0.08) {
      // Very high FCF yield
      score += 3;
      details.push(`Excellent FCF yield: ${(fcfYield * 100).toFixed(1)}%`);
    } else if (fcfYield > 0.05) {
      score += 2;
      details.push(`Good FCF yield: ${(fcfYield * 100).toFixed(1)}%`);
    } else if (fcfYield > 0.03) {
      score += 1;
      details.push(`Acceptable FCF yield: ${(fcfYield * 100).toFixed(1)}%`);
    } else {
      details.push(`Low FCF yield: ${(fcfYield * 100).toFixed(1)}%`);
    }
  } else {
    details.push("Unable to calculate FCF yield (negative or missing FCF)");
  }

  return {
    score: Math.min(10, score), // Cap at 10
    details: details.join("; "),
  };
}

/**
 * Analyze news sentiment for Munger qualitative assessment
 *
 * @param {Array} companyNews - Company news data
 * @returns {string} News sentiment analysis
 */
function analyzeNewsSentiment(companyNews) {
  if (!companyNews || companyNews.length === 0) {
    return "No news data available";
  }

  // Count negative, neutral, and positive news based on keywords
  const negativePatterns =
    /scandal|fraud|lawsuit|investigation|decline|miss|drop|fall|cut|layoff|bankrupt/i;
  const positivePatterns =
    /growth|profit|increase|beat|exceed|launch|innovation|partnership|dividend|buyback/i;

  let negativeCount = 0;
  let positiveCount = 0;
  let neutralCount = 0;

  companyNews.forEach((item) => {
    const title = item.title || "";
    const summary = item.summary || "";
    const combinedText = title + " " + summary;

    if (negativePatterns.test(combinedText)) {
      negativeCount++;
    } else if (positivePatterns.test(combinedText)) {
      positiveCount++;
    } else {
      neutralCount++;
    }
  });

  const totalNewsItems = companyNews.length;
  const negativeRatio = negativeCount / totalNewsItems;
  const positiveRatio = positiveCount / totalNewsItems;

  if (negativeRatio > 0.3) {
    return `Concerning news profile: ${negativeCount}/${totalNewsItems} negative items`;
  } else if (positiveRatio > 0.5) {
    return `Positive news profile: ${positiveCount}/${totalNewsItems} positive items`;
  } else {
    return `Neutral news profile: ${neutralCount}/${totalNewsItems} neutral items`;
  }
}

/**
 * Generate the final Charlie Munger analysis output using LLM
 *
 * @param {string} ticker - The ticker symbol
 * @param {Object} analysisData - The analysis data
 * @param {Object} state - Current state
 * @param {string} agentId - The agent ID
 * @returns {CharlieMungerSignal} Charlie Munger signal
 */
function generateMungerOutput(ticker, analysisData, state, agentId) {
  const tickerData = analysisData[ticker];
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are Charlie Munger, the vice chairman of Berkshire Hathaway and Warren Buffett's long-time business partner. 
    Known for your mental models, focus on business quality over price, and emphasis on "sitting on your ass" (patience) 
    when you own a wonderful business. Your investment philosophy focuses on:

    1. Buying high-quality businesses with strong competitive advantages (moats)
    2. Assessing management quality and capital allocation skills
    3. Looking for predictable businesses with understandable economics
    4. Paying a reasonable price (valuation matters, but quality matters more)
    5. Concentrating investments in your best ideas

    Please analyze this company using your investment philosophy and mental models.`,
    ],
    [
      "human",
      `Company Ticker: ${ticker}

    Moat Analysis:
    ${tickerData.moat_analysis.details}

    Management Analysis:
    ${tickerData.management_analysis.details}

    Predictability Analysis:
    ${tickerData.predictability_analysis.details}

    Valuation Analysis:
    ${tickerData.valuation_analysis.details}

    News Sentiment:
    ${tickerData.news_sentiment}

    Overall Score: ${tickerData.score.toFixed(1)}/10

    Based on the quantitative scores and qualitative data, provide:
    1. Your overall investment signal (bullish, bearish, or neutral)
    2. Your confidence level (0-100%)
    3. A concise but thorough explanation of your reasoning in Charlie Munger's voice

    Format your response as a JSON object with the following structure:
    {
      "signal": "bullish/bearish/neutral",
      "confidence": confidence_percentage_as_decimal,
      "reasoning": "Your reasoning in Charlie Munger's voice"
    }`,
    ],
  ]);

  // Create default factory for CharlieMungerSignal
  const createDefaultSignal = () => {
    return {
      signal: tickerData.signal,
      confidence: tickerData.score / tickerData.max_score,
      reasoning: `Based on quantitative analysis, ${ticker} scores ${tickerData.score.toFixed(
        1
      )} out of ${tickerData.max_score}. 
      Moat: ${tickerData.moat_analysis.details}. 
      Management: ${tickerData.management_analysis.details}. 
      Predictability: ${tickerData.predictability_analysis.details}. 
      Valuation: ${tickerData.valuation_analysis.details}.`,
    };
  };

  return callLLM({
    prompt: prompt.format({}),
    expectedModelStructure: {
      signal: "string",
      confidence: "number",
      reasoning: "string",
    },
    agentName: agentId,
    state,
    defaultFactory: createDefaultSignal,
  });
}

/**
 * Calculate the trend of a time series
 *
 * @param {Array} values - Array of values
 * @returns {number} Trend coefficient
 */
function calculateTrend(values) {
  if (!values || values.length < 2) return 0;

  // Simple linear regression slope
  const n = values.length;
  const indices = Array.from({ length: n }, (_, i) => i);

  const sumX = indices.reduce((sum, x) => sum + x, 0);
  const sumY = values.reduce((sum, y) => sum + y, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumXX = indices.reduce((sum, x) => sum + x * x, 0);

  // Calculate slope (m)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  return slope;
}

/**
 * Calculate capital expenditure to revenue ratio
 *
 * @param {Array} financialLineItems - Financial line items
 * @returns {number|null} CapEx to Revenue ratio
 */
function calculateCapexToRevenue(financialLineItems) {
  if (!financialLineItems || financialLineItems.length === 0) return null;

  // Get average capex and revenue across available periods
  let totalCapex = 0;
  let totalRevenue = 0;
  let dataPoints = 0;

  for (const item of financialLineItems) {
    if (
      item.capital_expenditure !== undefined &&
      item.capital_expenditure !== null &&
      item.revenue !== undefined &&
      item.revenue !== null &&
      item.revenue > 0
    ) {
      // Capital expenditure is typically negative, so take absolute value
      totalCapex += Math.abs(item.capital_expenditure);
      totalRevenue += item.revenue;
      dataPoints++;
    }
  }

  if (dataPoints === 0 || totalRevenue === 0) return null;

  return totalCapex / totalRevenue;
}

/**
 * Assess intangible assets strength
 *
 * @param {Array} financialLineItems - Financial line items
 * @returns {Object|null} Intangible assessment
 */
function assessIntangibles(financialLineItems) {
  if (!financialLineItems || financialLineItems.length === 0) return null;

  // Examine R&D investment and goodwill/intangibles
  const item = financialLineItems[0]; // Most recent period

  if (!item) return null;

  // Check R&D intensity (if available)
  if (
    item.research_and_development !== undefined &&
    item.research_and_development !== null &&
    item.revenue !== undefined &&
    item.revenue !== null &&
    item.revenue > 0
  ) {
    const rdToRevenue = item.research_and_development / item.revenue;

    if (rdToRevenue > 0.1) {
      return {
        score: 3,
        detail: `Strong intangible moat: High R&D investment (${(
          rdToRevenue * 100
        ).toFixed(1)}% of revenue)`,
      };
    } else if (rdToRevenue > 0.05) {
      return {
        score: 2,
        detail: `Good intangible moat: Moderate R&D investment (${(
          rdToRevenue * 100
        ).toFixed(1)}% of revenue)`,
      };
    } else if (rdToRevenue > 0.02) {
      return {
        score: 1,
        detail: `Some intangible moat: Some R&D investment (${(
          rdToRevenue * 100
        ).toFixed(1)}% of revenue)`,
      };
    }
  }

  // Check goodwill and intangibles ratio
  if (
    item.goodwill_and_intangible_assets !== undefined &&
    item.goodwill_and_intangible_assets !== null &&
    item.shareholders_equity !== undefined &&
    item.shareholders_equity !== null &&
    item.shareholders_equity > 0
  ) {
    const intangibleRatio =
      item.goodwill_and_intangible_assets / item.shareholders_equity;

    // Having high intangibles can be positive or negative depending on context
    // For simplicity, we'll just report it
    return {
      score: 1,
      detail: `Intangible assets represent ${(intangibleRatio * 100).toFixed(
        1
      )}% of equity`,
    };
  }

  return null;
}

/**
 * Calculate debt to equity ratio
 *
 * @param {Array} financialLineItems - Financial line items
 * @returns {number|null} Debt to equity ratio
 */
function calculateDebtToEquity(financialLineItems) {
  if (!financialLineItems || financialLineItems.length === 0) return null;

  const item = financialLineItems[0]; // Most recent

  if (
    item.total_debt !== undefined &&
    item.total_debt !== null &&
    item.shareholders_equity !== undefined &&
    item.shareholders_equity !== null &&
    item.shareholders_equity > 0
  ) {
    return item.total_debt / item.shareholders_equity;
  }

  return null;
}

/**
 * Analyze insider trading activity
 *
 * @param {Array} insiderTrades - Insider trades data
 * @returns {Object} Insider activity analysis
 */
function analyzeInsiderActivity(insiderTrades) {
  if (!insiderTrades || insiderTrades.length === 0) {
    return { buyCount: 0, sellCount: 0, buyRatio: 0 };
  }

  let buyCount = 0;
  let sellCount = 0;

  for (const trade of insiderTrades) {
    if (trade.is_purchase) {
      buyCount++;
    } else {
      sellCount++;
    }
  }

  const totalTrades = buyCount + sellCount;
  const buyRatio = totalTrades > 0 ? buyCount / totalTrades : 0;

  return { buyCount, sellCount, buyRatio };
}

/**
 * Get average value for a specific metric
 *
 * @param {Array} financialLineItems - Financial line items
 * @param {string} metricName - Name of the metric
 * @returns {number|null} Average value
 */
function getAverageMetric(financialLineItems, metricName) {
  if (!financialLineItems || financialLineItems.length === 0) return null;

  const values = financialLineItems
    .filter(
      (item) => item[metricName] !== undefined && item[metricName] !== null
    )
    .map((item) => item[metricName]);

  if (values.length === 0) return null;

  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate growth rates from a time series
 *
 * @param {Array} values - Array of values (latest first)
 * @returns {Array} Growth rates
 */
function calculateGrowthRates(values) {
  if (!values || values.length < 2) return [];

  const growthRates = [];
  // Note: values are in reverse chronological order (latest first)
  for (let i = 0; i < values.length - 1; i++) {
    const current = values[i];
    const previous = values[i + 1];

    if (previous && previous !== 0) {
      growthRates.push((current - previous) / Math.abs(previous));
    }
  }

  return growthRates;
}

/**
 * Calculate average of an array
 *
 * @param {Array} values - Array of values
 * @returns {number} Average value
 */
function calculateAverage(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation
 *
 * @param {Array} values - Array of values
 * @returns {number} Standard deviation
 */
function calculateStandardDeviation(values) {
  if (!values || values.length < 2) return 0;

  const mean = calculateAverage(values);
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const variance = calculateAverage(squaredDiffs);

  return Math.sqrt(variance);
}

/**
 * Calculate coefficient of variation (relative volatility)
 *
 * @param {Array} values - Array of values
 * @returns {number} Coefficient of variation
 */
function calculateCoefficientOfVariation(values) {
  if (!values || values.length < 2) return 0;

  const mean = calculateAverage(values);
  if (mean === 0) return 0;

  const stdDev = calculateStandardDeviation(values);
  return stdDev / Math.abs(mean);
}
