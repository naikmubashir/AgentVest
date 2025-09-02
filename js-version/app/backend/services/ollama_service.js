import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default Ollama server URL
const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/**
 * Check if Ollama is installed and running
 * @returns {Promise<Object>} Status of Ollama
 */
export async function checkOllamaStatus() {
  const ollamaUrl = process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL;
  const status = {
    installed: false,
    running: false,
    server_url: ollamaUrl,
    available_models: [],
  };

  try {
    // Check if Ollama is installed
    try {
      await execAsync("which ollama");
      status.installed = true;
    } catch (error) {
      // Ollama is not installed
      return status;
    }

    // Check if Ollama is running
    try {
      const response = await axios.get(`${ollamaUrl}/api/tags`, {
        timeout: 3000,
      });

      status.running = true;

      // Get available models
      if (response.data && response.data.models) {
        status.available_models = response.data.models.map(
          (model) => model.name
        );
      }
    } catch (error) {
      // Ollama is not running or API call failed
      status.running = false;
    }

    return status;
  } catch (error) {
    console.error("Error checking Ollama status:", error);
    return status;
  }
}

/**
 * Start Ollama server
 * @returns {Promise<boolean>} Success status
 */
export async function startOllamaServer() {
  try {
    // Check if already running
    const status = await checkOllamaStatus();
    if (status.running) {
      return true;
    }

    // Start Ollama server
    const process = exec("ollama serve", (error, stdout, stderr) => {
      if (error) {
        console.error(`Error starting Ollama: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Ollama stderr: ${stderr}`);
      }
      console.log(`Ollama server output: ${stdout}`);
    });

    // Allow some time for server to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check if running
    const newStatus = await checkOllamaStatus();
    return newStatus.running;
  } catch (error) {
    console.error("Error starting Ollama server:", error);
    return false;
  }
}

/**
 * Pull an Ollama model
 * @param {string} modelName - Name of the model to pull
 * @returns {Promise<boolean>} Success status
 */
export async function pullOllamaModel(modelName) {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL;

    // Start pulling the model
    await axios.post(`${ollamaUrl}/api/pull`, {
      name: modelName,
    });

    // Since pulling is asynchronous, we'll just return true if the request was successful
    return true;
  } catch (error) {
    console.error(`Error pulling Ollama model ${modelName}:`, error);
    return false;
  }
}

/**
 * Get list of available Ollama models from models.json file
 * @returns {Promise<Array>} List of available models
 */
export async function getAvailableOllamaModels() {
  try {
    const modelFilePath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "src",
      "llm",
      "ollama_models.json"
    );
    const modelData = await fs.readFile(modelFilePath, "utf8");
    return JSON.parse(modelData);
  } catch (error) {
    console.error("Error reading Ollama models file:", error);
    return [];
  }
}

export default {
  checkOllamaStatus,
  startOllamaServer,
  pullOllamaModel,
  getAvailableOllamaModels,
};
