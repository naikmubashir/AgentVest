import { ChatPromptTemplate } from "langchain/prompts";
import { HumanMessage } from "langchain/schema";
import { progress } from "../utils/progress.js";
import { callLLM } from "../utils/llm.js";
import { showAgentReasoning } from "../graph/state.js";

/**
 * Portfolio Decision model
 * @typedef {Object} PortfolioDecision
 * @property {'buy'|'sell'|'short'|'cover'|'hold'} action - Type of action to take
 * @property {number} quantity - Number of shares to trade
 * @property {number} confidence - Confidence in the decision, between 0.0 and 100.0
 * @property {string} reasoning - Reasoning for the decision
 */

/**
 * Portfolio Manager Output model
 * @typedef {Object} PortfolioManagerOutput
 * @property {Object.<string, PortfolioDecision>} decisions - Dictionary of ticker to trading decisions
 */

/**
 * Makes final trading decisions and generates orders for multiple tickers
 *
 * @param {Object} state - The agent state
 * @param {string} agentId - The agent ID
 * @returns {Object} Updated state with portfolio decisions
 */
export function portfolioManagementAgent(state, agentId = "portfolio_manager") {
  // Get the portfolio and analyst signals
  const portfolio = state.data.portfolio;
  const analystSignals = state.data.analyst_signals;
  const tickers = state.data.tickers;

  // Get position limits, current prices, and signals for every ticker
  const positionLimits = {};
  const currentPrices = {};
  const maxShares = {};
  const signalsByTicker = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Processing analyst signals");

    // Get position limits and current prices for the ticker
    // Find the corresponding risk manager for this portfolio manager
    let riskManagerId;
    if (agentId.startsWith("portfolio_manager_")) {
      const suffix = agentId.split("_").pop();
      riskManagerId = `risk_management_agent_${suffix}`;
    } else {
      riskManagerId = "risk_management_agent"; // Fallback for CLI
    }

    const riskData = (analystSignals[riskManagerId] || {})[ticker] || {};
    positionLimits[ticker] = riskData.remaining_position_limit || 0;
    currentPrices[ticker] = riskData.current_price || 0;

    // Calculate maximum shares allowed based on position limit and price
    if (currentPrices[ticker] > 0) {
      maxShares[ticker] = Math.floor(
        positionLimits[ticker] / currentPrices[ticker]
      );
    } else {
      maxShares[ticker] = 0;
    }

    // Get signals for the ticker
    const tickerSignals = {};
    for (const [agent, signals] of Object.entries(analystSignals)) {
      // Skip all risk management agents (they have different signal structure)
      if (!agent.startsWith("risk_management_agent") && signals[ticker]) {
        tickerSignals[agent] = {
          signal: signals[ticker].signal,
          confidence: signals[ticker].confidence,
        };
      }
    }
    signalsByTicker[ticker] = tickerSignals;
  }

  // Add current_prices to the state data so it's available throughout the workflow
  state.data.current_prices = currentPrices;

  progress.updateStatus(agentId, null, "Generating trading decisions");

  // Generate the trading decision
  const result = generateTradingDecision(
    tickers,
    signalsByTicker,
    currentPrices,
    maxShares,
    portfolio,
    agentId,
    state
  );

  // Create the portfolio management message
  const message = new HumanMessage({
    content: JSON.stringify(
      Object.fromEntries(
        Object.entries(result.decisions).map(([ticker, decision]) => [
          ticker,
          decision,
        ])
      )
    ),
    name: agentId,
  });

  // Print the decision if the flag is set
  if (state.metadata.show_reasoning) {
    showAgentReasoning(
      Object.fromEntries(
        Object.entries(result.decisions).map(([ticker, decision]) => [
          ticker,
          decision,
        ])
      ),
      "Portfolio Manager"
    );
  }

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [...state.messages, message],
    data: state.data,
  };
}

/**
 * Attempts to get a decision from the LLM with retry logic
 *
 * @param {string[]} tickers - List of ticker symbols
 * @param {Object} signalsByTicker - Dictionary of ticker → signals
 * @param {Object} currentPrices - Current prices for each ticker
 * @param {Object} maxShares - Maximum shares allowed per ticker
 * @param {Object} portfolio - Current portfolio state
 * @param {string} agentId - The agent ID
 * @param {Object} state - Current state
 * @returns {PortfolioManagerOutput} Portfolio manager output with decisions
 */
function generateTradingDecision(
  tickers,
  signalsByTicker,
  currentPrices,
  maxShares,
  portfolio,
  agentId,
  state
) {
  // Create the prompt template
  const template = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a portfolio manager making final trading decisions based on multiple tickers.

      IMPORTANT: You are managing an existing portfolio with current positions. The portfolio_positions shows:
      - "long": number of shares currently held long
      - "short": number of shares currently held short
      - "long_cost_basis": average price paid for long shares
      - "short_cost_basis": average price received for short shares
      
      Trading Rules:
      - For long positions:
        * Only buy if you have available cash
        * Only sell if you currently hold long shares of that ticker
        * Sell quantity must be ≤ current long position shares
        * Buy quantity must be ≤ max_shares for that ticker
      
      - For short positions:
        * Only short if you have available margin (position value × margin requirement)
        * Only cover if you currently have short shares of that ticker
        * Cover quantity must be ≤ current short position shares
        * Short quantity must respect margin requirements
      
      - The max_shares values are pre-calculated to respect position limits
      - Consider both long and short opportunities based on signals
      - Maintain appropriate risk management with both long and short exposure

      Available Actions:
      - "buy": Open or add to long position
      - "sell": Close or reduce long position (only if you currently hold long shares)
      - "short": Open or add to short position
      - "cover": Close or reduce short position (only if you currently hold short shares)
      - "hold": Maintain current position without any changes (quantity should be 0 for hold)`,
    ],
    [
      "human",
      `Based on the team's analysis, make your trading decisions for each ticker.

      Here are the signals by ticker:
      {signals_by_ticker}

      Current Prices:
      {current_prices}

      Maximum Shares Allowed For Purchases:
      {max_shares}

      Portfolio Cash: {portfolio_cash}
      Current Positions: {portfolio_positions}
      Current Margin Requirement: {margin_requirement}
      Total Margin Used: {total_margin_used}

      IMPORTANT DECISION RULES:
      - If you currently hold LONG shares of a ticker (long > 0), you can:
        * HOLD: Keep your current position (quantity = 0)
        * SELL: Reduce/close your long position (quantity = shares to sell)
        * BUY: Add to your long position (quantity = additional shares to buy)
        
      - If you currently hold SHORT shares of a ticker (short > 0), you can:
        * HOLD: Keep your current position (quantity = 0)
        * COVER: Reduce/close your short position (quantity = shares to cover)
        * SHORT: Add to your short position (quantity = additional shares to short)
        
      - If you currently hold NO shares of a ticker (long = 0, short = 0), you can:
        * HOLD: Stay out of the position (quantity = 0)
        * BUY: Open a new long position (quantity = shares to buy)
        * SHORT: Open a new short position (quantity = shares to short)

      Output strictly in JSON with the following structure:
      {
        "decisions": {
          "TICKER1": {
            "action": "buy/sell/short/cover/hold",
            "quantity": integer,
            "confidence": float between 0 and 100,
            "reasoning": "string explaining your decision considering current position"
          },
          "TICKER2": {
            ...
          },
          ...
        }
      }`,
    ],
  ]);

  // Generate the prompt
  const promptData = {
    signals_by_ticker: JSON.stringify(signalsByTicker, null, 2),
    current_prices: JSON.stringify(currentPrices, null, 2),
    max_shares: JSON.stringify(maxShares, null, 2),
    portfolio_cash: portfolio.cash?.toFixed(2) || "0.00",
    portfolio_positions: JSON.stringify(portfolio.positions || {}, null, 2),
    margin_requirement: portfolio.margin_requirement?.toFixed(2) || "0.00",
    total_margin_used: portfolio.margin_used?.toFixed(2) || "0.00",
  };

  const prompt = template.format(promptData);

  // Create default decisions for each ticker
  const createDefaultPortfolioOutput = () => {
    const decisions = {};
    for (const ticker of tickers) {
      decisions[ticker] = {
        action: "hold",
        quantity: 0,
        confidence: 0.0,
        reasoning: "Default decision: hold",
      };
    }
    return { decisions };
  };

  return callLLM({
    prompt,
    expectedModelStructure: { decisions: "Object" },
    agentName: agentId,
    state,
    defaultFactory: createDefaultPortfolioOutput,
  });
}
