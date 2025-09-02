import { z } from "zod";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  getCompanyNews,
  getTechnicalIndicators,
} from "../tools/api.js";
import { callLLM } from "../utils/llm.js";
import progress from "../utils/progress.js";
import { getApiKeyFromState } from "../utils/api_key.js";

// Define the schema for Cathie Wood's analysis signal
const CathieWoodSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Cathie Wood's innovative technology and growth investment principles
 * Focuses on disruptive innovation, exponential growth potential, and technological trends
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Cathie Wood's analysis
 */
export async function cathieWoodAgent(state, agentId = "cathie_wood_agent") {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const woodAnalysis = {};

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

    progress.updateStatus(agentId, ticker, "Fetching technical indicators");
    const technicalData = await getTechnicalIndicators(
      ticker,
      endDate,
      90,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Fetching recent news");
    const newsData = await getCompanyNews(ticker, endDate, 30, 10, apiKey);

    progress.updateStatus(
      agentId,
      ticker,
      "Analyzing innovation and growth potential"
    );
    const innovationAnalysis = analyzeInnovationPotential(metrics, newsData);

    progress.updateStatus(
      agentId,
      ticker,
      "Analyzing market momentum and technical indicators"
    );
    const momentumAnalysis = analyzeMomentumAndTrends(technicalData);

    progress.updateStatus(
      agentId,
      ticker,
      "Evaluating growth valuation metrics"
    );
    const valuationAnalysis = evaluateGrowthValuation(metrics, marketCap);

    // Combine analyses to determine preliminary signal
    const combinedScore =
      innovationAnalysis.score * 0.5 +
      momentumAnalysis.score * 0.3 +
      valuationAnalysis.score * 0.2;

    // Scale 0-1
    const normalizedScore = combinedScore / 10;
    let signal = "neutral";
    let confidence = 0.5;

    if (normalizedScore > 0.7) {
      signal = "bullish";
      confidence = 0.6 + (normalizedScore - 0.7) * 0.75; // 0.6 to 0.9
    } else if (normalizedScore < 0.3) {
      signal = "bearish";
      confidence = 0.6 + (0.3 - normalizedScore) * 0.75; // 0.6 to 0.9
    } else {
      // Neutral zone - confidence increases as it moves away from 0.5
      confidence = 0.5 + Math.abs(normalizedScore - 0.5) * 0.2;
    }

    // Store analysis data for LLM reasoning
    analysisData[ticker] = {
      metrics,
      marketCap,
      technicalData,
      newsData,
      innovationAnalysis,
      momentumAnalysis,
      valuationAnalysis,
      combinedScore,
      normalizedScore,
      preliminarySignal: signal,
      preliminaryConfidence: confidence,
    };

    progress.updateStatus(agentId, ticker, "Generating Cathie Wood analysis");
    const woodOutput = await generateWoodOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    woodAnalysis[ticker] = {
      signal: woodOutput.signal,
      confidence: woodOutput.confidence,
      reasoning: woodOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: woodOutput.reasoning,
    });
  }

  // Show reasoning if requested
  if (state.metadata.show_reasoning) {
    showAgentReasoning(woodAnalysis, "Cathie Wood Agent");
  }

  // Add signals to the overall state
  state.data.analyst_signals[agentId] = woodAnalysis;

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(woodAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Analyze a company's innovation potential and growth prospects
 *
 * @param {Array} metrics - Financial metrics data
 * @param {Array} newsData - Recent news data
 * @returns {Object} - Innovation analysis
 */
function analyzeInnovationPotential(metrics, newsData) {
  let score = 0;
  const insights = [];

  // Check revenue growth as a proxy for innovation success
  if (metrics && metrics.length > 0) {
    const revenueGrowth = metrics.find(
      (m) => m.revenue_growth !== undefined
    )?.revenue_growth;

    if (revenueGrowth !== undefined) {
      if (revenueGrowth > 0.3) {
        score += 3;
        insights.push(
          "Exceptional revenue growth (>30%) indicating strong product-market fit"
        );
      } else if (revenueGrowth > 0.15) {
        score += 2;
        insights.push(
          "Strong revenue growth (>15%) suggesting successful innovation"
        );
      } else if (revenueGrowth > 0.07) {
        score += 1;
        insights.push("Moderate revenue growth (>7%)");
      }
    }

    // Check R&D intensity if available
    const rdExpense = metrics.find(
      (m) => m.research_and_development_expense !== undefined
    )?.research_and_development_expense;
    const revenue = metrics.find((m) => m.revenue !== undefined)?.revenue;

    if (rdExpense !== undefined && revenue !== undefined && revenue > 0) {
      const rdRatio = rdExpense / revenue;

      if (rdRatio > 0.15) {
        score += 2;
        insights.push(
          "High R&D investment (>15% of revenue) focused on innovation"
        );
      } else if (rdRatio > 0.08) {
        score += 1;
        insights.push("Good R&D investment (>8% of revenue)");
      }
    }
  }

  // Check news for innovation keywords
  if (newsData && newsData.length > 0) {
    const innovationKeywords = [
      "artificial intelligence",
      "ai",
      "machine learning",
      "blockchain",
      "automation",
      "robotics",
      "autonomous",
      "disruptive",
      "innovation",
      "genomics",
      "fintech",
      "renewable",
      "cloud",
      "platform",
      "digital",
      "transformation",
      "breakthrough",
      "patent",
      "research",
      "development",
    ];

    const innovativeNewsCount = newsData.filter((news) => {
      const combinedText = `${news.title} ${news.summary}`.toLowerCase();
      return innovationKeywords.some((keyword) =>
        combinedText.includes(keyword)
      );
    }).length;

    if (innovativeNewsCount >= 3) {
      score += 2;
      insights.push(
        `Strong innovation narrative in recent news (${innovativeNewsCount} mentions)`
      );
    } else if (innovativeNewsCount > 0) {
      score += 1;
      insights.push(
        `Some innovation mentions in recent news (${innovativeNewsCount} mentions)`
      );
    }
  }

  // Add general innovation assessment
  if (score >= 5) {
    insights.push(
      "Overall: Highly innovative company with strong growth trajectory"
    );
  } else if (score >= 3) {
    insights.push("Overall: Company shows promising innovation potential");
  } else {
    insights.push("Overall: Limited evidence of disruptive innovation");
  }

  return {
    score: Math.min(score, 5), // Cap at 5
    insights: insights.join(". "),
  };
}

/**
 * Analyze market momentum and technical trends
 *
 * @param {Array} technicalData - Technical indicators data
 * @returns {Object} - Momentum analysis
 */
function analyzeMomentumAndTrends(technicalData) {
  let score = 0;
  const insights = [];

  if (!technicalData || technicalData.length < 20) {
    return {
      score: 0,
      insights: "Insufficient technical data for analysis",
    };
  }

  // Sort data chronologically
  const sortedData = [...technicalData].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // Check price momentum (recent prices vs moving averages)
  const recentData = sortedData[sortedData.length - 1];

  if (recentData.close > recentData.sma_50) {
    score += 1;
    insights.push("Price trading above 50-day moving average");

    if (recentData.close > recentData.sma_200) {
      score += 1;
      insights.push("Price trading above 200-day moving average (bullish)");
    }
  } else {
    insights.push("Price trading below 50-day moving average (cautious)");
  }

  // Check for moving average crossover
  const previousData = sortedData[sortedData.length - 2];

  if (
    previousData &&
    previousData.sma_50 < previousData.sma_200 &&
    recentData.sma_50 > recentData.sma_200
  ) {
    score += 1.5;
    insights.push("Recent golden cross (50-day MA crossing above 200-day MA)");
  }

  // Analyze RSI for momentum
  if (recentData.rsi !== undefined) {
    if (recentData.rsi > 70) {
      score -= 1;
      insights.push(
        "Overbought RSI conditions (>70) indicating potential pullback"
      );
    } else if (recentData.rsi < 30) {
      score += 0.5;
      insights.push(
        "Oversold RSI conditions (<30) suggesting potential value opportunity"
      );
    } else if (recentData.rsi > 55) {
      score += 0.5;
      insights.push("Positive RSI momentum while not yet overbought");
    }
  }

  // Check volume trends
  const recentVolumes = sortedData.slice(-10).map((d) => d.volume);
  const olderVolumes = sortedData.slice(-20, -10).map((d) => d.volume);

  if (recentVolumes.length > 0 && olderVolumes.length > 0) {
    const avgRecentVolume =
      recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
    const avgOlderVolume =
      olderVolumes.reduce((sum, vol) => sum + vol, 0) / olderVolumes.length;

    if (avgRecentVolume > avgOlderVolume * 1.2) {
      score += 1;
      insights.push(
        "Increasing trading volume (20% higher than previous period)"
      );
    }
  }

  // MACD analysis
  if (recentData.macd !== undefined && recentData.macd_signal !== undefined) {
    if (recentData.macd > recentData.macd_signal) {
      score += 1;
      insights.push("Positive MACD crossover (bullish momentum)");
    } else {
      insights.push("Negative MACD signal (bearish momentum)");
    }
  }

  return {
    score: Math.min(Math.max(score, 0), 5), // Cap between 0-5
    insights: insights.join(". "),
  };
}

/**
 * Evaluate growth valuation metrics
 *
 * @param {Array} metrics - Financial metrics
 * @param {Object} marketCap - Market cap data
 * @returns {Object} - Valuation analysis
 */
function evaluateGrowthValuation(metrics, marketCap) {
  let score = 2.5; // Start neutral
  const insights = [];

  if (!metrics || metrics.length === 0 || !marketCap) {
    return {
      score: 2.5,
      insights: "Insufficient data for valuation analysis",
    };
  }

  const currentMetrics = metrics[0];

  // Analyze P/E relative to growth (PEG ratio)
  if (
    currentMetrics.price_to_earnings_ratio !== undefined &&
    currentMetrics.earnings_growth !== undefined &&
    currentMetrics.earnings_growth > 0
  ) {
    const pegRatio =
      currentMetrics.price_to_earnings_ratio /
      (currentMetrics.earnings_growth * 100);

    if (pegRatio < 1) {
      score += 1.5;
      insights.push(
        `PEG ratio below 1 (${pegRatio.toFixed(
          2
        )}) indicating undervaluation relative to growth`
      );
    } else if (pegRatio < 1.5) {
      score += 0.5;
      insights.push(`Reasonable PEG ratio (${pegRatio.toFixed(2)})`);
    } else if (pegRatio > 2.5) {
      score -= 1;
      insights.push(
        `High PEG ratio (${pegRatio.toFixed(2)}) suggesting premium valuation`
      );
    }
  }

  // Revenue multiple analysis - Cathie Wood often looks at price-to-sales for growth companies
  if (currentMetrics.price_to_sales_ratio !== undefined) {
    const psRatio = currentMetrics.price_to_sales_ratio;

    // Adjust expectations based on growth rate
    const growthRate = currentMetrics.revenue_growth || 0.1; // Default to 10% if unknown
    const growthAdjustedThreshold = Math.min(15, 5 + (growthRate * 100) / 2);

    if (psRatio > growthAdjustedThreshold) {
      score -= 1;
      insights.push(
        `High P/S ratio (${psRatio.toFixed(2)}) even accounting for ${(
          growthRate * 100
        ).toFixed(0)}% growth`
      );
    } else if (psRatio < growthAdjustedThreshold / 2) {
      score += 1;
      insights.push(
        `Attractive P/S ratio (${psRatio.toFixed(2)}) relative to ${(
          growthRate * 100
        ).toFixed(0)}% growth`
      );
    } else {
      insights.push(
        `Reasonable P/S ratio (${psRatio.toFixed(2)}) for growth profile`
      );
    }
  }

  // Gross margin analysis - Wood favors companies with high gross margins
  if (currentMetrics.gross_margin !== undefined) {
    if (currentMetrics.gross_margin > 0.7) {
      score += 1;
      insights.push(
        "Exceptional gross margins (>70%) supporting innovation capacity"
      );
    } else if (currentMetrics.gross_margin > 0.5) {
      score += 0.5;
      insights.push("Healthy gross margins (>50%)");
    } else if (currentMetrics.gross_margin < 0.3) {
      score -= 0.5;
      insights.push("Low gross margins (<30%) limiting reinvestment potential");
    }
  }

  return {
    score: Math.min(Math.max(score, 0), 5), // Cap between 0-5
    insights: insights.join(". "),
  };
}

/**
 * Generate Cathie Wood's analysis output using LLM
 *
 * @param {string} ticker - The stock ticker
 * @param {Object} analysisData - Analysis data for the ticker
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Cathie Wood's analysis
 */
async function generateWoodOutput(ticker, analysisData, state, agentId) {
  const {
    innovationAnalysis,
    momentumAnalysis,
    valuationAnalysis,
    normalizedScore,
    preliminarySignal,
    preliminaryConfidence,
  } = analysisData;

  // Extract relevant news for context
  const innovationNews = analysisData.newsData
    .slice(0, 3)
    .map((news) => `- ${news.title} (${news.published_date})`)
    .join("\n");

  const prompt = `
  You are Cathie Wood, founder of Ark Invest, known for investing in disruptive innovation and high-growth technology companies.

  Based on the following analysis of ${ticker}, provide your investment recommendation:

  Innovation & Growth Analysis:
  ${innovationAnalysis.insights}

  Market Momentum & Technical Analysis:
  ${momentumAnalysis.insights}

  Growth Valuation Analysis:
  ${valuationAnalysis.insights}

  Recent Relevant News:
  ${innovationNews}

  Overall Score: ${(normalizedScore * 10).toFixed(1)}/10
  Preliminary Signal: ${preliminarySignal.toUpperCase()}
  Confidence Level: ${preliminaryConfidence.toFixed(2)}

  Please respond with:
  1. Your investment signal (bullish, bearish, or neutral)
  2. Your confidence level (0.0 to 1.0)
  3. Your detailed reasoning in Cathie Wood's voice, focusing on:
     - Assessment of disruptive innovation potential
     - Growth trajectory and market opportunity
     - Technical momentum and investor sentiment
     - Valuation considerations for high-growth companies
     - Overall investment thesis with emphasis on future potential

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
    return CathieWoodSignalSchema.parse(jsonResponse);
  } catch (error) {
    console.error("Error parsing Cathie Wood LLM response:", error);
    return {
      signal: preliminarySignal,
      confidence: preliminaryConfidence,
      reasoning:
        "Error generating detailed analysis. Using quantitative signals only.",
    };
  }
}
