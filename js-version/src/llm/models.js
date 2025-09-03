import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define model providers as constants
export const ModelProvider = {
  OPENAI: "OPENAI",
  OLLAMA: "OLLAMA",
};

// LLM order preferences
export const LLM_ORDER = ["gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"];

export const OLLAMA_LLM_ORDER = [
  "llama3",
  "llama3:8b",
  "llama2",
  "mistral",
  "mixtral",
];

/**
 * Model information class
 */
class ModelInfo {
  constructor(name, provider, hasJsonMode, needsApiKey) {
    this.name = name;
    this.provider = provider;
    this.hasJsonMode = hasJsonMode;
    this.needsApiKey = needsApiKey;
  }
}

/**
 * Get model information
 *
 * @param {string} modelName - The name of the model
 * @param {string} provider - The provider of the model
 * @returns {ModelInfo|null} - Model information or null if not found
 */
export async function getModelInfo(modelName, provider) {
  try {
    let modelsData;

    if (provider === ModelProvider.OPENAI) {
      const apiModelsPath = path.join(__dirname, "api_models.json");
      const data = await fs.readFile(apiModelsPath, "utf8");
      modelsData = JSON.parse(data);
    } else if (provider === ModelProvider.OLLAMA) {
      const ollamaModelsPath = path.join(__dirname, "ollama_models.json");
      const data = await fs.readFile(ollamaModelsPath, "utf8");
      modelsData = JSON.parse(data);
    } else {
      return null;
    }

    const modelData = modelsData.find((model) => model.name === modelName);

    if (!modelData) {
      return null;
    }

    return new ModelInfo(
      modelData.name,
      provider,
      modelData.has_json_mode || false,
      modelData.needs_api_key || false
    );
  } catch (error) {
    console.error("Error getting model info:", error);
    return null;
  }
}

/**
 * Get a model instance
 *
 * @param {string} modelName - The name of the model
 * @param {string} provider - The provider of the model
 * @param {Object} apiKeys - API keys for the model providers
 * @returns {ChatOpenAI|OllamaChat} - The model instance
 */
export function getModel(modelName, provider, apiKeys = null) {
  if (provider === ModelProvider.OPENAI) {
    const apiKey = apiKeys?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }

    return new ChatOpenAI({
      modelName: modelName,
      temperature: 0,
      apiKey: apiKey,
    });
  } else if (provider === ModelProvider.OLLAMA) {
    const ollamaBaseUrl = process.env.OLLAMA_URL || "http://localhost:11434";

    return new ChatOllama({
      baseUrl: ollamaBaseUrl,
      model: modelName,
      temperature: 0,
    });
  } else {
    throw new Error(`Unsupported model provider: ${provider}`);
  }
}
