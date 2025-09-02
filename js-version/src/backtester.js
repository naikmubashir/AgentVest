import dotenv from "dotenv";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  format,
  parseISO,
  addBusinessDays,
  addYears,
  subYears,
} from "date-fns";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { runHedgeFund, parseHedgeFundResponse } from "./main.js";
import {
  getCompanyNews,
  getPriceData,
  getPrices,
  getFinancialMetrics,
  getInsiderTrades,
} from "./tools/api.js";
import { LLM_ORDER, OLLAMA_LLM_ORDER, getModelInfo } from "./llm/models.js";
import { ANALYST_ORDER } from "./utils/analysts.js";
import { ensureOllamaAndModel } from "./utils/ollama.js";

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Backtester class for AI Hedge Fund
 */
class Backtester {
  /**
   * Create a new Backtester instance
   *
   * @param {Function} agent - The trading agent function
   * @param {Array<string>} tickers - List of tickers to backtest
   * @param {string} startDate - Start date string (YYYY-MM-DD)
   * @param {string} endDate - End date string (YYYY-MM-DD)
   * @param {number} initialCapital - Starting portfolio cash
   * @param {string} modelName - Which LLM model to use
   * @param {string} modelProvider - Which LLM provider
   * @param {Array<string>} selectedAnalysts - List of analysts to incorporate
   * @param {number} initialMarginRequirement - The margin ratio (e.g. 0.5 = 50%)
   */
  constructor(
    agent,
    tickers,
    startDate,
    endDate,
    initialCapital,
    modelName = "gpt-4o",
    modelProvider = "OPENAI",
    selectedAnalysts = [],
    initialMarginRequirement = 0.0
  ) {
    this.agent = agent;
    this.tickers = tickers;
    this.startDate = startDate;
    this.endDate = endDate;
    this.initialCapital = initialCapital;
    this.modelName = modelName;
    this.modelProvider = modelProvider;
    this.selectedAnalysts = selectedAnalysts;

    // Initialize portfolio with support for long/short positions
    this.portfolioValues = [];
    this.portfolio = {
      cash: initialCapital,
      margin_used: 0.0,
      margin_requirement: initialMarginRequirement,
      positions: {},
      realized_gains: {},
    };

    // Initialize positions and realized gains for each ticker
    for (const ticker of tickers) {
      this.portfolio.positions[ticker] = {
        long: 0,
        short: 0,
        long_cost_basis: 0.0,
        short_cost_basis: 0.0,
        short_margin_used: 0.0,
      };

      this.portfolio.realized_gains[ticker] = {
        long: 0.0,
        short: 0.0,
      };
    }
  }

  /**
   * Execute trades with support for both long and short positions
   *
   * @param {string} ticker - Stock ticker
   * @param {string} action - Trade action (buy, sell, short, cover)
   * @param {number} quantity - Number of shares to trade
   * @param {number} currentPrice - Current price per share
   * @returns {number} - Actual quantity traded
   */
  executeTrade(ticker, action, quantity, currentPrice) {
    if (quantity <= 0) {
      return 0;
    }

    quantity = Math.floor(quantity); // force integer shares
    const position = this.portfolio.positions[ticker];

    if (action === "buy") {
      const cost = quantity * currentPrice;
      if (cost <= this.portfolio.cash) {
        // Weighted average cost basis for the new total
        const oldShares = position.long;
        const oldCostBasis = position.long_cost_basis;
        const newShares = quantity;
        const totalShares = oldShares + newShares;

        if (totalShares > 0) {
          const totalOldCost = oldCostBasis * oldShares;
          const totalNewCost = cost;
          position.long_cost_basis =
            (totalOldCost + totalNewCost) / totalShares;
        }

        position.long += quantity;
        this.portfolio.cash -= cost;
        return quantity;
      } else {
        // Calculate maximum affordable quantity
        const maxQuantity = Math.floor(this.portfolio.cash / currentPrice);
        if (maxQuantity > 0) {
          const cost = maxQuantity * currentPrice;
          const oldShares = position.long;
          const oldCostBasis = position.long_cost_basis;
          const totalShares = oldShares + maxQuantity;

          if (totalShares > 0) {
            const totalOldCost = oldCostBasis * oldShares;
            const totalNewCost = cost;
            position.long_cost_basis =
              (totalOldCost + totalNewCost) / totalShares;
          }

          position.long += maxQuantity;
          this.portfolio.cash -= cost;
          return maxQuantity;
        }
        return 0;
      }
    } else if (action === "sell") {
      // You can only sell as many as you own
      quantity = Math.min(quantity, position.long);
      if (quantity > 0) {
        // Realized gain/loss using average cost basis
        const avgCostPerShare =
          position.long > 0 ? position.long_cost_basis : 0;
        const realizedGain = (currentPrice - avgCostPerShare) * quantity;
        this.portfolio.realized_gains[ticker].long += realizedGain;

        position.long -= quantity;
        this.portfolio.cash += quantity * currentPrice;

        if (position.long === 0) {
          position.long_cost_basis = 0.0;
        }

        return quantity;
      }
    } else if (action === "short") {
      /*
       * Typical short sale flow:
       *   1) Receive proceeds = current_price * quantity
       *   2) Post margin_required = proceeds * margin_ratio
       *   3) Net effect on cash = +proceeds - margin_required
       */
      const proceeds = currentPrice * quantity;
      const marginRequired = proceeds * this.portfolio.margin_requirement;
      if (marginRequired <= this.portfolio.cash) {
        // Weighted average short cost basis
        const oldShortShares = position.short;
        const oldCostBasis = position.short_cost_basis;
        const newShares = quantity;
        const totalShares = oldShortShares + newShares;

        if (totalShares > 0) {
          const totalOldCost = oldCostBasis * oldShortShares;
          const totalNewCost = currentPrice * newShares;
          position.short_cost_basis =
            (totalOldCost + totalNewCost) / totalShares;
        }

        position.short += quantity;

        // Update margin usage
        position.short_margin_used += marginRequired;
        this.portfolio.margin_used += marginRequired;

        // Increase cash by proceeds, then subtract the required margin
        this.portfolio.cash += proceeds;
        this.portfolio.cash -= marginRequired;
        return quantity;
      } else {
        // Calculate maximum shortable quantity
        const marginRatio = this.portfolio.margin_requirement;
        if (marginRatio > 0) {
          const maxQuantity = Math.floor(
            this.portfolio.cash / (currentPrice * marginRatio)
          );
          if (maxQuantity > 0) {
            const proceeds = currentPrice * maxQuantity;
            const marginRequired = proceeds * marginRatio;

            const oldShortShares = position.short;
            const oldCostBasis = position.short_cost_basis;
            const totalShares = oldShortShares + maxQuantity;

            if (totalShares > 0) {
              const totalOldCost = oldCostBasis * oldShortShares;
              const totalNewCost = currentPrice * maxQuantity;
              position.short_cost_basis =
                (totalOldCost + totalNewCost) / totalShares;
            }

            position.short += maxQuantity;
            position.short_margin_used += marginRequired;
            this.portfolio.margin_used += marginRequired;

            this.portfolio.cash += proceeds;
            this.portfolio.cash -= marginRequired;
            return maxQuantity;
          }
        }
        return 0;
      }
    } else if (action === "cover") {
      /*
       * When covering shares:
       *   1) Pay cover cost = current_price * quantity
       *   2) Release a proportional share of the margin
       *   3) Net effect on cash = -cover_cost + released_margin
       */
      quantity = Math.min(quantity, position.short);
      if (quantity > 0) {
        const coverCost = quantity * currentPrice;
        const avgShortPrice =
          position.short > 0 ? position.short_cost_basis : 0;
        const realizedGain = (avgShortPrice - currentPrice) * quantity;

        const portion = position.short > 0 ? quantity / position.short : 1.0;
        const marginToRelease = portion * position.short_margin_used;

        position.short -= quantity;
        position.short_margin_used -= marginToRelease;
        this.portfolio.margin_used -= marginToRelease;

        // Pay the cost to cover, but get back the released margin
        this.portfolio.cash += marginToRelease;
        this.portfolio.cash -= coverCost;

        this.portfolio.realized_gains[ticker].short += realizedGain;

        if (position.short === 0) {
          position.short_cost_basis = 0.0;
          position.short_margin_used = 0.0;
        }

        return quantity;
      }
    }

    return 0;
  }

  /**
   * Calculate total portfolio value
   *
   * @param {Object} currentPrices - Current prices for all tickers
   * @returns {number} - Total portfolio value
   */
  calculatePortfolioValue(currentPrices) {
    let totalValue = this.portfolio.cash;

    for (const ticker of this.tickers) {
      const position = this.portfolio.positions[ticker];
      const price = currentPrices[ticker];

      // Long position value
      const longValue = position.long * price;
      totalValue += longValue;

      // Short position unrealized PnL = short_shares * (short_cost_basis - current_price)
      if (position.short > 0) {
        totalValue -= position.short * price;
      }
    }

    return totalValue;
  }

  /**
   * Pre-fetch all data needed for the backtest period
   */
  async prefetchData() {
    console.log("\nPre-fetching data for the entire backtest period...");

    // Convert end_date string to Date, fetch up to 1 year before
    const endDateObj = parseISO(this.endDate);
    const startDateObj = subYears(endDateObj, 1);
    const startDateStr = format(startDateObj, "yyyy-MM-dd");

    for (const ticker of this.tickers) {
      // Fetch price data for the entire period, plus 1 year
      await getPrices(ticker, startDateStr, this.endDate);

      // Fetch financial metrics
      await getFinancialMetrics(ticker, this.endDate, "annual", 10);

      // Fetch insider trades
      await getInsiderTrades(ticker, this.endDate, this.startDate, 1000);

      // Fetch company news
      await getCompanyNews(ticker, this.endDate, this.startDate, 1000);
    }

    console.log("Data pre-fetch complete.");
  }

  /**
   * Generate date range between start and end dates (business days only)
   *
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Array<string>} - Array of date strings
   */
  generateDateRange(startDate, endDate) {
    const dates = [];
    let currentDate = parseISO(startDate);
    const end = parseISO(endDate);

    while (currentDate <= end) {
      dates.push(format(currentDate, "yyyy-MM-dd"));
      currentDate = addBusinessDays(currentDate, 1);
    }

    return dates;
  }

  /**
   * Calculate annualized return
   *
   * @param {number} initialValue - Initial portfolio value
   * @param {number} finalValue - Final portfolio value
   * @param {number} days - Number of days in the backtest
   * @returns {number} - Annualized return
   */
  calculateAnnualizedReturn(initialValue, finalValue, days) {
    const totalReturn = finalValue / initialValue - 1;
    const annualizedReturn = Math.pow(1 + totalReturn, 365 / days) - 1;
    return annualizedReturn;
  }

  /**
   * Calculate Sharpe ratio
   *
   * @param {number} annualizedReturn - Annualized return
   * @param {number} annualizedStdDev - Annualized standard deviation
   * @param {number} riskFreeRate - Risk-free rate (default: 0.02)
   * @returns {number} - Sharpe ratio
   */
  calculateSharpeRatio(
    annualizedReturn,
    annualizedStdDev,
    riskFreeRate = 0.02
  ) {
    if (annualizedStdDev === 0) return 0;
    return (annualizedReturn - riskFreeRate) / annualizedStdDev;
  }

  /**
   * Calculate Sortino ratio
   *
   * @param {Array<number>} returns - Array of period returns
   * @param {number} annualizedReturn - Annualized return
   * @param {number} riskFreeRate - Risk-free rate (default: 0.02)
   * @returns {number} - Sortino ratio
   */
  calculateSortinoRatio(returns, annualizedReturn, riskFreeRate = 0.02) {
    // Calculate downside deviation (only negative returns)
    const negativeReturns = returns.filter((r) => r < 0);
    if (negativeReturns.length === 0) return 0;

    const downsideVariance =
      negativeReturns.reduce((sum, r) => sum + r * r, 0) /
      negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance * 252); // Annualize

    if (downsideDeviation === 0) return 0;
    return (annualizedReturn - riskFreeRate) / downsideDeviation;
  }

  /**
   * Calculate maximum drawdown
   *
   * @param {Array<number>} portfolioValues - Array of portfolio values
   * @returns {number} - Maximum drawdown as a percentage
   */
  calculateMaxDrawdown(portfolioValues) {
    let maxDrawdown = 0;
    let peak = portfolioValues[0];

    for (const value of portfolioValues) {
      if (value > peak) {
        peak = value;
      } else {
        const drawdown = (peak - value) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown;
  }

  /**
   * Format backtest results row
   *
   * @param {string} date - Date string
   * @param {number} portfolioValue - Portfolio value
   * @param {number} dailyReturn - Daily return percentage
   * @param {Object} positions - Portfolio positions
   * @returns {string} - Formatted row
   */
  formatBacktestRow(date, portfolioValue, dailyReturn, positions) {
    let positionSummary = "";
    let totalShares = 0;

    for (const [ticker, position] of Object.entries(positions)) {
      const netShares = position.long - position.short;
      if (netShares !== 0) {
        totalShares += Math.abs(netShares);
        positionSummary += `${ticker}: ${
          netShares > 0 ? "+" : ""
        }${netShares}, `;
      }
    }

    positionSummary = positionSummary.slice(0, -2); // Remove trailing comma and space

    const returnColor = dailyReturn >= 0 ? chalk.green : chalk.red;
    const formattedReturn = returnColor(
      `${dailyReturn >= 0 ? "+" : ""}${(dailyReturn * 100).toFixed(2)}%`
    );

    return [
      date,
      `$${portfolioValue.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      formattedReturn,
      totalShares > 0 ? positionSummary : "Cash",
    ];
  }

  /**
   * Print backtest results
   *
   * @param {Array<Object>} results - Backtest results
   * @param {Object} metrics - Performance metrics
   */
  printBacktestResults(results, metrics) {
    console.log(chalk.blue.bold("\n==== BACKTEST RESULTS ===="));

    // Print summary statistics
    console.log(chalk.yellow.bold("\nPerformance Metrics:"));
    console.log(`Initial Capital: $${metrics.initialCapital.toLocaleString()}`);
    console.log(
      `Final Value: $${metrics.finalValue.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    );
    console.log(
      `Total Return: ${metrics.totalReturn >= 0 ? "+" : ""}${(
        metrics.totalReturn * 100
      ).toFixed(2)}%`
    );
    console.log(
      `Annualized Return: ${metrics.annualizedReturn >= 0 ? "+" : ""}${(
        metrics.annualizedReturn * 100
      ).toFixed(2)}%`
    );
    console.log(`Max Drawdown: -${(metrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
    console.log(`Sortino Ratio: ${metrics.sortinoRatio.toFixed(2)}`);

    // Print realized gains
    console.log(chalk.yellow.bold("\nRealized Gains/Losses:"));
    let totalRealizedGains = 0;

    for (const [ticker, gains] of Object.entries(
      this.portfolio.realized_gains
    )) {
      const longGains = gains.long;
      const shortGains = gains.short;
      const totalGains = longGains + shortGains;
      totalRealizedGains += totalGains;

      if (longGains !== 0 || shortGains !== 0) {
        const longColor = longGains >= 0 ? chalk.green : chalk.red;
        const shortColor = shortGains >= 0 ? chalk.green : chalk.red;
        const totalColor = totalGains >= 0 ? chalk.green : chalk.red;

        console.log(
          `${ticker}: Long ${longColor(
            `$${longGains.toFixed(2)}`
          )} | Short ${shortColor(
            `$${shortGains.toFixed(2)}`
          )} | Total ${totalColor(`$${totalGains.toFixed(2)}`)}`
        );
      }
    }

    const totalGainsColor = totalRealizedGains >= 0 ? chalk.green : chalk.red;
    console.log(
      `\nTotal Realized: ${totalGainsColor(
        `$${totalRealizedGains.toFixed(2)}`
      )}`
    );

    // Print final positions
    console.log(chalk.yellow.bold("\nFinal Positions:"));
    console.log(`Cash: $${this.portfolio.cash.toFixed(2)}`);

    let hasFinalPositions = false;

    for (const [ticker, position] of Object.entries(this.portfolio.positions)) {
      if (position.long > 0) {
        hasFinalPositions = true;
        console.log(
          `${ticker} LONG: ${
            position.long
          } shares @ $${position.long_cost_basis.toFixed(2)} avg cost`
        );
      }

      if (position.short > 0) {
        hasFinalPositions = true;
        console.log(
          `${ticker} SHORT: ${
            position.short
          } shares @ $${position.short_cost_basis.toFixed(2)} avg cost`
        );
      }
    }

    if (!hasFinalPositions) {
      console.log("No open positions");
    }
  }

  /**
   * Run backtest
   *
   * @returns {Object} - Backtest results and metrics
   */
  async runBacktest() {
    // Pre-fetch all data at the start
    await this.prefetchData();

    const dates = this.generateDateRange(this.startDate, this.endDate);
    const tableRows = [];
    const portfolioValueHistory = [this.initialCapital];
    const dailyReturns = [];

    console.log("\nStarting backtest...");

    // Initialize portfolio values list with initial capital
    this.portfolioValues = [this.initialCapital];
    let previousPortfolioValue = this.initialCapital;

    let lastPortfolioValue = this.initialCapital;

    // Track metrics for final calculations
    const performanceMetrics = {
      sharpeRatio: null,
      sortinoRatio: null,
      maxDrawdown: null,
      longShortRatio: null,
      grossExposure: null,
      netExposure: null,
    };

    // Loop through each date in the backtest period
    for (const date of dates) {
      console.log(`\nProcessing date: ${date}`);

      try {
        // Get current prices for all tickers
        const prices = {};
        let hasPrices = true;

        for (const ticker of this.tickers) {
          const priceData = await getPriceData(ticker, date);
          if (!priceData || !priceData.close) {
            console.log(`No price data for ${ticker} on ${date}, skipping day`);
            hasPrices = false;
            break;
          }
          prices[ticker] = priceData.close;
        }

        if (!hasPrices) continue;

        // Calculate current portfolio value
        const portfolioValue = this.calculatePortfolioValue(prices);
        this.portfolioValues.push(portfolioValue);

        // Calculate daily return
        const dailyReturn =
          (portfolioValue - previousPortfolioValue) / previousPortfolioValue;
        dailyReturns.push(dailyReturn);
        previousPortfolioValue = portfolioValue;

        // Make trading decisions using the hedge fund model
        const hedgeFundState = {
          data: {
            tickers: this.tickers,
            start_date: date,
            end_date: date,
            portfolio: { ...this.portfolio },
          },
          metadata: {
            show_reasoning: false,
            llm_model: this.modelName,
            model_provider: this.modelProvider,
          },
        };

        // Run the AI Hedge Fund for this date
        const result = await this.agent(hedgeFundState);

        // Parse trading decisions
        const decisionsStr =
          result.messages[result.messages.length - 1].content;
        const decisions = parseHedgeFundResponse(decisionsStr);

        if (!decisions) {
          console.log(`No valid decisions for ${date}, continuing...`);
          continue;
        }

        // Execute trades based on decisions
        const trades = [];

        for (const ticker of this.tickers) {
          const tickerDecision = decisions[ticker];
          if (!tickerDecision) continue;

          const { action, quantity } = tickerDecision;
          if (!action || !quantity) continue;

          const price = prices[ticker];
          const sharesTraded = this.executeTrade(
            ticker,
            action,
            quantity,
            price
          );

          if (sharesTraded > 0) {
            trades.push(
              `${action.toUpperCase()} ${sharesTraded} ${ticker} @ $${price.toFixed(
                2
              )}`
            );
          }
        }

        // Calculate updated portfolio value after trades
        const updatedPortfolioValue = this.calculatePortfolioValue(prices);
        lastPortfolioValue = updatedPortfolioValue;

        // Add row to results table
        const row = this.formatBacktestRow(
          date,
          updatedPortfolioValue,
          dailyReturn,
          this.portfolio.positions
        );

        tableRows.push(row);

        // Log the day's activity
        console.log(
          `Portfolio value: $${updatedPortfolioValue.toFixed(2)} (${
            dailyReturn >= 0 ? "+" : ""
          }${(dailyReturn * 100).toFixed(2)}%)`
        );
        if (trades.length > 0) {
          console.log("Trades executed: " + trades.join(", "));
        } else {
          console.log("No trades executed");
        }
      } catch (error) {
        console.error(`Error on date ${date}:`, error);
      }
    }

    // Calculate final performance metrics
    const finalValue = lastPortfolioValue;
    const totalReturn =
      (finalValue - this.initialCapital) / this.initialCapital;
    const annualizedReturn = this.calculateAnnualizedReturn(
      this.initialCapital,
      finalValue,
      dates.length
    );

    // Calculate annualized standard deviation
    const returnsMean =
      dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const returnsVariance =
      dailyReturns.reduce((sum, r) => sum + Math.pow(r - returnsMean, 2), 0) /
      dailyReturns.length;
    const dailyStdDev = Math.sqrt(returnsVariance);
    const annualizedStdDev = dailyStdDev * Math.sqrt(252); // Assuming 252 trading days per year

    // Calculate Sharpe and Sortino ratios
    const sharpeRatio = this.calculateSharpeRatio(
      annualizedReturn,
      annualizedStdDev
    );
    const sortinoRatio = this.calculateSortinoRatio(
      dailyReturns,
      annualizedReturn
    );

    // Calculate maximum drawdown
    const maxDrawdown = this.calculateMaxDrawdown(this.portfolioValues);

    // Calculate exposure metrics
    let longExposure = 0;
    let shortExposure = 0;

    for (const [ticker, position] of Object.entries(this.portfolio.positions)) {
      if (position.long > 0 || position.short > 0) {
        // Use the last known price for each ticker
        const lastPrice = await getPriceData(ticker, this.endDate);
        if (lastPrice && lastPrice.close) {
          longExposure += position.long * lastPrice.close;
          shortExposure += position.short * lastPrice.close;
        }
      }
    }

    const grossExposure = (longExposure + shortExposure) / finalValue;
    const netExposure = (longExposure - shortExposure) / finalValue;
    const longShortRatio =
      shortExposure > 0
        ? longExposure / shortExposure
        : longExposure > 0
        ? Infinity
        : 0;

    // Compile performance metrics
    const metrics = {
      initialCapital: this.initialCapital,
      finalValue,
      totalReturn,
      annualizedReturn,
      volatility: annualizedStdDev,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      longShortRatio,
      grossExposure,
      netExposure,
    };

    // Print the results
    this.printBacktestResults(tableRows, metrics);

    // Return the results
    return {
      results: tableRows,
      metrics,
    };
  }
}

/**
 * Run the backtester CLI
 */
async function main() {
  try {
    // Get user input
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "tickers",
        message: "Enter ticker symbols (comma separated):",
        default: "AAPL,MSFT,GOOGL",
        validate: (input) =>
          input.length > 0 ? true : "Please enter at least one ticker",
      },
      {
        type: "input",
        name: "startDate",
        message: "Enter start date (YYYY-MM-DD):",
        default: format(
          new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          "yyyy-MM-dd"
        ),
        validate: (input) =>
          /^\d{4}-\d{2}-\d{2}$/.test(input)
            ? true
            : "Please enter a valid date format (YYYY-MM-DD)",
      },
      {
        type: "input",
        name: "endDate",
        message: "Enter end date (YYYY-MM-DD):",
        default: format(new Date(), "yyyy-MM-dd"),
        validate: (input) =>
          /^\d{4}-\d{2}-\d{2}$/.test(input)
            ? true
            : "Please enter a valid date format (YYYY-MM-DD)",
      },
      {
        type: "number",
        name: "initialCapital",
        message: "Enter initial capital:",
        default: 1000000,
        validate: (input) =>
          input > 0 ? true : "Initial capital must be greater than 0",
      },
      {
        type: "number",
        name: "marginRequirement",
        message: "Enter margin requirement ratio (0-1):",
        default: 0.5,
        validate: (input) =>
          input >= 0 && input <= 1
            ? true
            : "Margin requirement must be between 0 and 1",
      },
      {
        type: "list",
        name: "modelProvider",
        message: "Choose LLM provider:",
        choices: ["OPENAI", "OLLAMA"],
        default: "OPENAI",
      },
    ]);

    // Choose model based on provider
    let modelChoices = [];
    if (answers.modelProvider === "OPENAI") {
      modelChoices = LLM_ORDER;
    } else if (answers.modelProvider === "OLLAMA") {
      // Ensure Ollama is running and model is available
      await ensureOllamaAndModel();
      modelChoices = OLLAMA_LLM_ORDER;
    }

    const modelAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "modelName",
        message: "Choose LLM model:",
        choices: modelChoices,
        default: modelChoices[0],
      },
    ]);

    // Parse tickers
    const tickers = answers.tickers
      .split(",")
      .map((ticker) => ticker.trim().toUpperCase());

    // Create backtester instance
    const backtester = new Backtester(
      runHedgeFund,
      tickers,
      answers.startDate,
      answers.endDate,
      answers.initialCapital,
      modelAnswer.modelName,
      answers.modelProvider,
      [],
      answers.marginRequirement
    );

    // Run backtest
    await backtester.runBacktest();
  } catch (error) {
    console.error("Error running backtester:", error);
  }
}

// Run the main function if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { Backtester };
