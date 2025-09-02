import { z } from "zod";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  getCompanyNews,
  getEconomicIndicators,
  getTechnicalIndicators,
  getMarketSentiment,
} from "../tools/api.js";
import { callLLM } from "../utils/llm.js";
import progress from "../utils/progress.js";
import { getApiKeyFromState } from "../utils/api_key.js";

// Define the schema for Stanley Druckenmiller's analysis signal
const StanleyDruckenmillerSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Stanley Druckenmiller's approach:
 * - Macro-driven perspective with focus on economic cycles
 * - Strong emphasis on monetary policy and liquidity conditions
 * - Concentrated position sizing with conviction
 * - Focus on momentum and being on the right side of market forces
 * - Integration of technical, fundamental, and sentiment data
 * - Contrarian approach when sentiment extremes are detected
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Stanley Druckenmiller's analysis
 */
export async function stanleyDruckenmillerAgent(
  state,
  agentId = "stanley_druckenmiller_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const druckenmillerAnalysis = {};

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

    progress.updateStatus(agentId, ticker, "Getting company news");
    const companyNews = await getCompanyNews(ticker, endDate, 20, apiKey);

    progress.updateStatus(agentId, ticker, "Getting economic indicators");
    const economicData = await getEconomicIndicators(endDate, 365, apiKey);

    progress.updateStatus(agentId, ticker, "Getting technical indicators");
    const technicalData = await getTechnicalIndicators(
      ticker,
      endDate,
      90,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Getting market sentiment");
    const sentimentData = await getMarketSentiment(ticker, endDate, 30, apiKey);

    // Perform sub-analyses:
    progress.updateStatus(agentId, ticker, "Analyzing macro environment");
    const macroAnalysis = analyzeMacroEnvironment(economicData);

    progress.updateStatus(agentId, ticker, "Analyzing momentum and trend");
    const momentumAnalysis = analyzeMomentumAndTrend(technicalData);

    progress.updateStatus(agentId, ticker, "Analyzing sentiment extremes");
    const sentimentAnalysis = analyzeSentimentExtremes(
      sentimentData,
      companyNews
    );

    progress.updateStatus(agentId, ticker, "Analyzing fundamental factors");
    const fundamentalAnalysis = analyzeFundamentals(metrics, marketCap);

    // Combine partial scores with weights according to Druckenmiller's priorities:
    // 40% Macro Environment, 30% Momentum/Trend, 20% Sentiment, 10% Fundamentals
    const totalScore =
      macroAnalysis.score * 0.4 +
      momentumAnalysis.score * 0.3 +
      sentimentAnalysis.score * 0.2 +
      fundamentalAnalysis.score * 0.1;

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
      macroAnalysis,
      momentumAnalysis,
      sentimentAnalysis,
      fundamentalAnalysis,
    };

    progress.updateStatus(
      agentId,
      ticker,
      "Generating Stanley Druckenmiller analysis"
    );
    const druckenmillerOutput = await generateDruckenmillerOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    druckenmillerAnalysis[ticker] = {
      signal: druckenmillerOutput.signal,
      confidence: druckenmillerOutput.confidence,
      reasoning: druckenmillerOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: druckenmillerOutput.reasoning,
    });
  }

  // Save signals to state
  if (!state.data.analyst_signals) {
    state.data.analyst_signals = {};
  }
  state.data.analyst_signals[agentId] = druckenmillerAnalysis;

  if (state.metadata?.show_reasoning) {
    showAgentReasoning(druckenmillerAnalysis, "Stanley Druckenmiller Agent");
  }

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [
      { content: JSON.stringify(druckenmillerAnalysis), name: agentId },
    ],
    data: state.data,
  };
}

/**
 * Analyze the macro economic environment
 * @param {Object} economicData - Economic indicators data
 * @returns {Object} - Analysis results
 */
function analyzeMacroEnvironment(economicData) {
  if (!economicData || !economicData.indicators) {
    return {
      score: 5,
      details: "Insufficient data for macro environment analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  const getIndicator = (name) => {
    const indicator = economicData.indicators.find((i) => i.name === name);
    return indicator ? indicator.value : null;
  };

  // 1) Monetary Policy - Druckenmiller's primary focus
  const interestRate = getIndicator("interest_rate");
  const interestRateTrend = getIndicator("interest_rate_trend");

  if (interestRate !== null) {
    details.push(`Current interest rate: ${interestRate.toFixed(2)}%`);

    if (interestRateTrend !== null) {
      if (interestRateTrend > 0) {
        details.push("Interest rates rising (tightening monetary policy)");
        rawScore -= 2; // Druckenmiller typically bearish in tightening cycles
      } else if (interestRateTrend < 0) {
        details.push("Interest rates falling (easing monetary policy)");
        rawScore += 2; // Druckenmiller typically bullish in easing cycles
      } else {
        details.push("Interest rates stable");
      }
    }
  }

  // 2) Economic Growth
  const gdpGrowth = getIndicator("gdp_growth");
  const gdpTrend = getIndicator("gdp_trend");

  if (gdpGrowth !== null) {
    details.push(`GDP growth: ${gdpGrowth.toFixed(2)}%`);

    if (gdpTrend !== null) {
      if (gdpTrend > 0) {
        details.push("GDP growth accelerating");
        rawScore += 1;
      } else if (gdpTrend < 0) {
        details.push("GDP growth decelerating");
        rawScore -= 1;
      }
    }
  }

  // 3) Liquidity Conditions - Druckenmiller's focus on money supply
  const liquidityIndex = getIndicator("liquidity_index");
  const liquidityTrend = getIndicator("liquidity_trend");

  if (liquidityIndex !== null) {
    if (liquidityIndex > 70) {
      details.push("Abundant liquidity conditions");
      rawScore += 2;
    } else if (liquidityIndex < 30) {
      details.push("Tight liquidity conditions");
      rawScore -= 2;
    } else {
      details.push("Neutral liquidity conditions");
    }

    if (liquidityTrend !== null) {
      if (liquidityTrend > 0) {
        details.push("Improving liquidity trend");
        rawScore += 1;
      } else if (liquidityTrend < 0) {
        details.push("Deteriorating liquidity trend");
        rawScore -= 1;
      }
    }
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze momentum and trend
 * @param {Object} technicalData - Technical indicators data
 * @returns {Object} - Analysis results
 */
function analyzeMomentumAndTrend(technicalData) {
  if (!technicalData) {
    return { score: 5, details: "Insufficient data for momentum analysis" };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Price Trend - Druckenmiller focuses on being on the right side of major trends
  if (technicalData.trend) {
    const trendStrength = technicalData.trend.strength || 0;
    const trendDirection = technicalData.trend.direction || 0;

    // Trend Direction: positive = uptrend, negative = downtrend
    if (trendDirection > 0.5) {
      details.push("Strong uptrend");
      rawScore += 2;
    } else if (trendDirection > 0.2) {
      details.push("Moderate uptrend");
      rawScore += 1;
    } else if (trendDirection < -0.5) {
      details.push("Strong downtrend");
      rawScore -= 2;
    } else if (trendDirection < -0.2) {
      details.push("Moderate downtrend");
      rawScore -= 1;
    } else {
      details.push("No clear trend direction");
    }

    // Trend Strength: 0 to 1 scale, higher is stronger
    if (trendStrength > 0.7) {
      details.push("Very strong trend (high conviction setup)");
      rawScore += trendDirection > 0 ? 2 : -2; // Amplify based on direction
    } else if (trendStrength > 0.5) {
      details.push("Strong trend");
      rawScore += trendDirection > 0 ? 1 : -1; // Amplify based on direction
    } else if (trendStrength < 0.3) {
      details.push("Weak or inconsistent trend");
    }
  }

  // 2) Relative Strength - Druckenmiller focused on relative performance
  if (technicalData.relative_strength) {
    const relativeToMarket = technicalData.relative_strength.vs_market || 0;
    const relativeToSector = technicalData.relative_strength.vs_sector || 0;

    if (relativeToMarket > 0.1 && relativeToSector > 0.1) {
      details.push("Outperforming both market and sector (relative strength)");
      rawScore += 2;
    } else if (relativeToMarket > 0.1) {
      details.push("Outperforming market but not sector");
      rawScore += 1;
    } else if (relativeToSector > 0.1) {
      details.push("Outperforming sector but not market");
      rawScore += 1;
    } else if (relativeToMarket < -0.1 && relativeToSector < -0.1) {
      details.push(
        "Underperforming both market and sector (relative weakness)"
      );
      rawScore -= 2;
    } else if (relativeToMarket < -0.1 || relativeToSector < -0.1) {
      details.push("Underperforming either market or sector");
      rawScore -= 1;
    }
  }

  // 3) Volume Confirmation - Druckenmiller valued volume-confirmed moves
  if (technicalData.volume) {
    const volumeTrend = technicalData.volume.trend || 0;
    const volumeOnMoves = technicalData.volume.on_price_moves || 0;

    if (volumeTrend > 0.5 && technicalData.trend?.direction > 0) {
      details.push("Increasing volume on uptrend (confirmation)");
      rawScore += 1;
    } else if (volumeTrend < -0.5 && technicalData.trend?.direction < 0) {
      details.push("Decreasing volume on downtrend (potential exhaustion)");
      rawScore += 0.5;
    }

    if (volumeOnMoves > 0.7) {
      details.push("Strong volume confirmation on price moves");
      rawScore += 1;
    } else if (volumeOnMoves < 0.3) {
      details.push("Poor volume confirmation on price moves");
      rawScore -= 1;
    }
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze sentiment extremes
 * @param {Object} sentimentData - Market sentiment data
 * @param {Array} companyNews - Company news data
 * @returns {Object} - Analysis results
 */
function analyzeSentimentExtremes(sentimentData, companyNews) {
  if (!sentimentData) {
    return { score: 5, details: "Insufficient data for sentiment analysis" };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Market Sentiment - Druckenmiller often took contrarian positions at extremes
  if (sentimentData.market_sentiment) {
    const sentiment = sentimentData.market_sentiment.score || 0;
    const sentimentExtreme = Math.abs(sentiment) > 0.7;

    if (sentiment > 0.7) {
      details.push(
        "Extremely bullish market sentiment (potential contrarian signal)"
      );
      rawScore -= 1; // Druckenmiller could be contrarian at extremes
    } else if (sentiment > 0.5) {
      details.push("Bullish market sentiment");
      rawScore += 1;
    } else if (sentiment < -0.7) {
      details.push(
        "Extremely bearish market sentiment (potential contrarian signal)"
      );
      rawScore += 1; // Contrarian at extremes
    } else if (sentiment < -0.5) {
      details.push("Bearish market sentiment");
      rawScore -= 1;
    } else {
      details.push("Neutral market sentiment");
    }
  }

  // 2) Investor Positioning - Druckenmiller paid attention to positioning
  if (sentimentData.investor_positioning) {
    const positioning = sentimentData.investor_positioning.level || 0;

    if (positioning > 0.8) {
      details.push("Extremely crowded long positioning (risk of unwinding)");
      rawScore -= 2;
    } else if (positioning > 0.6) {
      details.push("Crowded long positioning");
      rawScore -= 1;
    } else if (positioning < 0.2) {
      details.push("Extremely underweight positioning (potential for buying)");
      rawScore += 2;
    } else if (positioning < 0.4) {
      details.push("Underweight positioning");
      rawScore += 1;
    } else {
      details.push("Neutral investor positioning");
    }
  }

  // 3) News Sentiment Analysis
  if (companyNews && companyNews.length > 0) {
    const sentiments = companyNews.map((news) => news.sentiment || 0);
    const avgSentiment =
      sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;

    if (avgSentiment > 0.5) {
      details.push("Very positive news sentiment");
      rawScore += 1;
    } else if (avgSentiment > 0.2) {
      details.push("Positive news sentiment");
      rawScore += 0.5;
    } else if (avgSentiment < -0.5) {
      details.push("Very negative news sentiment");
      rawScore -= 1;
    } else if (avgSentiment < -0.2) {
      details.push("Negative news sentiment");
      rawScore -= 0.5;
    } else {
      details.push("Neutral news sentiment");
    }
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze fundamental factors
 * @param {Object} metrics - Financial metrics
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Analysis results
 */
function analyzeFundamentals(metrics, marketCap) {
  if (!metrics) {
    return { score: 5, details: "Insufficient data for fundamental analysis" };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Earnings Growth - Druckenmiller valued growth, though less than macro factors
  if (metrics.earnings_growth) {
    const growthRate = metrics.earnings_growth.growth_rate_3yr || 0;
    const growthAccelerating = metrics.earnings_growth.accelerating || false;

    if (growthRate > 0.25) {
      details.push(
        `Strong earnings growth: ${(growthRate * 100).toFixed(1)}% 3-year CAGR`
      );
      rawScore += 2;
    } else if (growthRate > 0.15) {
      details.push(
        `Good earnings growth: ${(growthRate * 100).toFixed(1)}% 3-year CAGR`
      );
      rawScore += 1;
    } else if (growthRate < 0) {
      details.push(
        `Negative earnings growth: ${(growthRate * 100).toFixed(
          1
        )}% 3-year CAGR`
      );
      rawScore -= 1;
    }

    if (growthAccelerating) {
      details.push("Earnings growth accelerating");
      rawScore += 1;
    }
  }

  // 2) Cash Flow Generation - Druckenmiller valued cash flow
  if (metrics.cash_flow) {
    const fcfYield = metrics.cash_flow.fcf_yield || 0;
    const fcfGrowth = metrics.cash_flow.fcf_growth || 0;

    if (fcfYield > 0.08) {
      details.push(
        `Strong free cash flow yield: ${(fcfYield * 100).toFixed(1)}%`
      );
      rawScore += 1;
    } else if (fcfYield < 0) {
      details.push("Negative free cash flow yield");
      rawScore -= 1;
    }

    if (fcfGrowth > 0.15) {
      details.push(`Strong FCF growth: ${(fcfGrowth * 100).toFixed(1)}%`);
      rawScore += 1;
    } else if (fcfGrowth < 0) {
      details.push(`Declining FCF: ${(fcfGrowth * 100).toFixed(1)}%`);
      rawScore -= 1;
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
async function generateDruckenmillerOutput(ticker, analysis, state, agentId) {
  const prompt = `
You are analyzing ${ticker} using Stanley Druckenmiller's investment approach. Here's the data:

MACRO ENVIRONMENT ANALYSIS:
${analysis.macroAnalysis.details}

MOMENTUM AND TREND ANALYSIS:
${analysis.momentumAnalysis.details}

SENTIMENT ANALYSIS:
${analysis.sentimentAnalysis.details}

FUNDAMENTAL ANALYSIS:
${analysis.fundamentalAnalysis.details}

Based on this analysis and using Stanley Druckenmiller's methodology:
1. The overall score is ${analysis.score.toFixed(
    1
  )} out of ${analysis.maxScore.toFixed(1)}
2. The preliminary signal is "${analysis.signal}"

As Stanley Druckenmiller, provide your final investment recommendation:
1. Signal: bullish, bearish, or neutral
2. Confidence: 0-100 (where 100 is highest confidence)
3. Reasoning: A concise summary explaining the recommendation

Remember Druckenmiller's key principles:
- Macro-driven perspective with focus on economic cycles
- Strong emphasis on monetary policy and liquidity conditions
- Concentrated position sizing with conviction
- Focus on momentum and being on the right side of market forces
- Integration of technical, fundamental, and sentiment data
- Contrarian approach when sentiment extremes are detected

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
    return StanleyDruckenmillerSignalSchema.parse(responseData);
  } catch (error) {
    console.error(
      `Error generating Druckenmiller output for ${ticker}:`,
      error
    );

    // Return fallback output
    return {
      signal: analysis.signal,
      confidence: analysis.score * 10, // Convert 0-10 score to 0-100 confidence
      reasoning: `Based on Stanley Druckenmiller's principles, ${ticker} shows ${
        analysis.signal
      } indicators with key factors including: ${
        analysis.macroAnalysis.details.split(";")[0]
      }; ${analysis.momentumAnalysis.details.split(";")[0]}; ${
        analysis.sentimentAnalysis.details.split(";")[0]
      }.`,
    };
  }
}
