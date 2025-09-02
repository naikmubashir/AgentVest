/**
 * Utilities for working with Ollama models in Docker environments
 */

import axios from "axios";
import chalk from "chalk";
import inquirer from "inquirer";

/**
 * Ensure the Ollama model is available in a Docker environment.
 * @param {string} modelName - The name of the model to check/download
 * @param {string} ollamaUrl - The URL of the Ollama service
 * @returns {Promise<boolean>} - True if model is available, false otherwise
 */
export async function ensureOllamaAndModel(modelName, ollamaUrl) {
  console.log(chalk.cyan("Docker environment detected."));

  // Step 1: Check if Ollama service is available
  if (!(await isOllamaAvailable(ollamaUrl))) {
    return false;
  }

  // Step 2: Check if model is already available
  const availableModels = await getAvailableModels(ollamaUrl);
  if (availableModels.includes(modelName)) {
    console.log(
      chalk.green(
        `Model ${modelName} is available in the Docker Ollama container.`
      )
    );
    return true;
  }

  // Step 3: Model not available - ask if user wants to download
  console.log(
    chalk.yellow(
      `Model ${modelName} is not available in the Docker Ollama container.`
    )
  );

  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "download",
      message: `Do you want to download ${modelName}?`,
      default: false,
    },
  ]);

  if (!answer.download) {
    console.log(chalk.red("Cannot proceed without the model."));
    return false;
  }

  // Step 4: Download the model
  return downloadModel(modelName, ollamaUrl);
}

/**
 * Check if Ollama service is available in Docker environment.
 * @param {string} ollamaUrl - The URL of the Ollama service
 * @returns {Promise<boolean>} - True if Ollama is available, false otherwise
 */
export async function isOllamaAvailable(ollamaUrl) {
  try {
    const response = await axios.get(`${ollamaUrl}/api/version`, {
      timeout: 5000,
    });
    if (response.status === 200) {
      return true;
    }

    console.log(chalk.red(`Cannot connect to Ollama service at ${ollamaUrl}.`));
    console.log(
      chalk.yellow(
        "Make sure the Ollama service is running in your Docker environment."
      )
    );
    return false;
  } catch (error) {
    console.log(
      chalk.red(`Error connecting to Ollama service: ${error.message}`)
    );
    return false;
  }
}

/**
 * Get list of available models in Docker environment.
 * @param {string} ollamaUrl - The URL of the Ollama service
 * @returns {Promise<string[]>} - Array of available model names
 */
export async function getAvailableModels(ollamaUrl) {
  try {
    const response = await axios.get(`${ollamaUrl}/api/tags`, {
      timeout: 5000,
    });
    if (response.status === 200) {
      const models = response.data.models || [];
      return models.map((m) => m.name);
    }

    console.log(
      chalk.red(
        `Failed to get available models from Ollama service. Status code: ${response.status}`
      )
    );
    return [];
  } catch (error) {
    console.log(chalk.red(`Error getting available models: ${error.message}`));
    return [];
  }
}

/**
 * Download a model in Docker environment.
 * @param {string} modelName - The name of the model to download
 * @param {string} ollamaUrl - The URL of the Ollama service
 * @returns {Promise<boolean>} - True if download succeeded, false otherwise
 */
export async function downloadModel(modelName, ollamaUrl) {
  console.log(
    chalk.yellow(
      `Downloading model ${modelName} to the Docker Ollama container...`
    )
  );
  console.log(chalk.cyan("This may take some time. Please be patient."));

  // Step 1: Initiate the download
  try {
    const response = await axios.post(
      `${ollamaUrl}/api/pull`,
      { name: modelName },
      { timeout: 10000 }
    );
    if (response.status !== 200) {
      console.log(
        chalk.red(
          `Failed to initiate model download. Status code: ${response.status}`
        )
      );
      if (response.data) {
        console.log(chalk.red(`Error: ${JSON.stringify(response.data)}`));
      }
      return false;
    }
  } catch (error) {
    console.log(
      chalk.red(`Error initiating download request: ${error.message}`)
    );
    return false;
  }

  // Step 2: Monitor the download progress
  console.log(
    chalk.cyan("Download initiated. Checking periodically for completion...")
  );

  let totalWaitTime = 0;
  const maxWaitTime = 1800; // 30 minutes max wait
  const checkInterval = 10; // Check every 10 seconds

  while (totalWaitTime < maxWaitTime) {
    // Check if the model has been downloaded
    const availableModels = await getAvailableModels(ollamaUrl);
    if (availableModels.includes(modelName)) {
      console.log(chalk.green(`Model ${modelName} downloaded successfully.`));
      return true;
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, checkInterval * 1000));
    totalWaitTime += checkInterval;

    // Print a status message every minute
    if (totalWaitTime % 60 === 0) {
      const minutes = Math.floor(totalWaitTime / 60);
      console.log(
        chalk.cyan(
          `Download in progress... (${minutes} minute${
            minutes !== 1 ? "s" : ""
          } elapsed)`
        )
      );
    }
  }

  // If we get here, we've timed out
  console.log(
    chalk.red(
      `Timed out waiting for model download to complete after ${Math.floor(
        maxWaitTime / 60
      )} minutes.`
    )
  );
  return false;
}

/**
 * Delete a model in Docker environment.
 * @param {string} modelName - The name of the model to delete
 * @param {string} ollamaUrl - The URL of the Ollama service
 * @returns {Promise<boolean>} - True if deletion succeeded, false otherwise
 */
export async function deleteModel(modelName, ollamaUrl) {
  console.log(
    chalk.yellow(`Deleting model ${modelName} from Docker container...`)
  );

  try {
    const response = await axios.delete(`${ollamaUrl}/api/delete`, {
      data: { name: modelName },
      timeout: 10000,
    });

    if (response.status === 200) {
      console.log(chalk.green(`Model ${modelName} deleted successfully.`));
      return true;
    } else {
      console.log(
        chalk.red(`Failed to delete model. Status code: ${response.status}`)
      );
      if (response.data) {
        console.log(chalk.red(`Error: ${JSON.stringify(response.data)}`));
      }
      return false;
    }
  } catch (error) {
    console.log(chalk.red(`Error deleting model: ${error.message}`));
    return false;
  }
}
