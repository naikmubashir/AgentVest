/**
 * Helper functions for working with LLMs
 */

/**
 * Makes an LLM call with appropriate configuration - always returns a mock response
 */
export async function callLLM(
  prompt,
  responseSchema,
  agentId,
  state,
  options = {}
) {
  console.log(`Using mock response for ${agentId}`);

  // Basic mock response structure
  let mockResponse = {
    signal: Math.random() > 0.3 ? "bullish" : "bearish",
    confidence: Math.random() * 0.5 + 0.5, // 0.5 to 1.0
    reasoning: `Mock reasoning for ${agentId}: Based on the available financial data, I'm ${
      Math.random() > 0.3 ? "optimistic" : "cautious"
    } about this stock.`,
    key_factors: [
      "Mock factor 1: Strong financial position",
      "Mock factor 2: Competitive advantages",
      "Mock factor 3: Future growth prospects",
    ],
  };

  // Add specific fields for different agents
  if (agentId === "aswath_damodaran_agent") {
    mockResponse.valuation = 200 + Math.random() * 100; // Random valuation between 200-300
    mockResponse.upside = -0.2 + Math.random() * 0.4; // Random upside between -20% and +20%
  }

  return mockResponse;
}

/**
 * Extract JSON from a text response
 */
export function extractJsonFromResponse(text) {
  try {
    // Try to find JSON in the response using regex patterns
    const jsonPattern =
      /```json\s*([\s\S]*?)\s*```|```\s*([\s\S]*?)\s*```|\{[\s\S]*\}/;
    const match = text.match(jsonPattern);

    if (match) {
      const jsonString = match[1] || match[2] || match[0];
      return JSON.parse(jsonString);
    }

    // If we couldn't find it with regex, try parsing the whole text
    return JSON.parse(text);
  } catch (error) {
    console.error("Error extracting JSON from LLM response:", error);
    return null;
  }
}

/**
 * Get model configuration for an agent from the state
 */
export function getAgentModelConfig(state, agentName) {
  return { modelName: "gpt-4o", modelProvider: "OPENAI" };
}
