/**
 * Utilities for displaying output
 */
import chalk from "chalk";

/**
 * Print the trading output in a formatted way
 *
 * @param {Object} state - The final state after trading
 */
export function printTradingOutput(state) {
  const { data } = state;
  const { portfolio, agent_signals } = data;

  console.log(chalk.green.bold("\n== Final Portfolio =="));
  console.log(JSON.stringify(portfolio, null, 2));

  console.log(chalk.green.bold("\n== Agent Signals =="));

  for (const [agentId, signals] of Object.entries(agent_signals)) {
    console.log(chalk.blue.bold(`\n${formatAgentName(agentId)}:`));

    for (const [ticker, signal] of Object.entries(signals)) {
      let signalColor;
      if (signal.signal === "bullish") {
        signalColor = chalk.green;
      } else if (signal.signal === "bearish") {
        signalColor = chalk.red;
      } else {
        signalColor = chalk.yellow;
      }

      console.log(
        signalColor(
          `${ticker}: ${signal.signal.toUpperCase()} (${Math.round(
            signal.confidence * 100
          )}% confidence)`
        )
      );
    }
  }
}

/**
 * Format an agent ID into a display name
 *
 * @param {string} agentId - The agent ID
 * @returns {string} - The formatted agent name
 */
function formatAgentName(agentId) {
  // Replace underscores with spaces and capitalize each word
  return agentId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
