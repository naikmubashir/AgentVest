import { z } from "zod";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  searchLineItems,
  getInsiderTrades,
  getCompanyNews,
} from "../tools/api.js";
import { callLLM } from "../utils/llm.js";
import progress from "../utils/progress.js";
import { getApiKeyFromState } from "../utils/api_key.js";

// Define the schema for Peter Lynch's analysis signal
const PeterLynchSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Peter Lynch's investing principles:
 * - Invest in what you know (clear, understandable businesses).
 * - Growth at a Reasonable Price (GARP), emphasizing the PEG ratio.
 * - Look for consistent revenue & EPS increases and manageable debt.
 * - Be alert for potential "ten-baggers" (high-growth opportunities).
 * - Avoid overly complex or highly leveraged businesses.
 * - Use news sentiment and insider trades for secondary inputs.
 * - If fundamentals strongly align with GARP, be more aggressive.
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Peter Lynch's analysis
 */
export async function peterLynchAgent(state, agentId = "peter_lynch_agent") {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const lynchAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Gathering financial line items");
    // Relevant line items for Peter Lynch's approach
    const financialLineItems = await searchLineItems(
      ticker,
      [
        "revenue",
        "earnings_per_share",
        "net_income",
        "operating_income",
        "gross_margin",
        "operating_margin",
        "free_cash_flow",
        "capital_expenditure",
        "cash_and_equivalents",
        "total_debt",
        "shareholders_equity",
        "outstanding_shares",
      ],
      endDate,
      "annual",
      5,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Getting market cap");
    const marketCap = await getMarketCap(ticker, endDate, apiKey);

    progress.updateStatus(agentId, ticker, "Fetching insider trades");
    const insiderTrades = await getInsiderTrades(ticker, endDate, 50, apiKey);

    progress.updateStatus(agentId, ticker, "Fetching company news");
    const companyNews = await getCompanyNews(ticker, endDate, 50, apiKey);

    // Perform sub-analyses:
    progress.updateStatus(agentId, ticker, "Analyzing growth");
    const growthAnalysis = analyzeLynchGrowth(financialLineItems);

    progress.updateStatus(agentId, ticker, "Analyzing fundamentals");
    const fundamentalsAnalysis = analyzeLynchFundamentals(financialLineItems);

    progress.updateStatus(
      agentId,
      ticker,
      "Analyzing valuation (focus on PEG)"
    );
    const valuationAnalysis = analyzeLynchValuation(
      financialLineItems,
      marketCap
    );

    progress.updateStatus(agentId, ticker, "Analyzing sentiment");
    const sentimentAnalysis = analyzeSentiment(companyNews);

    progress.updateStatus(agentId, ticker, "Analyzing insider activity");
    const insiderActivity = analyzeInsiderActivity(insiderTrades);

    // Combine partial scores with weights typical for Peter Lynch:
    //   30% Growth, 25% Valuation, 20% Fundamentals,
    //   15% Sentiment, 10% Insider Activity = 100%
    const totalScore =
      growthAnalysis.score * 0.3 +
      valuationAnalysis.score * 0.25 +
      fundamentalsAnalysis.score * 0.2 +
      sentimentAnalysis.score * 0.15 +
      insiderActivity.score * 0.1;

    const maxPossibleScore = 10.0;

    // Map final score to signal
    let signal;
    if (totalScore >= 7.5) {
      signal = "bullish";
    } else if (totalScore <= 4.5) {
      signal = "bearish";
    } else {
      signal = "neutral";
    }

    analysisData[ticker] = {
      signal,
      score: totalScore,
      maxScore: maxPossibleScore,
      growthAnalysis,
      valuationAnalysis,
      fundamentalsAnalysis,
      sentimentAnalysis,
      insiderActivity,
    };

    progress.updateStatus(agentId, ticker, "Generating Peter Lynch analysis");
    const lynchOutput = await generateLynchOutput(
      ticker,
      analysisData[ticker],
      state,
      agentId
    );

    lynchAnalysis[ticker] = {
      signal: lynchOutput.signal,
      confidence: lynchOutput.confidence,
      reasoning: lynchOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: lynchOutput.reasoning,
    });
  }

  // Save signals to state
  if (!state.data.analyst_signals) {
    state.data.analyst_signals = {};
  }
  state.data.analyst_signals[agentId] = lynchAnalysis;

  if (state.metadata?.show_reasoning) {
    showAgentReasoning(lynchAnalysis, "Peter Lynch Agent");
  }

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(lynchAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Evaluate growth based on revenue and EPS trends
 * @param {Array} financialLineItems - Financial data
 * @returns {Object} - Analysis results
 */
function analyzeLynchGrowth(financialLineItems) {
  if (!financialLineItems || financialLineItems.length < 2) {
    return {
      score: 0,
      details: "Insufficient financial data for growth analysis",
    };
  }

  const details = [];
  let rawScore = 0; // We'll sum up points, then scale to 0–10 eventually

  // 1) Revenue Growth
  const revenues = financialLineItems
    .filter((fi) => fi.revenue !== null && fi.revenue !== undefined)
    .map((fi) => fi.revenue);

  if (revenues.length >= 2) {
    const latestRev = revenues[0];
    const olderRev = revenues[revenues.length - 1];

    if (olderRev > 0) {
      const revGrowth = (latestRev - olderRev) / Math.abs(olderRev);

      if (revGrowth > 0.25) {
        rawScore += 3;
        details.push(`Strong revenue growth: ${(revGrowth * 100).toFixed(1)}%`);
      } else if (revGrowth > 0.1) {
        rawScore += 2;
        details.push(
          `Moderate revenue growth: ${(revGrowth * 100).toFixed(1)}%`
        );
      } else if (revGrowth > 0.02) {
        rawScore += 1;
        details.push(`Slight revenue growth: ${(revGrowth * 100).toFixed(1)}%`);
      } else {
        details.push(
          `Flat or negative revenue growth: ${(revGrowth * 100).toFixed(1)}%`
        );
      }
    } else {
      details.push(
        "Older revenue is zero/negative; can't compute revenue growth."
      );
    }
  } else {
    details.push("Not enough revenue data to assess growth.");
  }

  // 2) EPS Growth
  const epsValues = financialLineItems
    .filter(
      (fi) =>
        fi.earnings_per_share !== null && fi.earnings_per_share !== undefined
    )
    .map((fi) => fi.earnings_per_share);

  if (epsValues.length >= 2) {
    const latestEps = epsValues[0];
    const olderEps = epsValues[epsValues.length - 1];

    if (Math.abs(olderEps) > 1e-9) {
      const epsGrowth = (latestEps - olderEps) / Math.abs(olderEps);

      if (epsGrowth > 0.25) {
        rawScore += 3;
        details.push(`Strong EPS growth: ${(epsGrowth * 100).toFixed(1)}%`);
      } else if (epsGrowth > 0.1) {
        rawScore += 2;
        details.push(`Moderate EPS growth: ${(epsGrowth * 100).toFixed(1)}%`);
      } else if (epsGrowth > 0.02) {
        rawScore += 1;
        details.push(`Slight EPS growth: ${(epsGrowth * 100).toFixed(1)}%`);
      } else {
        details.push(
          `Minimal or negative EPS growth: ${(epsGrowth * 100).toFixed(1)}%`
        );
      }
    } else {
      details.push("Older EPS is near zero; skipping EPS growth calculation.");
    }
  } else {
    details.push("Not enough EPS data for growth calculation.");
  }

  // rawScore can be up to 6 => scale to 0–10
  const finalScore = Math.min(10, (rawScore / 6) * 10);
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Evaluate basic fundamentals
 * @param {Array} financialLineItems - Financial data
 * @returns {Object} - Analysis results
 */
function analyzeLynchFundamentals(financialLineItems) {
  if (!financialLineItems || financialLineItems.length === 0) {
    return { score: 0, details: "Insufficient fundamentals data" };
  }

  const details = [];
  let rawScore = 0; // We'll accumulate up to 6 points, then scale to 0–10

  // 1) Debt-to-Equity
  const debtValues = financialLineItems
    .filter((fi) => fi.total_debt !== null && fi.total_debt !== undefined)
    .map((fi) => fi.total_debt);

  const eqValues = financialLineItems
    .filter(
      (fi) =>
        fi.shareholders_equity !== null && fi.shareholders_equity !== undefined
    )
    .map((fi) => fi.shareholders_equity);

  if (
    debtValues.length > 0 &&
    eqValues.length > 0 &&
    debtValues.length === eqValues.length
  ) {
    const recentDebt = debtValues[0];
    const recentEquity = eqValues[0] || 1e-9;
    const deRatio = recentDebt / recentEquity;

    if (deRatio < 0.5) {
      rawScore += 2;
      details.push(`Low debt-to-equity: ${deRatio.toFixed(2)}`);
    } else if (deRatio < 1.0) {
      rawScore += 1;
      details.push(`Moderate debt-to-equity: ${deRatio.toFixed(2)}`);
    } else {
      details.push(`High debt-to-equity: ${deRatio.toFixed(2)}`);
    }
  } else {
    details.push("No consistent debt/equity data available.");
  }

  // 2) Operating Margin
  const omValues = financialLineItems
    .filter(
      (fi) => fi.operating_margin !== null && fi.operating_margin !== undefined
    )
    .map((fi) => fi.operating_margin);

  if (omValues.length > 0) {
    const omRecent = omValues[0];

    if (omRecent > 0.2) {
      rawScore += 2;
      details.push(`Strong operating margin: ${(omRecent * 100).toFixed(1)}%`);
    } else if (omRecent > 0.1) {
      rawScore += 1;
      details.push(
        `Moderate operating margin: ${(omRecent * 100).toFixed(1)}%`
      );
    } else {
      details.push(`Low operating margin: ${(omRecent * 100).toFixed(1)}%`);
    }
  } else {
    details.push("No operating margin data available.");
  }

  // 3) Positive Free Cash Flow
  const fcfValues = financialLineItems
    .filter(
      (fi) => fi.free_cash_flow !== null && fi.free_cash_flow !== undefined
    )
    .map((fi) => fi.free_cash_flow);

  if (fcfValues.length > 0) {
    if (fcfValues[0] > 0) {
      rawScore += 2;
      details.push(`Positive free cash flow: ${fcfValues[0].toLocaleString()}`);
    } else {
      details.push(`Recent FCF is negative: ${fcfValues[0].toLocaleString()}`);
    }
  } else {
    details.push("No free cash flow data available.");
  }

  // rawScore up to 6 => scale to 0–10
  const finalScore = Math.min(10, (rawScore / 6) * 10);
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Evaluate Peter Lynch's Growth at a Reasonable Price (GARP) approach
 * @param {Array} financialLineItems - Financial data
 * @param {number} marketCap - Market capitalization
 * @returns {Object} - Valuation analysis
 */
function analyzeLynchValuation(financialLineItems, marketCap) {
  if (!financialLineItems || !marketCap) {
    return { score: 0, details: "Insufficient data for valuation" };
  }

  const details = [];
  let rawScore = 0;

  // Get EPS data
  const epsData = financialLineItems
    .filter(
      (fi) =>
        fi.earnings_per_share !== null && fi.earnings_per_share !== undefined
    )
    .map((fi) => fi.earnings_per_share);

  // Get outstanding shares
  const sharesData = financialLineItems
    .filter(
      (fi) =>
        fi.outstanding_shares !== null && fi.outstanding_shares !== undefined
    )
    .map((fi) => fi.outstanding_shares);

  // Calculate P/E ratio if possible
  if (
    epsData.length > 0 &&
    epsData[0] > 0 &&
    sharesData.length > 0 &&
    sharesData[0] > 0
  ) {
    const earnings = epsData[0] * sharesData[0];
    const pe = marketCap / earnings;

    details.push(`P/E ratio: ${pe.toFixed(2)}`);

    // Basic P/E evaluation (Lynch liked reasonable P/Es)
    if (pe < 15) {
      rawScore += 1;
      details.push("P/E below 15 (attractive)");
    } else if (pe > 30) {
      details.push("P/E above 30 (expensive)");
    } else {
      details.push("P/E between 15-30 (reasonable)");
    }

    // Try to calculate PEG (Lynch's favorite metric)
    if (epsData.length >= 3) {
      // Calculate EPS growth rate over available periods
      const oldestEps = epsData[epsData.length - 1];
      const latestEps = epsData[0];

      if (oldestEps > 0) {
        const growthRate =
          Math.pow(latestEps / oldestEps, 1 / (epsData.length - 1)) - 1;
        const annualGrowthPercent = growthRate * 100;

        if (annualGrowthPercent > 0) {
          const peg = pe / annualGrowthPercent;

          details.push(
            `PEG ratio: ${peg.toFixed(
              2
            )} (Annual EPS growth: ${annualGrowthPercent.toFixed(1)}%)`
          );

          // PEG evaluation (Lynch's sweet spot was < 1)
          if (peg < 0.5) {
            rawScore += 6;
            details.push(
              "PEG below 0.5 (very attractive by Lynch's standards)"
            );
          } else if (peg < 1.0) {
            rawScore += 4;
            details.push("PEG below 1.0 (attractive by Lynch's standards)");
          } else if (peg < 1.5) {
            rawScore += 2;
            details.push("PEG below 1.5 (acceptable by Lynch's standards)");
          } else {
            details.push("PEG above 1.5 (expensive by Lynch's standards)");
          }
        } else {
          details.push("Negative EPS growth; PEG not applicable");
        }
      } else {
        details.push(
          "Historical EPS negative or zero; can't calculate reliable growth rate"
        );
      }
    } else {
      details.push("Insufficient EPS history to calculate growth rate for PEG");

      // Without PEG, put more weight on P/E
      if (pe < 10) {
        rawScore += 3;
        details.push("Very low P/E may indicate value");
      } else if (pe < 15) {
        rawScore += 2;
        details.push("Reasonable P/E");
      }
    }
  } else {
    details.push(
      "Unable to calculate P/E - missing EPS or shares data, or negative earnings"
    );
    rawScore = 0;
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, rawScore);
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze news sentiment
 * @param {Array} companyNews - News data
 * @returns {Object} - Sentiment analysis
 */
function analyzeSentiment(companyNews) {
  if (!companyNews || companyNews.length === 0) {
    return { score: 5, details: "No news data available" };
  }

  // Simple heuristic - count positive vs negative articles
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;

  companyNews.forEach((news) => {
    const sentiment = news.sentiment || 0;

    if (sentiment > 0.2) {
      positiveCount++;
    } else if (sentiment < -0.2) {
      negativeCount++;
    } else {
      neutralCount++;
    }
  });

  const totalArticles = positiveCount + neutralCount + negativeCount;
  const positiveRatio = positiveCount / totalArticles;
  const negativeRatio = negativeCount / totalArticles;

  let details;
  let score;

  if (positiveRatio > 0.6) {
    details = `Strong positive news sentiment: ${(positiveRatio * 100).toFixed(
      1
    )}% positive articles`;
    score = 8 + (positiveRatio - 0.6) * 5; // 8-10 range
  } else if (positiveRatio > 0.4) {
    details = `Moderately positive news sentiment: ${(
      positiveRatio * 100
    ).toFixed(1)}% positive articles`;
    score = 6 + (positiveRatio - 0.4) * 10; // 6-8 range
  } else if (negativeRatio > 0.6) {
    details = `Strong negative news sentiment: ${(negativeRatio * 100).toFixed(
      1
    )}% negative articles`;
    score = 2 - (negativeRatio - 0.6) * 5; // 0-2 range
  } else if (negativeRatio > 0.4) {
    details = `Moderately negative news sentiment: ${(
      negativeRatio * 100
    ).toFixed(1)}% negative articles`;
    score = 4 - (negativeRatio - 0.4) * 10; // 2-4 range
  } else {
    details = `Neutral news sentiment: ${neutralCount} neutral, ${positiveCount} positive, ${negativeCount} negative articles`;
    score = 5;
  }

  return { score: Math.min(10, Math.max(0, score)), details };
}

/**
 * Analyze insider trading activity
 * @param {Array} insiderTrades - Insider trading data
 * @returns {Object} - Analysis results
 */
function analyzeInsiderActivity(insiderTrades) {
  if (!insiderTrades || insiderTrades.length === 0) {
    return { score: 5, details: "No insider trading data available" };
  }

  let buyVolume = 0;
  let sellVolume = 0;
  let buyCount = 0;
  let sellCount = 0;

  // Analyze insider transactions
  insiderTrades.forEach((trade) => {
    const volume = trade.shares || 0;
    const price = trade.price || 0;
    const value = volume * price;

    if (trade.transaction_type === "buy") {
      buyVolume += value;
      buyCount++;
    } else if (trade.transaction_type === "sell") {
      sellVolume += value;
      sellCount++;
    }
  });

  let details = [];
  let score = 5; // Neutral default

  // Add basic counts
  details.push(`${buyCount} buy transactions, ${sellCount} sell transactions`);

  // Calculate the buy-sell ratio if we have both
  if (buyVolume > 0 && sellVolume > 0) {
    const ratio = buyVolume / sellVolume;

    if (ratio > 2) {
      details.push(
        `Strong insider buying: ${ratio.toFixed(1)}x more buying than selling`
      );
      score = 8;
    } else if (ratio > 1) {
      details.push(
        `Moderate insider buying: ${ratio.toFixed(1)}x more buying than selling`
      );
      score = 7;
    } else if (ratio < 0.5) {
      details.push(
        `Strong insider selling: ${(1 / ratio).toFixed(
          1
        )}x more selling than buying`
      );
      score = 3;
    } else if (ratio < 1) {
      details.push(
        `Moderate insider selling: ${(1 / ratio).toFixed(
          1
        )}x more selling than buying`
      );
      score = 4;
    } else {
      details.push(`Balanced insider activity`);
      score = 5;
    }
  } else if (buyVolume > 0) {
    details.push(`Only insider buying, no selling detected`);
    score = 8;
  } else if (sellVolume > 0) {
    details.push(`Only insider selling, no buying detected`);
    score = 3;
  } else {
    details.push(`No significant insider transactions detected`);
    score = 5;
  }

  return { score, details: details.join("; ") };
}

/**
 * Generate the final analysis output using LLM
 * @param {string} ticker - Stock ticker
 * @param {Object} analysis - Analysis data
 * @param {Object} state - Current state
 * @param {string} agentId - Agent identifier
 * @returns {Object} - Final output with signal, confidence, and reasoning
 */
async function generateLynchOutput(ticker, analysis, state, agentId) {
  const prompt = `
You are analyzing ${ticker} using Peter Lynch's investment approach. Here's the data:

GROWTH ANALYSIS:
${analysis.growthAnalysis.details}

VALUATION ANALYSIS (GARP - Growth At a Reasonable Price):
${analysis.valuationAnalysis.details}

FUNDAMENTALS ANALYSIS:
${analysis.fundamentalsAnalysis.details}

SENTIMENT ANALYSIS:
${analysis.sentimentAnalysis.details}

INSIDER ACTIVITY:
${analysis.insiderActivity.details}

Based on this analysis and using Peter Lynch's methodology:
1. The overall score is ${analysis.score.toFixed(
    1
  )} out of ${analysis.maxScore.toFixed(1)}
2. The preliminary signal is "${analysis.signal}"

As Peter Lynch, provide your final investment recommendation:
1. Signal: bullish, bearish, or neutral
2. Confidence: 0-100 (where 100 is highest confidence)
3. Reasoning: A concise summary explaining the recommendation

Remember Peter Lynch's key principles:
- Invest in what you know (simple, understandable businesses)
- Growth at a Reasonable Price (GARP) - focus on PEG ratio
- Look for potential "ten-baggers" (high-growth opportunities)
- Avoid overly complex businesses or high debt
- Favor companies with consistent revenue & EPS growth

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
    return PeterLynchSignalSchema.parse(responseData);
  } catch (error) {
    console.error(`Error generating Lynch output for ${ticker}:`, error);

    // Return fallback output
    return {
      signal: analysis.signal,
      confidence: analysis.score * 10, // Convert 0-10 score to 0-100 confidence
      reasoning: `Based on Peter Lynch's principles, ${ticker} shows ${
        analysis.signal
      } indicators with key factors including: ${
        analysis.growthAnalysis.details.split(";")[0]
      }; ${analysis.valuationAnalysis.details.split(";")[0]}; ${
        analysis.fundamentalsAnalysis.details.split(";")[0]
      }.`,
    };
  }
}
