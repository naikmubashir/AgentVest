import { z } from "zod";
import { showAgentReasoning } from "../graph/state.js";
import {
  getFinancialMetrics,
  getMarketCap,
  searchLineItems,
  getCompanyProfile,
  getCompanyNews,
} from "../tools/api.js";
import { callLLM } from "../utils/llm.js";
import { progress } from "../utils/progress.js";
import { getApiKeyFromState } from "../utils/api_key.js";

// Define the schema for Phil Fisher's analysis signal
const PhilFisherSignalSchema = z.object({
  signal: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number(),
  reasoning: z.string(),
});

/**
 * Analyzes stocks using Phil Fisher's investment approach:
 * - Focuses on high-quality growth companies with strong management
 * - Emphasizes long-term growth potential and competitive advantages
 * - Values superior R&D, sales organization, and profit margins
 * - Practices "scuttlebutt" method - gathering information from various sources
 * - Looks for companies with growth potential beyond the present
 *
 * @param {Object} state - The current state
 * @param {string} agentId - The agent identifier
 * @returns {Object} - Updated state with Phil Fisher's analysis
 */
export async function philFisherAgent(state, agentId = "phil_fisher_agent") {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  const analysisData = {};
  const fisherAnalysis = {};

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

    progress.updateStatus(agentId, ticker, "Getting company profile");
    const companyProfile = await getCompanyProfile(ticker, apiKey);

    progress.updateStatus(agentId, ticker, "Gathering financial line items");
    const financialLineItems = await searchLineItems(
      ticker,
      [
        "revenue",
        "net_income",
        "operating_income",
        "gross_margin",
        "operating_margin",
        "research_and_development",
        "sales_and_marketing",
        "capital_expenditure",
        "free_cash_flow",
        "return_on_equity",
        "return_on_assets",
      ],
      endDate,
      "annual",
      5,
      apiKey
    );

    progress.updateStatus(agentId, ticker, "Fetching company news");
    const companyNews = await getCompanyNews(ticker, endDate, 20, 15, apiKey);

    // Perform sub-analyses:
    progress.updateStatus(agentId, ticker, "Analyzing growth profile");
    const growthAnalysis = analyzeGrowthProfile(financialLineItems, metrics);

    progress.updateStatus(agentId, ticker, "Analyzing competitive advantages");
    const competitiveAnalysis = analyzeCompetitiveAdvantages(
      financialLineItems,
      companyProfile
    );

    progress.updateStatus(agentId, ticker, "Analyzing management quality");
    const managementAnalysis = analyzeManagementQuality(
      financialLineItems,
      companyNews
    );

    progress.updateStatus(agentId, ticker, "Analyzing R&D and innovation");
    const innovationAnalysis = analyzeInnovation(financialLineItems);

    // Combine partial scores with weights according to Fisher's priorities:
    // 35% Competitive Advantages, 30% Growth Profile, 20% Management Quality, 15% R&D/Innovation
    const totalScore =
      competitiveAnalysis.score * 0.35 +
      growthAnalysis.score * 0.3 +
      managementAnalysis.score * 0.2 +
      innovationAnalysis.score * 0.15;

    const maxPossibleScore = 10.0;

    // Map final score to signal
    let signal;
    if (totalScore >= 7.5) {
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
      competitiveAnalysis,
      managementAnalysis,
      innovationAnalysis,
    };

    progress.updateStatus(agentId, ticker, "Generating Phil Fisher analysis");
    const fisherOutput = await generateFisherOutput(
      ticker,
      analysisData[ticker],
      companyProfile,
      state,
      agentId
    );

    fisherAnalysis[ticker] = {
      signal: fisherOutput.signal,
      confidence: fisherOutput.confidence,
      reasoning: fisherOutput.reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: fisherOutput.reasoning,
    });
  }

  // Save signals to state
  if (!state.data.analyst_signals) {
    state.data.analyst_signals = {};
  }
  state.data.analyst_signals[agentId] = fisherAnalysis;

  if (state.metadata && state.metadata.show_reasoning) {
    showAgentReasoning(fisherAnalysis, "Phil Fisher Agent");
  }

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [{ content: JSON.stringify(fisherAnalysis), name: agentId }],
    data: state.data,
  };
}

/**
 * Helper function to extract values from financial line items
 * @param {Array|Object} financialLineItems - Financial data
 * @param {string} lineItemName - Name of the line item to extract
 * @returns {Array} - Array of values
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

/**
 * Analyze the company's growth profile
 * @param {Array|Object} financialLineItems - Financial data
 * @param {Object} metrics - Financial metrics
 * @returns {Object} - Growth analysis
 */
function analyzeGrowthProfile(financialLineItems, metrics) {
  if (!financialLineItems) {
    return {
      score: 0,
      details: "Insufficient financial data for growth analysis",
    };
  }

  const details = [];
  let rawScore = 0;

  // Extract data using helper function
  const revenues = extractLineItemValues(financialLineItems, "revenue");
  const netIncomes = extractLineItemValues(financialLineItems, "net_income");
  const operatingIncomes = extractLineItemValues(
    financialLineItems,
    "operating_income"
  );

  // 1) Revenue Growth
  if (revenues.length >= 3) {
    // Calculate multi-year CAGR
    const latestRev = revenues[0];
    const oldestRev = revenues[revenues.length - 1];
    const years = revenues.length - 1;

    if (oldestRev > 0) {
      const cagr = Math.pow(latestRev / oldestRev, 1 / years) - 1;

      if (cagr > 0.15) {
        rawScore += 3;
        details.push(`Strong revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      } else if (cagr > 0.08) {
        rawScore += 2;
        details.push(`Good revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      } else if (cagr > 0.03) {
        rawScore += 1;
        details.push(`Moderate revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      } else {
        details.push(`Weak revenue CAGR: ${(cagr * 100).toFixed(1)}%`);
      }

      // Check consistency (Fisher valued consistent growth)
      let consistentGrowth = true;
      for (let i = 0; i < revenues.length - 1; i++) {
        if (revenues[i] <= revenues[i + 1]) {
          consistentGrowth = false;
          break;
        }
      }

      if (consistentGrowth) {
        rawScore += 2;
        details.push("Consistent year-over-year revenue growth");
      }
    }
  } else {
    details.push("Insufficient revenue history to calculate CAGR");
  }

  // 2) Earnings Growth
  if (netIncomes.length >= 3) {
    // Check if consistently profitable
    const allProfitable = netIncomes.every((income) => income > 0);

    if (allProfitable) {
      rawScore += 2;
      details.push("Consistently profitable across all years");

      // Calculate earnings growth
      const latestIncome = netIncomes[0];
      const oldestIncome = netIncomes[netIncomes.length - 1];
      const years = netIncomes.length - 1;

      const earningsCagr = Math.pow(latestIncome / oldestIncome, 1 / years) - 1;

      if (earningsCagr > 0.15) {
        rawScore += 3;
        details.push(
          `Strong earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`
        );
      } else if (earningsCagr > 0.08) {
        rawScore += 2;
        details.push(`Good earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`);
      } else if (earningsCagr > 0.03) {
        rawScore += 1;
        details.push(
          `Moderate earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`
        );
      } else {
        details.push(`Weak earnings CAGR: ${(earningsCagr * 100).toFixed(1)}%`);
      }
    } else {
      details.push("Inconsistent profitability");
    }
  } else {
    details.push("Insufficient earnings history");
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, rawScore);
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze the company's competitive advantages
 * @param {Array|Object} financialLineItems - Financial data
 * @param {Object} companyProfile - Company profile information
 * @returns {Object} - Analysis results
 */
function analyzeCompetitiveAdvantages(financialLineItems, companyProfile) {
  if (!financialLineItems) {
    return { score: 0, details: "Insufficient data for competitive analysis" };
  }

  const details = [];
  let rawScore = 0;

  // 1) Profit Margins - Fisher valued high and sustainable margins
  const margins = extractLineItemValues(financialLineItems, "operating_margin");
  if (margins.length > 0) {
    const latestMargin = margins[0];

    if (latestMargin > 0.2) {
      rawScore += 3;
      details.push(
        `Excellent operating margin: ${(latestMargin * 100).toFixed(1)}%`
      );
    } else if (latestMargin > 0.15) {
      rawScore += 2;
      details.push(
        `Good operating margin: ${(latestMargin * 100).toFixed(1)}%`
      );
    } else if (latestMargin > 0.1) {
      rawScore += 1;
      details.push(
        `Average operating margin: ${(latestMargin * 100).toFixed(1)}%`
      );
    } else {
      details.push(
        `Below average operating margin: ${(latestMargin * 100).toFixed(1)}%`
      );
    }

    // Check margin consistency (Fisher valued stable or improving margins)
    if (margins.length >= 3) {
      const oldestMargin = margins[margins.length - 1];
      const marginTrend = latestMargin - oldestMargin;

      if (marginTrend > 0.02) {
        rawScore += 2;
        details.push("Improving margins over time");
      } else if (marginTrend > -0.01) {
        rawScore += 1;
        details.push("Stable margins over time");
      } else {
        details.push("Declining margins over time");
      }
    }
  } else {
    details.push("No margin data available");
  }

  // 2) ROE - Fisher looked for efficient use of capital
  const roeValues = extractLineItemValues(
    financialLineItems,
    "return_on_equity"
  );

  if (roeValues.length > 0) {
    const latestRoe = roeValues[0];

    if (latestRoe > 0.2) {
      rawScore += 3;
      details.push(`Excellent ROE: ${(latestRoe * 100).toFixed(1)}%`);
    } else if (latestRoe > 0.15) {
      rawScore += 2;
      details.push(`Good ROE: ${(latestRoe * 100).toFixed(1)}%`);
    } else if (latestRoe > 0.1) {
      rawScore += 1;
      details.push(`Average ROE: ${(latestRoe * 100).toFixed(1)}%`);
    } else {
      details.push(`Below average ROE: ${(latestRoe * 100).toFixed(1)}%`);
    }
  } else {
    details.push("No ROE data available");
  }

  // 3) Business Model assessment - based on company description
  if (companyProfile && companyProfile.description) {
    const description = companyProfile.description.toLowerCase();

    // Fisher valued companies with clear competitive advantages
    const advantageTerms = [
      "market leader",
      "dominant",
      "patent",
      "proprietary",
      "moat",
      "barrier to entry",
      "network effect",
      "switching cost",
    ];

    let hasAdvantage = false;
    for (const term of advantageTerms) {
      if (description.includes(term)) {
        hasAdvantage = true;
        break;
      }
    }

    if (hasAdvantage) {
      rawScore += 2;
      details.push("Business description suggests competitive advantages");
    }
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, rawScore);
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze management quality
 * @param {Array} financialLineItems - Financial data
 * @param {Array} companyNews - Company news
 * @returns {Object} - Analysis results
 */
function analyzeManagementQuality(financialLineItems, companyNews) {
  if (!financialLineItems) {
    return {
      score: 5,
      details: "Insufficient data for management quality analysis",
    };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // 1) Capital Allocation - Fisher valued good capital allocation decisions
  const fcfValues = extractLineItemValues(financialLineItems, "free_cash_flow");
  const capexValues = extractLineItemValues(
    financialLineItems,
    "capital_expenditure"
  );

  if (
    fcfValues.length > 0 &&
    capexValues.length > 0 &&
    fcfValues.length === capexValues.length
  ) {
    // Calculate FCF to CapEx ratio - how much free cash the company generates per dollar of investment
    const fcfToCapexRatios = [];

    for (let i = 0; i < fcfValues.length; i++) {
      if (capexValues[i] !== 0) {
        fcfToCapexRatios.push(Math.abs(fcfValues[i] / capexValues[i]));
      }
    }

    if (fcfToCapexRatios.length > 0) {
      const avgRatio =
        fcfToCapexRatios.reduce((sum, ratio) => sum + ratio, 0) /
        fcfToCapexRatios.length;

      if (avgRatio > 1.5) {
        rawScore += 2;
        details.push(
          `Excellent capital efficiency: $${avgRatio.toFixed(
            2
          )} FCF per $1 CapEx`
        );
      } else if (avgRatio > 1.0) {
        rawScore += 1;
        details.push(
          `Good capital efficiency: $${avgRatio.toFixed(2)} FCF per $1 CapEx`
        );
      } else {
        details.push(
          `Poor capital efficiency: $${avgRatio.toFixed(2)} FCF per $1 CapEx`
        );
        rawScore -= 1;
      }
    }
  }

  // 2) Management Sentiment Analysis (from news)
  if (companyNews && companyNews.length > 0) {
    let managementMentions = 0;
    let positiveMentions = 0;
    let negativeMentions = 0;

    const managementTerms = [
      "ceo",
      "chief executive",
      "management",
      "executive team",
      "leadership",
    ];
    const positiveTerms = [
      "visionary",
      "innovative",
      "successful",
      "experienced",
      "respected",
    ];
    const negativeTerms = [
      "controversy",
      "scandal",
      "failed",
      "mismanagement",
      "resigned",
    ];

    for (const news of companyNews) {
      const title = (news.title || "").toLowerCase();
      const summary = (news.summary || "").toLowerCase();
      const content = title + " " + summary;

      // Check for management mentions
      for (const term of managementTerms) {
        if (content.includes(term)) {
          managementMentions++;

          // Check for sentiment
          for (const term of positiveTerms) {
            if (content.includes(term)) {
              positiveMentions++;
              break;
            }
          }

          for (const term of negativeTerms) {
            if (content.includes(term)) {
              negativeMentions++;
              break;
            }
          }

          break;
        }
      }
    }

    if (managementMentions > 0) {
      const positiveRatio = positiveMentions / managementMentions;
      const negativeRatio = negativeMentions / managementMentions;

      if (positiveRatio > 0.3 && positiveRatio > negativeRatio) {
        rawScore += 2;
        details.push(
          `Positive management sentiment in news (${positiveMentions} positive mentions)`
        );
      } else if (negativeRatio > 0.3 && negativeRatio > positiveRatio) {
        rawScore -= 2;
        details.push(
          `Negative management sentiment in news (${negativeMentions} negative mentions)`
        );
      } else {
        details.push(
          `Neutral management sentiment in news (${managementMentions} mentions)`
        );
      }
    } else {
      details.push("No significant management mentions in recent news");
    }
  } else {
    details.push("No news data available for management sentiment analysis");
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Analyze R&D and innovation
 * @param {Array} financialLineItems - Financial data
 * @returns {Object} - Analysis results
 */
function analyzeInnovation(financialLineItems) {
  if (!financialLineItems || financialLineItems.length === 0) {
    return { score: 5, details: "Insufficient data for innovation analysis" };
  }

  const details = [];
  let rawScore = 5; // Start at neutral

  // R&D Investment - Fisher highly valued R&D and sales organizations
  const rdValues = extractLineItemValues(
    financialLineItems,
    "research_and_development"
  );
  const revenueValues = extractLineItemValues(financialLineItems, "revenue");

  if (
    rdValues.length > 0 &&
    revenueValues.length > 0 &&
    rdValues.length === revenueValues.length
  ) {
    // Calculate R&D as percentage of revenue
    const rdPercentages = [];

    for (let i = 0; i < rdValues.length; i++) {
      if (revenueValues[i] > 0) {
        rdPercentages.push(rdValues[i] / revenueValues[i]);
      }
    }

    if (rdPercentages.length > 0) {
      const latestRdPercent = rdPercentages[0];
      const avgRdPercent =
        rdPercentages.reduce((sum, pct) => sum + pct, 0) / rdPercentages.length;

      // Assess R&D investment
      if (latestRdPercent > 0.15) {
        rawScore += 3;
        details.push(
          `Very high R&D investment: ${(latestRdPercent * 100).toFixed(
            1
          )}% of revenue`
        );
      } else if (latestRdPercent > 0.08) {
        rawScore += 2;
        details.push(
          `High R&D investment: ${(latestRdPercent * 100).toFixed(
            1
          )}% of revenue`
        );
      } else if (latestRdPercent > 0.03) {
        rawScore += 1;
        details.push(
          `Moderate R&D investment: ${(latestRdPercent * 100).toFixed(
            1
          )}% of revenue`
        );
      } else if (latestRdPercent > 0) {
        details.push(
          `Low R&D investment: ${(latestRdPercent * 100).toFixed(
            1
          )}% of revenue`
        );
      } else {
        details.push("No R&D investment reported");
        rawScore -= 2;
      }

      // Check R&D growth trend
      if (rdPercentages.length >= 3) {
        const oldestRdPercent = rdPercentages[rdPercentages.length - 1];
        const rdTrend = latestRdPercent - oldestRdPercent;

        if (rdTrend > 0.02) {
          rawScore += 2;
          details.push("Increasing R&D investment over time");
        } else if (rdTrend > -0.01) {
          rawScore += 1;
          details.push("Stable R&D investment over time");
        } else {
          details.push("Decreasing R&D investment over time");
        }
      }
    } else {
      details.push("Cannot calculate R&D as percentage of revenue");
    }
  } else {
    // Some companies don't break out R&D separately
    details.push("No specific R&D data available");
  }

  // Check sales and marketing investment (another Fisher focus)
  const smValues = extractLineItemValues(
    financialLineItems,
    "sales_and_marketing"
  );

  if (
    smValues.length > 0 &&
    revenueValues.length > 0 &&
    smValues.length === revenueValues.length
  ) {
    // Calculate S&M as percentage of revenue
    const smPercentages = [];

    for (let i = 0; i < smValues.length; i++) {
      if (revenueValues[i] > 0) {
        smPercentages.push(smValues[i] / revenueValues[i]);
      }
    }

    if (smPercentages.length > 0) {
      const latestSmPercent = smPercentages[0];

      // Assess sales & marketing investment
      if (latestSmPercent > 0.25) {
        rawScore += 2;
        details.push(
          `Strong sales & marketing investment: ${(
            latestSmPercent * 100
          ).toFixed(1)}% of revenue`
        );
      } else if (latestSmPercent > 0.15) {
        rawScore += 1;
        details.push(
          `Moderate sales & marketing investment: ${(
            latestSmPercent * 100
          ).toFixed(1)}% of revenue`
        );
      } else {
        details.push(
          `Limited sales & marketing investment: ${(
            latestSmPercent * 100
          ).toFixed(1)}% of revenue`
        );
      }
    }
  } else {
    details.push("No specific sales & marketing data available");
  }

  // Normalize score to 0-10
  const finalScore = Math.min(10, Math.max(0, rawScore));
  return { score: finalScore, details: details.join("; ") };
}

/**
 * Generate the final analysis output using LLM
 * @param {string} ticker - Stock ticker
 * @param {Object} analysis - Analysis data
 * @param {Object} companyProfile - Company profile
 * @param {Object} state - Current state
 * @param {string} agentId - Agent identifier
 * @returns {Object} - Final output with signal, confidence, and reasoning
 */
async function generateFisherOutput(
  ticker,
  analysis,
  companyProfile,
  state,
  agentId
) {
  const companyName = companyProfile?.name || ticker;
  const industry = companyProfile?.industry || "its industry";
  const description = companyProfile?.description || "";

  const prompt = `
You are analyzing ${companyName} (${ticker}) using Phil Fisher's investment approach. Here's the data:

COMPANY DESCRIPTION:
${description.substring(0, 300)}${description.length > 300 ? "..." : ""}

GROWTH PROFILE ANALYSIS:
${analysis.growthAnalysis.details}

COMPETITIVE ADVANTAGES ANALYSIS:
${analysis.competitiveAnalysis.details}

MANAGEMENT QUALITY ANALYSIS:
${analysis.managementAnalysis.details}

INNOVATION AND R&D ANALYSIS:
${analysis.innovationAnalysis.details}

Based on this analysis and using Phil Fisher's methodology:
1. The overall score is ${analysis.score.toFixed(
    1
  )} out of ${analysis.maxScore.toFixed(1)}
2. The preliminary signal is "${analysis.signal}"

As Phil Fisher, provide your final investment recommendation:
1. Signal: bullish, bearish, or neutral
2. Confidence: 0-100 (where 100 is highest confidence)
3. Reasoning: A concise summary explaining the recommendation

Remember Phil Fisher's key principles:
- Focus on high-quality growth companies with strong management
- Emphasize long-term growth potential and competitive advantages
- Value superior R&D, sales organization, and profit margins
- Practice "scuttlebutt" method - gathering information from various sources
- Look for companies with growth potential beyond the present

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
    let jsonStr;

    // Handle both string and object responses
    if (typeof result === "string") {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in LLM response");
      }
      jsonStr = jsonMatch[0];
    } else if (typeof result === "object") {
      // If response is already an object, use it directly
      return PhilFisherSignalSchema.parse(result);
    } else {
      throw new Error("Unexpected response type from LLM");
    }

    const responseData = JSON.parse(jsonStr);

    // Validate with Zod schema
    return PhilFisherSignalSchema.parse(responseData);
  } catch (error) {
    console.error(`Error generating Fisher output for ${ticker}:`, error);

    // Return fallback output
    return {
      signal: analysis.signal,
      confidence: analysis.score * 10, // Convert 0-10 score to 0-100 confidence
      reasoning: `Based on Phil Fisher's principles, ${ticker} shows ${
        analysis.signal
      } indicators with key factors including: ${
        analysis.growthAnalysis.details.split(";")[0]
      }; ${analysis.competitiveAnalysis.details.split(";")[0]}; ${
        analysis.innovationAnalysis.details.split(";")[0]
      }.`,
    };
  }
}
