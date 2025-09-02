/**
 * State management for the agent system
 */

/**
 * Show agent reasoning if enabled
 * @param {Object} state - The current state
 * @param {string} agentName - Name of the agent
 * @param {string} reasoning - The reasoning to display
 */
export function showAgentReasoning(state, agentName, reasoning) {
  const shouldShowReasoning = state?.metadata?.request?.showReasoning || false;

  if (shouldShowReasoning) {
    console.log(`\n${agentName} reasoning:`);
    console.log(reasoning);
    console.log("\n");
  }
}

/**
 * Define the AgentState schema equivalent
 * In JavaScript we don't have strict typing like Python's Pydantic,
 * but we can document the expected shape
 *
 * AgentState = {
 *   data: {
 *     tickers: string[],
 *     start_date: string,
 *     end_date: string,
 *     portfolio: Object,
 *     agent_signals: Object,
 *     // ...other data fields
 *   },
 *   metadata: {
 *     request: {
 *       showReasoning: boolean,
 *       api_keys: Object,
 *       // ...other metadata
 *     }
 *   }
 * }
 */

// Constant to mark the end of a workflow
export const END = "end";
