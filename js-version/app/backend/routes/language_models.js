/**
 * Routes for language model management
 */

import { Router } from "express";
import { ErrorResponse } from "../models/schemas.js";
import { OllamaService } from "../services/ollama_service.js";
import { getModelsList } from "../../src/llm/models.js";

const router = Router();
const ollamaService = new OllamaService();

/**
 * Get the list of available cloud-based and Ollama language models
 *
 * @route GET /language-models
 * @returns {Object} 200 - List of available language models
 * @returns {ErrorResponse} 500 - Internal server error
 */
router.get("/", async (req, res) => {
  try {
    // Start with cloud models
    const models = getModelsList();

    // Add available Ollama models (handles all checking internally)
    const ollamaModels = await ollamaService.getAvailableModels();
    models.push(...ollamaModels);

    return res.json({ models });
  } catch (err) {
    console.error("Failed to retrieve models:", err);
    return res.status(500).json({
      detail: `Failed to retrieve models: ${err.message}`,
    });
  }
});

/**
 * Get the list of available model providers with their models grouped
 *
 * @route GET /language-models/providers
 * @returns {Object} 200 - List of available model providers
 * @returns {ErrorResponse} 500 - Internal server error
 */
router.get("/providers", async (req, res) => {
  try {
    const models = getModelsList();

    // Group models by provider
    const providers = {};
    for (const model of models) {
      const providerName = model.provider;
      if (!providers[providerName]) {
        providers[providerName] = {
          name: providerName,
          models: [],
        };
      }
      providers[providerName].models.push(model);
    }

    // Add Ollama as a provider if available
    try {
      const ollamaModels = await ollamaService.getAvailableModels();
      if (ollamaModels.length > 0) {
        providers["ollama"] = {
          name: "Ollama",
          models: ollamaModels,
        };
      }
    } catch (ollamaErr) {
      console.warn("Ollama service not available:", ollamaErr.message);
    }

    return res.json({
      providers: Object.values(providers),
    });
  } catch (err) {
    console.error("Failed to retrieve model providers:", err);
    return res.status(500).json({
      detail: `Failed to retrieve model providers: ${err.message}`,
    });
  }
});

export default router;
