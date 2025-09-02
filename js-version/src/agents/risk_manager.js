import { HumanMessage } from "langchain/schema";
import { showAgentReasoning } from "../graph/state.js";
import { progress } from "../utils/progress.js";
import { getPrices, pricesToDf } from "../tools/api.js";
import { getApiKeyFromState } from "../utils/api_key.js";

/**
 * Controls position sizing based on volatility-adjusted risk factors for multiple tickers
 *
 * @param {Object} state - The agent state
 * @param {string} agentId - The agent ID
 * @returns {Object} Updated state with risk analysis
 */
export function riskManagementAgent(state, agentId = "risk_management_agent") {
  const portfolio = state.data.portfolio;
  const data = state.data;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "FINANCIAL_DATASETS_API_KEY");

  // Initialize risk analysis for each ticker
  const riskAnalysis = {};
  const currentPrices = {}; // Store prices here to avoid redundant API calls
  const volatilityData = {}; // Store volatility metrics
  const returnsByTicker = {}; // For correlation analysis

  // First, fetch prices and calculate volatility for all relevant tickers
  const allTickers = new Set([
    ...tickers,
    ...Object.keys(portfolio.positions || {}),
  ]);

  for (const ticker of allTickers) {
    progress.updateStatus(
      agentId,
      ticker,
      "Fetching price data and calculating volatility"
    );

    const prices = getPrices({
      ticker,
      startDate: data.start_date,
      endDate: data.end_date,
      apiKey,
    });

    if (!prices || prices.length === 0) {
      progress.updateStatus(agentId, ticker, "Warning: No price data found");
      volatilityData[ticker] = {
        daily_volatility: 0.05, // Default fallback volatility (5% daily)
        annualized_volatility: 0.05 * Math.sqrt(252),
        volatility_percentile: 100, // Assume high risk if no data
        data_points: 0,
      };
      continue;
    }

    const pricesDf = pricesToDf(prices);

    if (pricesDf && pricesDf.length > 1) {
      const currentPrice = pricesDf[pricesDf.length - 1].close;
      currentPrices[ticker] = currentPrice;

      // Calculate volatility metrics
      const volatilityMetrics = calculateVolatilityMetrics(pricesDf);
      volatilityData[ticker] = volatilityMetrics;

      // Store returns for correlation analysis (use close-to-close returns)
      const dailyReturns = calculateDailyReturns(pricesDf);
      if (dailyReturns.length > 0) {
        returnsByTicker[ticker] = dailyReturns;
      }

      progress.updateStatus(
        agentId,
        ticker,
        `Price: ${currentPrice.toFixed(2)}, Ann. Vol: ${(
          volatilityMetrics.annualized_volatility * 100
        ).toFixed(1)}%`
      );
    } else {
      progress.updateStatus(
        agentId,
        ticker,
        "Warning: Insufficient price data"
      );
      currentPrices[ticker] = 0;
      volatilityData[ticker] = {
        daily_volatility: 0.05,
        annualized_volatility: 0.05 * Math.sqrt(252),
        volatility_percentile: 100,
        data_points: pricesDf ? pricesDf.length : 0,
      };
    }
  }

  // Build correlation matrix aligned across tickers
  let correlationMatrix = null;
  const tickersWithReturns = Object.keys(returnsByTicker);

  if (tickersWithReturns.length >= 2) {
    try {
      // Create aligned returns dataframe
      const alignedReturns = alignReturns(returnsByTicker);
      if (
        alignedReturns &&
        alignedReturns.length >= 5 &&
        Object.keys(alignedReturns[0]).length >= 2
      ) {
        correlationMatrix = calculateCorrelationMatrix(
          alignedReturns,
          tickersWithReturns
        );
      }
    } catch (error) {
      correlationMatrix = null;
    }
  }

  // Determine which tickers currently have exposure (non-zero absolute position)
  const activePositions = new Set();
  for (const [ticker, pos] of Object.entries(portfolio.positions || {})) {
    const netPosition = (pos.long || 0) - (pos.short || 0);
    if (Math.abs(netPosition) > 0) {
      activePositions.add(ticker);
    }
  }

  // Calculate total portfolio value based on current market prices (Net Liquidation Value)
  let totalPortfolioValue = portfolio.cash || 0.0;

  for (const [ticker, position] of Object.entries(portfolio.positions || {})) {
    if (ticker in currentPrices) {
      // Add market value of long positions
      totalPortfolioValue += (position.long || 0) * currentPrices[ticker];
      // Subtract market value of short positions
      totalPortfolioValue -= (position.short || 0) * currentPrices[ticker];
    }
  }

  progress.updateStatus(
    agentId,
    null,
    `Total portfolio value: ${totalPortfolioValue.toFixed(2)}`
  );

  // Calculate volatility- and correlation-adjusted risk limits for each ticker
  for (const ticker of tickers) {
    progress.updateStatus(
      agentId,
      ticker,
      "Calculating volatility- and correlation-adjusted limits"
    );

    if (!currentPrices[ticker] || currentPrices[ticker] <= 0) {
      progress.updateStatus(agentId, ticker, "Failed: No valid price data");
      riskAnalysis[ticker] = {
        remaining_position_limit: 0.0,
        current_price: 0.0,
        reasoning: {
          error: "Missing price data for risk calculation",
        },
      };
      continue;
    }

    const currentPrice = currentPrices[ticker];
    const volData = volatilityData[ticker] || {};

    // Calculate current market value of this position
    const position = (portfolio.positions || {})[ticker] || {};
    const longValue = (position.long || 0) * currentPrice;
    const shortValue = (position.short || 0) * currentPrice;
    const currentPositionValue = Math.abs(longValue - shortValue); // Use absolute exposure

    // Volatility-adjusted limit pct
    const volAdjustedLimitPct = calculateVolatilityAdjustedLimit(
      volData.annualized_volatility || 0.25
    );

    // Correlation adjustment
    const corrMetrics = {
      avg_correlation_with_active: null,
      max_correlation_with_active: null,
      top_correlated_tickers: [],
    };

    let corrMultiplier = 1.0;
    if (correlationMatrix !== null && correlationMatrix[ticker]) {
      // Compute correlations with active positions (exclude self)
      const comparable = [...activePositions].filter(
        (t) => correlationMatrix[t] && t !== ticker
      );

      let correlations = [];
      if (comparable.length === 0) {
        // If no active positions, compare with all other available tickers
        correlations = Object.keys(correlationMatrix)
          .filter((t) => t !== ticker)
          .map((t) => ({
            ticker: t,
            correlation: correlationMatrix[ticker][t] || 0,
          }));
      } else {
        correlations = comparable.map((t) => ({
          ticker: t,
          correlation: correlationMatrix[ticker][t] || 0,
        }));
      }

      if (correlations.length > 0) {
        // Filter out NaN values
        const validCorrelations = correlations.filter(
          (c) => !isNaN(c.correlation)
        );

        if (validCorrelations.length > 0) {
          const avgCorr =
            validCorrelations.reduce((sum, c) => sum + c.correlation, 0) /
            validCorrelations.length;
          const maxCorr = Math.max(
            ...validCorrelations.map((c) => c.correlation)
          );

          corrMetrics.avg_correlation_with_active = avgCorr;
          corrMetrics.max_correlation_with_active = maxCorr;

          // Top 3 most correlated tickers
          const topCorr = validCorrelations
            .sort((a, b) => b.correlation - a.correlation)
            .slice(0, 3);

          corrMetrics.top_correlated_tickers = topCorr;
          corrMultiplier = calculateCorrelationMultiplier(avgCorr);
        }
      }
    }

    // Combine volatility and correlation adjustments
    const combinedLimitPct = volAdjustedLimitPct * corrMultiplier;
    // Convert to dollar position limit
    const positionLimit = totalPortfolioValue * combinedLimitPct;

    // Calculate remaining limit for this position
    const remainingPositionLimit = positionLimit - currentPositionValue;

    // Ensure we don't exceed available cash
    const maxPositionSize = Math.min(
      remainingPositionLimit,
      portfolio.cash || 0
    );

    riskAnalysis[ticker] = {
      remaining_position_limit: maxPositionSize,
      current_price: currentPrice,
      volatility_metrics: {
        daily_volatility: volData.daily_volatility || 0.05,
        annualized_volatility: volData.annualized_volatility || 0.25,
        volatility_percentile: volData.volatility_percentile || 100,
        data_points: volData.data_points || 0,
      },
      correlation_metrics: corrMetrics,
      reasoning: {
        portfolio_value: totalPortfolioValue,
        current_position_value: currentPositionValue,
        base_position_limit_pct: volAdjustedLimitPct,
        correlation_multiplier: corrMultiplier,
        combined_position_limit_pct: combinedLimitPct,
        position_limit: positionLimit,
        remaining_limit: remainingPositionLimit,
        available_cash: portfolio.cash || 0,
        risk_adjustment: `Volatility x Correlation adjusted: ${(
          combinedLimitPct * 100
        ).toFixed(1)}% (base ${(volAdjustedLimitPct * 100).toFixed(1)}%)`,
      },
    };

    progress.updateStatus(
      agentId,
      ticker,
      `Adj. limit: ${(combinedLimitPct * 100).toFixed(
        1
      )}%, Available: $${maxPositionSize.toFixed(0)}`
    );
  }

  progress.updateStatus(agentId, null, "Done");

  const message = new HumanMessage({
    content: JSON.stringify(riskAnalysis),
    name: agentId,
  });

  if (state.metadata.show_reasoning) {
    showAgentReasoning(
      riskAnalysis,
      "Volatility-Adjusted Risk Management Agent"
    );
  }

  // Add the signal to the analyst_signals list
  state.data.analyst_signals = state.data.analyst_signals || {};
  state.data.analyst_signals[agentId] = riskAnalysis;

  return {
    messages: [...state.messages, message],
    data,
  };
}

/**
 * Calculate comprehensive volatility metrics from price data
 *
 * @param {Array} pricesDf - Array of price data
 * @param {number} lookbackDays - Days to look back for volatility calculation
 * @returns {Object} Volatility metrics
 */
function calculateVolatilityMetrics(pricesDf, lookbackDays = 60) {
  if (pricesDf.length < 2) {
    return {
      daily_volatility: 0.05,
      annualized_volatility: 0.05 * Math.sqrt(252),
      volatility_percentile: 100,
      data_points: pricesDf.length,
    };
  }

  // Calculate daily returns
  const dailyReturns = calculateDailyReturns(pricesDf);

  if (dailyReturns.length < 2) {
    return {
      daily_volatility: 0.05,
      annualized_volatility: 0.05 * Math.sqrt(252),
      volatility_percentile: 100,
      data_points: dailyReturns.length,
    };
  }

  // Use the most recent lookback_days for volatility calculation
  const recentReturns = dailyReturns.slice(
    -Math.min(lookbackDays, dailyReturns.length)
  );

  // Calculate volatility metrics
  const dailyVol = calculateStdDev(recentReturns);
  const annualizedVol = dailyVol * Math.sqrt(252); // Annualize assuming 252 trading days

  // Calculate percentile rank of recent volatility vs historical volatility
  let currentVolPercentile = 50; // Default to median
  if (dailyReturns.length >= 30) {
    // Need sufficient history for percentile calculation
    // Calculate 30-day rolling volatility for the full history
    const rollingVol = calculateRollingVolatility(dailyReturns, 30);

    if (rollingVol.length > 0) {
      // Compare current volatility against historical rolling volatilities
      const lowerVols = rollingVol.filter((v) => v <= dailyVol).length;
      currentVolPercentile = (lowerVols / rollingVol.length) * 100;
    }
  }

  return {
    daily_volatility: isNaN(dailyVol) ? 0.025 : dailyVol,
    annualized_volatility: isNaN(annualizedVol) ? 0.25 : annualizedVol,
    volatility_percentile: isNaN(currentVolPercentile)
      ? 50
      : currentVolPercentile,
    data_points: recentReturns.length,
  };
}

/**
 * Calculate position limit as percentage of portfolio based on volatility
 *
 * @param {number} annualizedVolatility - Annualized volatility
 * @returns {number} Adjusted position limit percentage
 */
function calculateVolatilityAdjustedLimit(annualizedVolatility) {
  const baseLimit = 0.2; // 20% baseline

  let volMultiplier;
  if (annualizedVolatility < 0.15) {
    // Low volatility
    // Allow higher allocation for stable stocks
    volMultiplier = 1.25; // Up to 25%
  } else if (annualizedVolatility < 0.3) {
    // Medium volatility
    // Standard allocation with slight adjustment based on volatility
    volMultiplier = 1.0 - (annualizedVolatility - 0.15) * 0.5; // 20% -> 12.5%
  } else if (annualizedVolatility < 0.5) {
    // High volatility
    // Reduce allocation significantly
    volMultiplier = 0.75 - (annualizedVolatility - 0.3) * 0.5; // 15% -> 5%
  } else {
    // Very high volatility (>50%)
    // Minimum allocation for very risky stocks
    volMultiplier = 0.5; // Max 10%
  }

  // Apply bounds to ensure reasonable limits
  volMultiplier = Math.max(0.25, Math.min(1.25, volMultiplier)); // 5% to 25% range

  return baseLimit * volMultiplier;
}

/**
 * Map average correlation to an adjustment multiplier
 *
 * @param {number} avgCorrelation - Average correlation
 * @returns {number} Correlation multiplier
 */
function calculateCorrelationMultiplier(avgCorrelation) {
  if (avgCorrelation >= 0.8) return 0.7;
  if (avgCorrelation >= 0.6) return 0.85;
  if (avgCorrelation >= 0.4) return 1.0;
  if (avgCorrelation >= 0.2) return 1.05;
  return 1.1;
}

/**
 * Calculate daily returns from price data
 *
 * @param {Array} pricesDf - Array of price data
 * @returns {Array} Daily returns
 */
function calculateDailyReturns(pricesDf) {
  const dailyReturns = [];

  for (let i = 1; i < pricesDf.length; i++) {
    const prevClose = pricesDf[i - 1].close;
    const currClose = pricesDf[i].close;

    if (prevClose && prevClose > 0) {
      dailyReturns.push((currClose - prevClose) / prevClose);
    }
  }

  return dailyReturns;
}

/**
 * Calculate standard deviation of an array
 *
 * @param {Array} arr - Array of numbers
 * @returns {number} Standard deviation
 */
function calculateStdDev(arr) {
  const n = arr.length;
  if (n === 0) return 0;

  const mean = arr.reduce((sum, val) => sum + val, 0) / n;
  const variance =
    arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;

  return Math.sqrt(variance);
}

/**
 * Calculate rolling volatility of returns
 *
 * @param {Array} returns - Array of return values
 * @param {number} window - Window size
 * @returns {Array} Rolling volatility values
 */
function calculateRollingVolatility(returns, window) {
  const rollingVol = [];

  for (let i = window - 1; i < returns.length; i++) {
    const windowReturns = returns.slice(i - window + 1, i + 1);
    rollingVol.push(calculateStdDev(windowReturns));
  }

  return rollingVol;
}

/**
 * Align returns data across tickers
 *
 * @param {Object} returnsByTicker - Returns data by ticker
 * @returns {Array} Aligned returns data
 */
function alignReturns(returnsByTicker) {
  // This is a simplified version - in a real implementation we would
  // need to ensure returns are properly aligned by date

  // For this implementation, we'll just take the minimum length
  // and assume they're already properly aligned
  const minLength = Math.min(
    ...Object.values(returnsByTicker).map((returns) => returns.length)
  );

  const alignedReturns = [];

  for (let i = 0; i < minLength; i++) {
    const dataPoint = {};

    for (const [ticker, returns] of Object.entries(returnsByTicker)) {
      dataPoint[ticker] = returns[i];
    }

    alignedReturns.push(dataPoint);
  }

  return alignedReturns;
}

/**
 * Calculate correlation matrix from aligned returns
 *
 * @param {Array} alignedReturns - Aligned returns data
 * @param {Array} tickers - List of tickers
 * @returns {Object} Correlation matrix
 */
function calculateCorrelationMatrix(alignedReturns, tickers) {
  const matrix = {};

  for (const ticker1 of tickers) {
    matrix[ticker1] = {};

    for (const ticker2 of tickers) {
      if (ticker1 === ticker2) {
        matrix[ticker1][ticker2] = 1.0;
        continue;
      }

      // Extract paired data points
      const paired = alignedReturns
        .filter((d) => d[ticker1] !== undefined && d[ticker2] !== undefined)
        .map((d) => [d[ticker1], d[ticker2]]);

      if (paired.length < 5) {
        matrix[ticker1][ticker2] = null;
        continue;
      }

      // Calculate correlation
      const correlation = calculateCorrelation(
        paired.map((p) => p[0]),
        paired.map((p) => p[1])
      );

      matrix[ticker1][ticker2] = correlation;
    }
  }

  return matrix;
}

/**
 * Calculate correlation between two arrays
 *
 * @param {Array} x - First array
 * @param {Array} y - Second array
 * @returns {number} Correlation coefficient
 */
function calculateCorrelation(x, y) {
  const n = x.length;

  // Mean of x and y
  const xMean = x.reduce((sum, val) => sum + val, 0) / n;
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;

  // Calculate numerator and denominators
  let numerator = 0;
  let xSS = 0;
  let ySS = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;

    numerator += xDiff * yDiff;
    xSS += xDiff * xDiff;
    ySS += yDiff * yDiff;
  }

  // Calculate correlation
  const denominator = Math.sqrt(xSS * ySS);

  return denominator === 0 ? 0 : numerator / denominator;
}
