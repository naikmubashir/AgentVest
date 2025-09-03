/**
 * Technicals Analyst Agent
 * Analyzes technical indicators and generates trading signals for multiple tickers.
 */
import { HumanMessage } from "@langchain/core/messages";
import { showAgentReasoning } from "../graph/state.js";
import { getApiKeyFromState } from "../utils/api_key.js";
import { progress } from "../utils/progress.js";
import { getTechnicalIndicators } from "../tools/api.js";

/**
 * Analyzes technical indicators and generates trading signals for multiple tickers
 *
 * @param {Object} state - The agent state
 * @param {string} agentId - The agent ID
 * @returns {Object} Updated state with technical analysis
 */
export async function technicalAnalystAgent(
  state,
  agentId = "technical_analyst_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  // Initialize technical analysis for each ticker
  const technicalAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Fetching technical indicators");

    // Get the technical indicators
    const indicators = await getTechnicalIndicators(
      ticker,
      endDate,
      30, // 30 days of data
      apiKey
    );

    if (!indicators || indicators.length === 0) {
      progress.updateStatus(
        agentId,
        ticker,
        "Failed: No technical indicators found"
      );
      continue;
    }

    console.log(`Technical indicators for ${ticker}:`, indicators[0]);

    // Analyze moving averages
    progress.updateStatus(agentId, ticker, "Analyzing moving averages");
    const maSignal = analyzeMAs(indicators);

    // Analyze momentum indicators
    progress.updateStatus(agentId, ticker, "Analyzing momentum indicators");
    const momentumSignal = analyzeMomentum(indicators);

    // Analyze volatility indicators
    progress.updateStatus(agentId, ticker, "Analyzing volatility");
    const volatilitySignal = analyzeVolatility(indicators);

    // Analyze volume indicators
    progress.updateStatus(agentId, ticker, "Analyzing volume");
    const volumeSignal = analyzeVolume(indicators);

    // Calculate overall signal
    progress.updateStatus(agentId, ticker, "Calculating final signal");

    // Count signals of each type
    const signals = [
      maSignal.signal,
      momentumSignal.signal,
      volatilitySignal.signal,
      volumeSignal.signal,
    ];
    const bullishCount = signals.filter((s) => s === "bullish").length;
    const bearishCount = signals.filter((s) => s === "bearish").length;
    const neutralCount = signals.filter((s) => s === "neutral").length;

    // Determine overall signal
    let overallSignal;
    if (bullishCount > bearishCount && bullishCount > neutralCount) {
      overallSignal = "bullish";
    } else if (bearishCount > bullishCount && bearishCount > neutralCount) {
      overallSignal = "bearish";
    } else {
      overallSignal = "neutral";
    }

    // Calculate confidence
    const confidence = Math.round(
      (Math.max(bullishCount, bearishCount, neutralCount) / signals.length) *
        100
    );

    // Create reasoning object
    const reasoning = {
      moving_averages: maSignal,
      momentum: momentumSignal,
      volatility: volatilitySignal,
      volume: volumeSignal,
    };

    // Store the analysis
    technicalAnalysis[ticker] = {
      signal: overallSignal,
      confidence: confidence,
      reasoning: reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: JSON.stringify(reasoning, null, 4),
    });
  }

  // Create the technical analysis message
  const message = new HumanMessage({
    content: JSON.stringify(technicalAnalysis),
    name: agentId,
  });

  // Print the reasoning if the flag is set
  if (state.metadata && state.metadata.show_reasoning) {
    showAgentReasoning(technicalAnalysis, "Technical Analysis Agent");
  }

  // Add the signal to the analyst_signals list
  state.data.analyst_signals = state.data.analyst_signals || {};
  state.data.analyst_signals[agentId] = technicalAnalysis;

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [message],
    data: data,
  };
}

/**
 * Analyze moving averages
 *
 * @param {Array} indicators - Technical indicators data
 * @returns {Object} Signal and reasoning
 */
function analyzeMAs(indicators) {
  // Extract latest indicator values
  const latest = indicators[0];

  // Get simple moving averages
  const sma20 = latest.sma_20;
  const sma50 = latest.sma_50;
  const sma200 = latest.sma_200;

  // Get exponential moving averages
  const ema12 = latest.ema_12;
  const ema26 = latest.ema_26;

  // Current price
  const price = latest.close;

  // Initialize signal conditions
  let bullishConditions = 0;
  let bearishConditions = 0;

  // Check price vs long-term averages
  if (price > sma200) bullishConditions++;
  if (price < sma200) bearishConditions++;

  // Check shorter vs longer MAs
  if (sma20 > sma50) bullishConditions++;
  if (sma20 < sma50) bearishConditions++;

  if (sma50 > sma200) bullishConditions++;
  if (sma50 < sma200) bearishConditions++;

  // Check EMAs (MACD components)
  if (ema12 > ema26) bullishConditions++;
  if (ema12 < ema26) bearishConditions++;

  // Determine signal
  let signal = "neutral";
  if (bullishConditions >= 3) signal = "bullish";
  if (bearishConditions >= 3) signal = "bearish";

  // Create reasoning text
  const details =
    `Price: $${price?.toFixed(2) || "N/A"}, ` +
    `SMA20: $${sma20?.toFixed(2) || "N/A"}, ` +
    `SMA50: $${sma50?.toFixed(2) || "N/A"}, ` +
    `SMA200: $${sma200?.toFixed(2) || "N/A"}`;

  return {
    signal: signal,
    details: details,
  };
}

/**
 * Analyze momentum indicators
 *
 * @param {Array} indicators - Technical indicators data
 * @returns {Object} Signal and reasoning
 */
function analyzeMomentum(indicators) {
  // Extract latest indicator values
  const latest = indicators[0];

  // Get momentum indicators
  const rsi = latest.rsi;
  const macd = latest.macd;
  const macdSignal = latest.macd_signal;
  const macdHist = latest.macd_hist;

  // Initialize signal conditions
  let bullishConditions = 0;
  let bearishConditions = 0;

  // Check RSI
  if (rsi < 30) bullishConditions++; // Oversold
  if (rsi > 70) bearishConditions++; // Overbought

  // Check MACD
  if (macd > macdSignal) bullishConditions++;
  if (macd < macdSignal) bearishConditions++;

  // Check MACD histogram direction
  if (macdHist > 0) bullishConditions++;
  if (macdHist < 0) bearishConditions++;

  // Determine signal
  let signal = "neutral";
  if (bullishConditions > bearishConditions) signal = "bullish";
  if (bearishConditions > bullishConditions) signal = "bearish";

  // Create reasoning text
  const details =
    `RSI: ${rsi?.toFixed(2) || "N/A"}, ` +
    `MACD: ${macd?.toFixed(4) || "N/A"}, ` +
    `MACD Signal: ${macdSignal?.toFixed(4) || "N/A"}, ` +
    `MACD Hist: ${macdHist?.toFixed(4) || "N/A"}`;

  return {
    signal: signal,
    details: details,
  };
}

/**
 * Analyze volatility indicators
 *
 * @param {Array} indicators - Technical indicators data
 * @returns {Object} Signal and reasoning
 */
function analyzeVolatility(indicators) {
  // Extract latest indicator values
  const latest = indicators[0];

  // Get volatility indicators
  const atr = latest.atr;
  const upperBB = latest.upper_bollinger;
  const lowerBB = latest.lower_bollinger;
  const middleBB = latest.middle_bollinger;
  const price = latest.close;

  // Initialize signal
  let signal = "neutral";

  // Check Bollinger Bands
  if (price > upperBB) {
    signal = "bearish"; // Overbought
  } else if (price < lowerBB) {
    signal = "bullish"; // Oversold
  } else if (price > middleBB && price < upperBB) {
    signal = "neutral"; // Neutral with upward bias
  } else if (price < middleBB && price > lowerBB) {
    signal = "neutral"; // Neutral with downward bias
  }

  // Create reasoning text
  const details =
    `ATR: ${atr?.toFixed(2) || "N/A"}, ` +
    `Bollinger Upper: $${upperBB?.toFixed(2) || "N/A"}, ` +
    `Bollinger Middle: $${middleBB?.toFixed(2) || "N/A"}, ` +
    `Bollinger Lower: $${lowerBB?.toFixed(2) || "N/A"}, ` +
    `Price: $${price?.toFixed(2) || "N/A"}`;

  return {
    signal: signal,
    details: details,
  };
}

/**
 * Analyze volume indicators
 *
 * @param {Array} indicators - Technical indicators data
 * @returns {Object} Signal and reasoning
 */
function analyzeVolume(indicators) {
  if (indicators.length < 5) {
    return {
      signal: "neutral",
      details: "Insufficient volume data",
    };
  }

  // Get last 5 days of data
  const volumeData = indicators.slice(0, 5);

  // Calculate average volume
  const volumes = volumeData.map((d) => d.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  // Get latest price changes
  const latestPriceChange = indicators[0].close - indicators[1].close;
  const latestVolume = indicators[0].volume;

  // Initialize signal
  let signal = "neutral";

  // Volume analysis
  if (latestVolume > avgVolume * 1.5) {
    // Higher than normal volume
    if (latestPriceChange > 0) {
      signal = "bullish"; // Bullish with high volume
    } else if (latestPriceChange < 0) {
      signal = "bearish"; // Bearish with high volume
    }
  } else if (latestVolume < avgVolume * 0.5) {
    // Lower than normal volume
    signal = "neutral"; // Low conviction
  }

  // Create reasoning text
  const details =
    `Latest Volume: ${latestVolume?.toLocaleString() || "N/A"}, ` +
    `Avg Volume (5d): ${avgVolume?.toLocaleString() || "N/A"}, ` +
    `Latest Price Change: $${latestPriceChange?.toFixed(2) || "N/A"}`;

  return {
    signal: signal,
    details: details,
  };
}
