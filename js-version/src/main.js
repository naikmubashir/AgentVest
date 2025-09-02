import dotenv from "dotenv";
import chalk from "chalk";
import inquirer from "inquirer";
import { format } from "date-fns";

import { warrenBuffettAgent } from "./agents/warren_buffett.js";
import { portfolioManagementAgent } from "./agents/portfolio_manager.js";
import { riskManagementAgent } from "./agents/risk_manager.js";
import { getAnalystNodes } from "./utils/analysts.js";
import progress from "./utils/progress.js";
import { LLM_ORDER, OLLAMA_LLM_ORDER, getModelInfo } from "./llm/models.js";
import { ensureOllamaAndModel } from "./utils/ollama.js";
import { saveGraphAsPng } from "./utils/visualize.js";

// Load environment variables from .env file
dotenv.config();

/**
 * Parse a JSON string and return a JavaScript object
 *
 * @param {string} response - The JSON string to parse
 * @returns {Object|null} - The parsed object or null if parsing fails
 */
function parseHedgeFundResponse(response) {
  try {
    return JSON.parse(response);
  } catch (error) {
    console.error(
      `JSON decoding error: ${error}\nResponse: ${JSON.stringify(response)}`
    );
    return null;
  }
}

/**
 * Run the hedge fund simulation
 *
 * @param {Array<string>} tickers - Stock ticker symbols
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Object} portfolio - Initial portfolio
 * @param {boolean} showReasoning - Whether to show agent reasoning
 * @param {string} modelName - The name of the LLM model to use
 * @param {string} modelProvider - The provider of the LLM model
 * @param {Object} agentModels - Custom models for specific agents
 * @param {Array<string>} selectedAgents - Which agents to use in the analysis
 * @param {Object} apiKeys - API keys for external services
 * @returns {Promise<Object>} - The final portfolio state and analysis
 */
export async function runHedgeFund(
  tickers,
  startDate,
  endDate,
  portfolio = {},
  showReasoning = false,
  modelName = "gpt-4o",
  modelProvider = "OPENAI",
  agentModels = {},
  selectedAgents = null,
  apiKeys = null
) {
  console.log(chalk.blue.bold("Starting AI Hedge Fund analysis..."));
  console.log(chalk.yellow(`Analyzing: ${tickers.join(", ")}`));
  console.log(chalk.yellow(`Time period: ${startDate} to ${endDate}`));

  // Initialize the state
  const state = {
    data: {
      tickers,
      start_date: startDate,
      end_date: endDate,
      portfolio: portfolio || {},
      agent_signals: {},
    },
    metadata: {
      request: {
        showReasoning,
        modelName,
        modelProvider,
        agentModels: agentModels || {},
        selectedAgents: selectedAgents || [],
        api_keys: apiKeys || {},
      },
    },
  };

  // Build workflow graph
  const graph = buildGraph(state);

  // Execute the workflow
  const result = await graph.execute(state);

  // Return the final state
  return result;
}

/**
 * Build the agent workflow graph
 *
 * @param {Object} state - The initial state
 * @returns {Object} - The workflow graph
 */
function buildGraph(state) {
  // Create analyst nodes
  const analystNodes = getAnalystNodes(state.metadata.request.selectedAgents);

  // Build the graph
  // This is a simplified version without the actual graph library
  // In a real implementation, we would use a graph library or define a custom graph structure

  // For now, we'll just define a sequential execution function
  const executeGraph = async (initialState) => {
    let currentState = { ...initialState };

    // Execute all analyst agents
    for (const analystNode of analystNodes) {
      currentState = await analystNode(currentState);
    }

    // Execute risk management agent
    currentState = await riskManagementAgent(currentState);

    // Execute portfolio management agent
    currentState = await portfolioManagementAgent(currentState);

    return currentState;
  };

  return { execute: executeGraph };
}

/**
 * Display trading output
 *
 * @param {Object} state - The final state after trading
 */
function printTradingOutput(state) {
  const { data } = state;
  const { portfolio, agent_signals } = data;

  console.log(chalk.green.bold("\n== Final Portfolio =="));
  console.log(JSON.stringify(portfolio, null, 2));

  console.log(chalk.green.bold("\n== Agent Signals =="));
  for (const [agent, signals] of Object.entries(agent_signals)) {
    console.log(chalk.blue.bold(`\n${agent}:`));
    for (const [ticker, signal] of Object.entries(signals)) {
      const colorFn =
        signal.signal === "bullish"
          ? chalk.green
          : signal.signal === "bearish"
          ? chalk.red
          : chalk.yellow;

      console.log(
        colorFn(
          `${ticker}: ${signal.signal.toUpperCase()} (${Math.round(
            signal.confidence * 100
          )}% confidence)`
        )
      );
    }
  }
}

/**
 * Main function to run the CLI
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
        type: "confirm",
        name: "showReasoning",
        message: "Show agent reasoning?",
        default: false,
      },
    ]);

    // Parse tickers
    const tickers = answers.tickers
      .split(",")
      .map((ticker) => ticker.trim().toUpperCase());

    // Run the hedge fund
    const result = await runHedgeFund(
      tickers,
      answers.startDate,
      answers.endDate,
      { cash: 1000000 },
      answers.showReasoning
    );

    // Print the results
    printTradingOutput(result);
  } catch (error) {
    console.error("Error running hedge fund:", error);
  }
}

// Run the main function if this file is executed directly
if (process.argv[1] === import.meta.url) {
  main();
}

export { parseHedgeFundResponse, printTradingOutput };
