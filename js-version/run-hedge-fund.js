import dotenv from "dotenv";
import chalk from "chalk";
import { format } from "date-fns";
import fs from "fs/promises";

// Load environment variables from .env file
dotenv.config();

// Set environment variables for mock data
process.env.USE_MOCK_DATA = "true";
process.env.USE_MOCK_RESPONSES = "true";

// Create a log function
async function log(message) {
  console.log(message);
  await fs
    .appendFile("app-run-log.txt", message + "\n")
    .catch((err) => console.error("Error writing to log file:", err));
}

// Import actual main file functionality
async function main() {
  try {
    await fs.writeFile("app-run-log.txt", "Starting AI Hedge Fund\n");

    await log("Importing modules...");
    const { runHedgeFund, printTradingOutput } = await import("./src/main.js");
    await log("Modules imported successfully");

    // Default parameters
    const tickers = ["AAPL", "MSFT", "GOOGL"];
    const startDate = format(
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      "yyyy-MM-dd"
    );
    const endDate = format(new Date(), "yyyy-MM-dd");
    const portfolio = { cash: 1000000 };

    await log(
      `Running analysis for ${tickers.join(
        ", "
      )} from ${startDate} to ${endDate}`
    );

    // Run the hedge fund
    const result = await runHedgeFund(
      tickers,
      startDate,
      endDate,
      portfolio,
      false, // showReasoning
      "llama3.2", // modelName
      "OLLAMA", // modelProvider
      {}, // agentModels
      [], // selectedAgents
      {} // apiKeys
    );

    // Print the results
    await log("Analysis complete, printing results:");

    console.log(chalk.green.bold("\n== Final Portfolio =="));
    console.log(JSON.stringify(result.data.portfolio, null, 2));

    console.log(chalk.green.bold("\n== Agent Signals =="));
    for (const [agent, signals] of Object.entries(result.data.agent_signals)) {
      console.log(chalk.blue.bold(`\n${agent}:`));
      for (const [ticker, signal] of Object.entries(signals)) {
        let colorFn = chalk.yellow;
        if (signal.signal === "bullish") {
          colorFn = chalk.green;
        } else if (signal.signal === "bearish") {
          colorFn = chalk.red;
        }

        console.log(
          colorFn(
            `${ticker}: ${signal.signal.toUpperCase()} (${Math.round(
              signal.confidence * 100
            )}% confidence)`
          )
        );
      }
    }

    await log("AI Hedge Fund run completed successfully");
  } catch (error) {
    await log(`Error in main: ${error.message}`);
    await log(`Error stack: ${error.stack}`);
    console.error("Error:", error);
  }
}

// Run the main function
main().catch(console.error);
