import express from "express";
import ollamaService from "../services/ollama_service.js";

const router = express.Router();

/**
 * @route GET /api/ollama/status
 * @description Check Ollama status
 * @access Public
 */
router.get("/status", async (req, res) => {
  try {
    const status = await ollamaService.checkOllamaStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: "Failed to check Ollama status",
      details: error.message,
    });
  }
});

/**
 * @route POST /api/ollama/start
 * @description Start Ollama server
 * @access Public
 */
router.post("/start", async (req, res) => {
  try {
    const result = await ollamaService.startOllamaServer();
    if (result) {
      res.json({
        success: true,
        message: "Ollama server started successfully",
      });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to start Ollama server" });
    }
  } catch (error) {
    res.status(500).json({
      error: "Failed to start Ollama server",
      details: error.message,
    });
  }
});

/**
 * @route POST /api/ollama/pull
 * @description Pull an Ollama model
 * @access Public
 */
router.post("/pull", async (req, res) => {
  try {
    const { modelName } = req.body;

    if (!modelName) {
      return res.status(400).json({ error: "Model name is required" });
    }

    const result = await ollamaService.pullOllamaModel(modelName);

    if (result) {
      res.json({
        success: true,
        message: `Started pulling model: ${modelName}. This may take several minutes.`,
      });
    } else {
      res.status(500).json({
        success: false,
        message: `Failed to pull model: ${modelName}`,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: "Failed to pull Ollama model",
      details: error.message,
    });
  }
});

/**
 * @route GET /api/ollama/models
 * @description Get available Ollama models
 * @access Public
 */
router.get("/models", async (req, res) => {
  try {
    const models = await ollamaService.getAvailableOllamaModels();
    res.json(models);
  } catch (error) {
    res.status(500).json({
      error: "Failed to get available Ollama models",
      details: error.message,
    });
  }
});

export default router;
