import { createGraph, runGraphAsync, parseHedgeFundResponse } from "./graph.js";
import { createPortfolio } from "./portfolio.js";

/**
 * Service for running backtests on a hedge fund strategy
 */
export class BacktestService {
  /**
   * Create a new BacktestService
   *
   * @param {Object} graph - The compiled agent graph
   * @param {Object} portfolio - The starting portfolio
   * @param {Array<string>} tickers - List of stock tickers
   * @param {string} startDate - Start date for backtest
   * @param {string} endDate - End date for backtest
   * @param {number} initialCapital - Initial capital
   * @param {string} modelName - LLM model name
   * @param {string} modelProvider - LLM provider
   * @param {Object} request - Full request object
   */
  constructor(
    graph,
    portfolio,
    tickers,
    startDate,
    endDate,
    initialCapital,
    modelName,
    modelProvider,
    request
  ) {
    this.graph = graph;
    this.portfolio = portfolio;
    this.tickers = tickers;
    this.startDate = startDate;
    this.endDate = endDate;
    this.initialCapital = initialCapital;
    this.modelName = modelName;
    this.modelProvider = modelProvider;
    this.request = request;
  }

  /**
   * Run a backtest asynchronously with progress updates
   *
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Promise<Object>} Backtest results
   */
  async runBacktestAsync(progressCallback) {
    // Generate date range for backtest
    const dates = this._generateDateRange(this.startDate, this.endDate);
    const results = [];

    // Initialize portfolio
    let currentPortfolio = {
      cash: this.initialCapital,
      positions: {},
      value: this.initialCapital,
      margin_requirement: this.portfolio.margin_requirement || 0.5,
    };

    // Metrics tracking
    let highestValue = this.initialCapital;
    let lowestValue = this.initialCapital;
    let currentDrawdown = 0;
    let maxDrawdown = 0;

    // Run through each date
    for (let i = 0; i < dates.length; i++) {
      const currentDate = dates[i];

      // Notify progress
      if (progressCallback) {
        progressCallback({
          type: "progress",
          current_date: currentDate,
          current_step: i + 1,
          total_dates: dates.length,
        });
      }

      try {
        // Run the hedge fund for this date
        const result = await this._runHedgeFundForDate(
          currentDate,
          currentPortfolio
        );

        // Update metrics
        if (result.portfolio_value > highestValue) {
          highestValue = result.portfolio_value;
          currentDrawdown = 0;
        } else {
          currentDrawdown =
            (highestValue - result.portfolio_value) / highestValue;
          if (currentDrawdown > maxDrawdown) {
            maxDrawdown = currentDrawdown;
          }
        }

        if (result.portfolio_value < lowestValue) {
          lowestValue = result.portfolio_value;
        }

        // Update current portfolio for next iteration
        currentPortfolio = {
          cash: result.cash,
          positions: result.positions,
          value: result.portfolio_value,
          margin_requirement: this.portfolio.margin_requirement,
        };

        // Add result to results array
        results.push(result);

        // Notify with day result
        if (progressCallback) {
          progressCallback({
            type: "backtest_result",
            data: result,
          });
        }
      } catch (error) {
        console.error(`Error during backtest for date ${currentDate}:`, error);
        // Continue with next date
      }
    }

    // Calculate performance metrics
    const finalValue =
      results.length > 0
        ? results[results.length - 1].portfolio_value
        : this.initialCapital;
    const totalReturn =
      (finalValue - this.initialCapital) / this.initialCapital;
    const annualizedReturn = this._calculateAnnualizedReturn(
      this.initialCapital,
      finalValue,
      dates.length
    );

    // Calculate volatility (standard deviation of daily returns)
    const dailyReturns = [];
    for (let i = 1; i < results.length; i++) {
      const prevValue = results[i - 1].portfolio_value;
      const currentValue = results[i].portfolio_value;
      dailyReturns.push((currentValue - prevValue) / prevValue);
    }

    const volatility = this._calculateVolatility(dailyReturns);
    const sharpeRatio = this._calculateSharpeRatio(
      annualizedReturn,
      volatility
    );

    // Final performance metrics
    const performanceMetrics = {
      initial_capital: this.initialCapital,
      final_value: finalValue,
      total_return: totalReturn,
      total_return_pct: totalReturn * 100,
      annualized_return: annualizedReturn,
      annualized_return_pct: annualizedReturn * 100,
      max_drawdown: maxDrawdown,
      max_drawdown_pct: maxDrawdown * 100,
      volatility: volatility,
      sharpe_ratio: sharpeRatio,
    };

    return {
      results,
      performance_metrics: performanceMetrics,
      final_portfolio: currentPortfolio,
    };
  }

  /**
   * Run the hedge fund for a specific date
   *
   * @param {string} date - The date to run for
   * @param {Object} currentPortfolio - Current portfolio state
   * @returns {Promise<Object>} Day's result
   * @private
   */
  async _runHedgeFundForDate(date, currentPortfolio) {
    // Run the graph for this date
    const result = await runGraphAsync(
      this.graph,
      currentPortfolio,
      this.tickers,
      date, // Use the current date as both start and end
      date,
      this.modelName,
      this.modelProvider,
      this.request
    );

    // Parse the decisions
    const decisions = parseHedgeFundResponse(
      result.messages[result.messages.length - 1].content
    );

    // Simulate trades based on decisions
    const currentPrices = result.data.current_prices || {};
    const trades = this._simulateTrades(
      currentPortfolio,
      decisions,
      currentPrices
    );

    // Calculate new portfolio value
    const portfolioValue = this._calculatePortfolioValue(
      trades.newPortfolio.cash,
      trades.newPortfolio.positions,
      currentPrices
    );

    // Return the day's result
    return {
      date,
      decisions,
      trades: trades.trades,
      cash: trades.newPortfolio.cash,
      positions: trades.newPortfolio.positions,
      portfolio_value: portfolioValue,
    };
  }

  /**
   * Simulate trades based on decisions
   *
   * @param {Object} portfolio - Current portfolio
   * @param {Object} decisions - Trading decisions
   * @param {Object} currentPrices - Current market prices
   * @returns {Object} New portfolio and executed trades
   * @private
   */
  _simulateTrades(portfolio, decisions, currentPrices) {
    const newPortfolio = {
      cash: portfolio.cash,
      positions: { ...portfolio.positions },
    };

    const trades = [];

    // Process each ticker in decisions
    for (const [ticker, decision] of Object.entries(decisions)) {
      const currentPrice = currentPrices[ticker] || 0;
      if (!currentPrice) continue;

      const recommendation = decision.recommendation || "hold";
      const allocationPct = decision.allocation_percentage || 0;

      if (recommendation === "buy") {
        // Calculate target allocation amount
        const targetAllocation =
          (portfolio.cash +
            this._getPositionsValue(portfolio.positions, currentPrices)) *
          (allocationPct / 100);
        const currentAllocation =
          (newPortfolio.positions[ticker]?.shares || 0) * currentPrice;

        if (targetAllocation > currentAllocation) {
          // Buy more shares
          const amountToInvest = targetAllocation - currentAllocation;
          const sharesToBuy = Math.floor(amountToInvest / currentPrice);

          if (sharesToBuy > 0 && amountToInvest <= newPortfolio.cash) {
            // Execute the buy
            const cost = sharesToBuy * currentPrice;
            newPortfolio.cash -= cost;

            if (!newPortfolio.positions[ticker]) {
              newPortfolio.positions[ticker] = { shares: 0, cost_basis: 0 };
            }

            const newTotalShares =
              (newPortfolio.positions[ticker].shares || 0) + sharesToBuy;
            const newCostBasis =
              ((newPortfolio.positions[ticker].cost_basis || 0) *
                (newPortfolio.positions[ticker].shares || 0) +
                cost) /
              newTotalShares;

            newPortfolio.positions[ticker] = {
              shares: newTotalShares,
              cost_basis: newCostBasis,
            };

            trades.push({
              ticker,
              action: "buy",
              shares: sharesToBuy,
              price: currentPrice,
              total: cost,
            });
          }
        }
      } else if (recommendation === "sell") {
        // Sell position
        const currentShares = newPortfolio.positions[ticker]?.shares || 0;

        if (currentShares > 0) {
          const proceeds = currentShares * currentPrice;
          newPortfolio.cash += proceeds;

          trades.push({
            ticker,
            action: "sell",
            shares: currentShares,
            price: currentPrice,
            total: proceeds,
          });

          delete newPortfolio.positions[ticker];
        }
      }
      // For "hold", do nothing
    }

    return {
      newPortfolio,
      trades,
    };
  }

  /**
   * Calculate total portfolio value
   *
   * @param {number} cash - Cash amount
   * @param {Object} positions - Portfolio positions
   * @param {Object} prices - Current market prices
   * @returns {number} Total portfolio value
   * @private
   */
  _calculatePortfolioValue(cash, positions, prices) {
    const positionsValue = this._getPositionsValue(positions, prices);
    return cash + positionsValue;
  }

  /**
   * Get the total value of positions
   *
   * @param {Object} positions - Portfolio positions
   * @param {Object} prices - Current market prices
   * @returns {number} Total value of positions
   * @private
   */
  _getPositionsValue(positions, prices) {
    let value = 0;

    for (const [ticker, position] of Object.entries(positions)) {
      const price = prices[ticker] || 0;
      value += (position.shares || 0) * price;
    }

    return value;
  }

  /**
   * Generate a date range for the backtest
   *
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Array<string>} Array of date strings
   * @private
   */
  _generateDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates = [];

    // Generate trading days (skip weekends)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
        // Skip weekends (0 = Sunday, 6 = Saturday)
        dates.push(d.toISOString().split("T")[0]);
      }
    }

    return dates;
  }

  /**
   * Calculate annualized return
   *
   * @param {number} initialValue - Initial portfolio value
   * @param {number} finalValue - Final portfolio value
   * @param {number} days - Number of days
   * @returns {number} Annualized return
   * @private
   */
  _calculateAnnualizedReturn(initialValue, finalValue, days) {
    const totalReturn = finalValue / initialValue;
    const years = days / 252; // Trading days in a year
    return Math.pow(totalReturn, 1 / years) - 1;
  }

  /**
   * Calculate volatility from returns
   *
   * @param {Array<number>} returns - Array of returns
   * @returns {number} Annualized volatility
   * @private
   */
  _calculateVolatility(returns) {
    if (returns.length === 0) return 0;

    // Calculate mean
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Calculate variance
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      returns.length;

    // Calculate daily standard deviation
    const dailyStdDev = Math.sqrt(variance);

    // Annualize (multiply by sqrt of trading days in a year)
    return dailyStdDev * Math.sqrt(252);
  }

  /**
   * Calculate Sharpe ratio
   *
   * @param {number} annualizedReturn - Annualized return
   * @param {number} volatility - Annualized volatility
   * @returns {number} Sharpe ratio
   * @private
   */
  _calculateSharpeRatio(annualizedReturn, volatility) {
    const riskFreeRate = 0.02; // Assume 2% risk-free rate
    if (volatility === 0) return 0;
    return (annualizedReturn - riskFreeRate) / volatility;
  }
}
