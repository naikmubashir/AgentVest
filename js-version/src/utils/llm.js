/**
 * Helper functions for working with LLMs
 */

import { getModel, getModelInfo } from "../llm/models.js";
import { progress } from "./progress.js";

/**
 * Makes an LLM call with appropriate configuration
 *
 * @param {string} prompt - The prompt to send to the LLM
 * @param {string} modelName - Name of the model to use
 * @param {string} modelProvider - Provider of the model
 * @param {Object} options - Additional options for the LLM call
 * @returns {Promise<Object|string>} - The LLM response
 */
export async function callLLM(
  prompt,
  modelName = "gpt-4o",
  modelProvider = "OPENAI",
  options = {}
) {
  try {
    // Get the model
    const model = await getModel(modelName, modelProvider);
    if (!model) {
      throw new Error(
        `Model ${modelName} not available from provider ${modelProvider}`
      );
    }

    // Prepare the message
    const messages = [
      {
        role: "user",
        content: prompt,
      },
    ];

    // Invoke the model
    const response = await model.invoke(messages, options);

    return response;
  } catch (error) {
    console.error("Error calling LLM:", error);
    throw error;
  }
}

/**
 * Extract JSON from a text response
 *
 * @param {string} text - The text to extract JSON from
 * @returns {Object|null} - The extracted JSON object or null if extraction fails
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
 *
 * @param {Object} state - The current state
 * @param {string} agentName - The name of the agent
 * @returns {Object} - The model configuration
 */
export function getAgentModelConfig(state, agentName) {
  if (!state || !state.metadata || !state.metadata.request) {
    return { modelName: "gpt-4o", modelProvider: "OPENAI" };
  }

  const request = state.metadata.request;

  // Check if agent has a specific model assigned
  if (request.agentModels && request.agentModels[agentName]) {
    return {
      modelName: request.agentModels[agentName],
      modelProvider: request.modelProvider || "OPENAI",
    };
  }

  // Otherwise use the default model
  return {
    modelName: request.modelName || "gpt-4o",
    modelProvider: request.modelProvider || "OPENAI",
  };
}
