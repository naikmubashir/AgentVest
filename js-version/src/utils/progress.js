import chalk from "chalk";

/**
 * Progress tracking utility for agent operations
 */
export class ProgressTracker {
  constructor() {
    this.agentStatuses = new Map();
    this.handlers = [];
  }

  /**
   * Update the status of an agent for a specific ticker
   *
   * @param {string} agentName - Name of the agent
   * @param {string|null} ticker - Ticker symbol or null for general updates
   * @param {string} status - Status message
   * @param {Object|null} analysis - Optional analysis data
   */
  updateStatus(agentName, ticker, status, analysis = null) {
    const key = ticker ? `${agentName}:${ticker}` : agentName;
    const timestamp = new Date().toISOString();

    this.agentStatuses.set(key, { status, timestamp });
    this.printStatus(agentName, ticker, status);

    // Notify handlers
    for (const handler of this.handlers) {
      handler(agentName, ticker, status, analysis, timestamp);
    }
  }

  /**
   * Print a status update to the console
   *
   * @param {string} agentName - Name of the agent
   * @param {string|null} ticker - Ticker symbol or null for general updates
   * @param {string} status - Status message
   */
  printStatus(agentName, ticker, status) {
    const agentLabel = chalk.blue.bold(agentName);
    const tickerLabel = ticker ? chalk.yellow(ticker) : "";
    const separator = ticker ? " | " : "";

    console.log(`${agentLabel}${separator}${tickerLabel} ${status}`);
  }

  /**
   * Get the current status of an agent for a specific ticker
   *
   * @param {string} agentName - Name of the agent
   * @param {string|null} ticker - Ticker symbol or null for general status
   * @returns {Object|null} - Current status or null if not set
   */
  getStatus(agentName, ticker) {
    const key = ticker ? `${agentName}:${ticker}` : agentName;
    return this.agentStatuses.get(key) || null;
  }

  /**
   * Register a handler for status updates
   *
   * @param {Function} handler - Function to call on status updates
   */
  registerHandler(handler) {
    if (typeof handler === "function" && !this.handlers.includes(handler)) {
      this.handlers.push(handler);
    }
  }

  /**
   * Unregister a status update handler
   *
   * @param {Function} handler - Handler to remove
   */
  unregisterHandler(handler) {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * Clear all statuses
   */
  clearStatuses() {
    this.agentStatuses.clear();
  }
}

// Export a singleton instance
export const progress = new ProgressTracker();
