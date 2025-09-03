import dotenv from "dotenv";
import chalk from "chalk";
import { format } from "date-fns";
import fs from "fs/promises";

// Load environment variables from .env file
dotenv.config();

// Create a log function
async function log(message) {
  console.log(message);
  await fs
    .appendFile("app-log.txt", message + "\n")
    .catch((err) => console.error("Error writing to log file:", err));
}

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
 */
async function runHedgeFund(tickers, startDate, endDate) {
  await log(chalk.blue.bold("Starting AI Hedge Fund analysis..."));
  await log(chalk.yellow(`Analyzing: ${tickers.join(", ")}`));
  await log(chalk.yellow(`Time period: ${startDate} to ${endDate}`));

  // Initialize the state
  const state = {
    data: {
      tickers,
      start_date: startDate,
      end_date: endDate,
      portfolio: { cash: 1000000 },
      agent_signals: {},
    },
    metadata: {
      request: {
        showReasoning: false,
        modelName: "llama3.2",
        modelProvider: "OLLAMA",
        agentModels: {},
        selectedAgents: [],
        api_keys: {},
      },
    },
  };

  await log("State initialized");

  // Import required modules
  try {
    const { getAnalystNodes } = await import("./src/utils/analysts.js");
    const { riskManagementAgent } = await import(
      "./src/agents/risk_manager.js"
    );
    const { portfolioManagementAgent } = await import(
      "./src/agents/portfolio_manager.js"
    );
    const { ensureOllamaAndModel } = await import("./src/utils/ollama.js");

    await log("Modules imported successfully");

    // Check Ollama model
    const ollamaReady = await ensureOllamaAndModel("llama3.2", true);
    await log(`Ollama model check: ${ollamaReady}`);

    if (!ollamaReady) {
      throw new Error("Failed to ensure Ollama model is available");
    }

    // Get analyst nodes
    const analystNodes = getAnalystNodes(state.metadata.request.selectedAgents);
    await log(`Created ${analystNodes.length} analyst nodes`);

    // Execute the workflow
    let currentState = { ...state };

    // Execute all analyst agents
    for (const analystNode of analystNodes) {
      await log(`Running analyst node`);
      currentState = await analystNode(currentState);
    }

    // Execute risk management agent
    await log("Running risk management agent");
    currentState = await riskManagementAgent(currentState);

    // Execute portfolio management agent
    await log("Running portfolio management agent");
    currentState = await portfolioManagementAgent(currentState);

    await log("Analysis complete");
    return currentState;
  } catch (error) {
    await log(`Error in runHedgeFund: ${error.message}`);
    await log(`Error stack: ${error.stack}`);
    throw error;
  }
}

/**
 * Display trading output
 */
async function printTradingOutput(state) {
  const { data } = state;
  const { portfolio, agent_signals } = data;

  await log(chalk.green.bold("\n== Final Portfolio =="));
  await log(JSON.stringify(portfolio, null, 2));

  await log(chalk.green.bold("\n== Agent Signals =="));
  for (const [agent, signals] of Object.entries(agent_signals)) {
    await log(chalk.blue.bold(`\n${agent}:`));
    for (const [ticker, signal] of Object.entries(signals)) {
      let colorFn = chalk.yellow;
      if (signal.signal === "bullish") {
        colorFn = chalk.green;
      } else if (signal.signal === "bearish") {
        colorFn = chalk.red;
      }

      await log(
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
 * Main function
 */
async function main() {
  try {
    await fs.writeFile("app-log.txt", "Starting application\n");
    await log("Starting AI Hedge Fund with default values...");

    // Use default values without prompting
    const answers = {
      tickers: "AAPL,MSFT,GOOGL",
      startDate: format(
        new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        "yyyy-MM-dd"
      ),
      endDate: format(new Date(), "yyyy-MM-dd"),
    };

    await log(`Using tickers: ${answers.tickers}`);
    await log(`Date range: ${answers.startDate} to ${answers.endDate}`);

    // Parse tickers
    const tickers = answers.tickers
      .split(",")
      .map((ticker) => ticker.trim().toUpperCase());

    // Run the hedge fund
    await log("Starting runHedgeFund function...");
    try {
      const result = await runHedgeFund(
        tickers,
        answers.startDate,
        answers.endDate
      );

      // Print the results
      await printTradingOutput(result);
      await log("Analysis completed successfully.");
    } catch (runError) {
      await log(`Error running hedge fund: ${runError.message}`);
      await log(`Error stack: ${runError.stack}`);
    }
  } catch (error) {
    await log(`Main error: ${error.message}`);
    await log(`Main error stack: ${error.stack}`);
    console.error("Error:", error);
  }
}

// Run the main function
main();
