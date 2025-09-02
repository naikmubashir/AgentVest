/**
 * Helper functions for working with API keys
 */

/**
 * Get an API key from the state
 *
 * @param {Object} state - The current state
 * @param {string} keyName - The name of the API key to retrieve
 * @returns {string|null} - The API key or null if not found
 */
export function getApiKeyFromState(state, keyName) {
  // Check if state contains API keys
  if (
    !state ||
    !state.metadata ||
    !state.metadata.request ||
    !state.metadata.request.api_keys
  ) {
    return process.env[keyName] || null;
  }

  // Return the API key from state or environment variables
  return (
    state.metadata.request.api_keys[keyName] || process.env[keyName] || null
  );
}
