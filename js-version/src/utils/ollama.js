/**
 * Utilities for working with Ollama models
 */
import { execSync, spawn } from "child_process";
import axios from "axios";
import os from "os";
import chalk from "chalk";
import inquirer from "inquirer";

// Constants
const OLLAMA_SERVER_URL = "http://localhost:11434";
const OLLAMA_API_MODELS_ENDPOINT = `${OLLAMA_SERVER_URL}/api/tags`;
const OLLAMA_DOWNLOAD_URL = {
  darwin: "https://ollama.com/download/darwin",
  win32: "https://ollama.com/download/windows",
  linux: "https://ollama.com/download/linux",
};

/**
 * Check if Ollama is installed on the system
 *
 * @returns {boolean} True if Ollama is installed
 */
export function isOllamaInstalled() {
  const platform = os.platform();

  try {
    if (platform === "darwin" || platform === "linux") {
      // macOS or Linux
      execSync("which ollama");
      return true;
    } else if (platform === "win32") {
      // Windows
      execSync("where ollama", { shell: true });
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check if the Ollama server is running
 *
 * @returns {Promise<boolean>} True if the server is running
 */
export async function isOllamaServerRunning() {
  try {
    const response = await axios.get(OLLAMA_API_MODELS_ENDPOINT, {
      timeout: 2000,
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Get a list of models that are already downloaded locally
 *
 * @returns {Promise<string[]>} List of available models
 */
export async function getLocallyAvailableModels() {
  if (!(await isOllamaServerRunning())) {
    return [];
  }

  try {
    const response = await axios.get(OLLAMA_API_MODELS_ENDPOINT, {
      timeout: 5000,
    });
    if (response.status === 200 && response.data.models) {
      return response.data.models.map((model) => model.name);
    }
    return [];
  } catch (error) {
    return [];
  }
}

/**
 * Start the Ollama server if it's not already running
 *
 * @returns {Promise<boolean>} True if server started successfully
 */
export async function startOllamaServer() {
  if (await isOllamaServerRunning()) {
    console.log(chalk.green("Ollama server is already running."));
    return true;
  }

  const platform = os.platform();

  try {
    let ollamaProcess;

    if (platform === "darwin" || platform === "linux") {
      ollamaProcess = spawn("ollama", ["serve"], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
    } else if (platform === "win32") {
      ollamaProcess = spawn("ollama", ["serve"], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        detached: true,
      });
    } else {
      console.log(chalk.red(`Unsupported operating system: ${platform}`));
      return false;
    }

    // Unref the child process so it can run independently
    ollamaProcess.unref();

    // Wait for server to start
    for (let i = 0; i < 10; i++) {
      if (await isOllamaServerRunning()) {
        console.log(chalk.green("Ollama server started successfully."));
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      chalk.red(
        "Failed to start Ollama server. Timed out waiting for server to become available."
      )
    );
    return false;
  } catch (error) {
    console.log(chalk.red(`Error starting Ollama server: ${error.message}`));
    return false;
  }
}

/**
 * Download an Ollama model
 *
 * @param {string} modelName - Name of the model to download
 * @returns {Promise<boolean>} True if model downloaded successfully
 */
export async function downloadModel(modelName) {
  if (!(await isOllamaServerRunning())) {
    if (!(await startOllamaServer())) {
      return false;
    }
  }

  console.log(chalk.yellow(`Downloading model ${modelName}...`));
  console.log(
    chalk.cyan(
      "This may take a while depending on your internet speed and the model size."
    )
  );
  console.log(
    chalk.cyan(
      "The download is happening in the background. Please be patient..."
    )
  );

  return new Promise((resolve) => {
    const process = spawn("ollama", ["pull", modelName], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // For tracking progress
    let lastPercentage = 0;
    let lastPhase = "";
    const barLength = 40;

    process.stdout.on("data", (data) => {
      const output = data.toString().trim();
      let percentage = null;
      let currentPhase = null;

      // Check for percentage in the output
      const percentageMatch = output.match(/(\d+(\.\d+)?)%/);
      if (percentageMatch) {
        try {
          percentage = parseFloat(percentageMatch[1]);
        } catch (error) {
          percentage = null;
        }
      }

      // Try to determine the current phase
      const phaseMatch = output.match(/^([a-zA-Z\s]+):/);
      if (phaseMatch) {
        currentPhase = phaseMatch[1].trim();
      }

      // If we found a percentage, display a progress bar
      if (percentage !== null) {
        // Only update if there's a significant change
        if (
          Math.abs(percentage - lastPercentage) >= 1 ||
          (currentPhase && currentPhase !== lastPhase)
        ) {
          lastPercentage = percentage;
          if (currentPhase) {
            lastPhase = currentPhase;
          }

          // Create a progress bar
          const filledLength = Math.floor((barLength * percentage) / 100);
          const bar =
            "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

          // Build the status line with the phase if available
          const phaseDisplay = lastPhase
            ? chalk.cyan(
                `${lastPhase.charAt(0).toUpperCase() + lastPhase.slice(1)}: `
              )
            : "";
          const statusLine = `\r${phaseDisplay}${chalk.green(
            bar
          )} ${chalk.yellow(percentage.toFixed(1) + "%")}`;

          // Print the status line without a newline to update in place
          process.stdout.write(statusLine);
        }
      } else {
        // If we couldn't extract a percentage but have identifiable output
        if (
          output.toLowerCase().includes("download") ||
          output.toLowerCase().includes("extract") ||
          output.toLowerCase().includes("pulling")
        ) {
          if (output.includes("%")) {
            process.stdout.write(`\r${chalk.green(output)}`);
          } else {
            console.log(chalk.green(output));
          }
        }
      }
    });

    process.stderr.on("data", (data) => {
      console.error(chalk.red(data.toString()));
    });

    process.on("close", (code) => {
      // Ensure we print a newline after the progress bar
      console.log();

      if (code === 0) {
        console.log(chalk.green(`Model ${modelName} downloaded successfully!`));
        resolve(true);
      } else {
        console.log(
          chalk.red(
            `Failed to download model ${modelName}. Check your internet connection and try again.`
          )
        );
        resolve(false);
      }
    });
  });
}

/**
 * Ensure Ollama is installed, running, and the requested model is available
 *
 * @param {string} modelName - Name of the model to check
 * @returns {Promise<boolean>} True if everything is ready
 */
export async function ensureOllamaAndModel(modelName) {
  // Check if we're running in Docker
  const inDocker =
    process.env.OLLAMA_BASE_URL &&
    (process.env.OLLAMA_BASE_URL.startsWith("http://ollama:") ||
      process.env.OLLAMA_BASE_URL.startsWith("http://host.docker.internal:"));

  // In Docker environment, we need a different approach
  if (inDocker) {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
    return await ensureOllamaAndModelDocker(modelName, ollamaUrl);
  }

  // Regular flow for non-Docker environments
  // Check if Ollama is installed
  if (!isOllamaInstalled()) {
    console.log(chalk.yellow("Ollama is not installed on your system."));

    // Ask if they want to install it
    const { installOllama } = await inquirer.prompt([
      {
        type: "confirm",
        name: "installOllama",
        message: "Do you want to install Ollama?",
        default: true,
      },
    ]);

    if (installOllama) {
      // Open browser to download page since we can't easily install automatically in JS
      console.log(
        chalk.yellow(
          `Please download Ollama from: ${
            OLLAMA_DOWNLOAD_URL[os.platform()] || "https://ollama.com/download"
          }`
        )
      );
      console.log(
        chalk.yellow("After installing, please run this program again.")
      );
      return false;
    } else {
      console.log(chalk.red("Ollama is required to use local models."));
      return false;
    }
  }

  // Make sure the server is running
  if (!(await isOllamaServerRunning())) {
    console.log(chalk.yellow("Starting Ollama server..."));
    if (!(await startOllamaServer())) {
      return false;
    }
  }

  // Check if the model is already downloaded
  const availableModels = await getLocallyAvailableModels();
  if (!availableModels.includes(modelName)) {
    console.log(chalk.yellow(`Model ${modelName} is not available locally.`));

    // Ask if they want to download it
    let modelSizeInfo = "";
    if (modelName.includes("70b")) {
      modelSizeInfo =
        " This is a large model (up to several GB) and may take a while to download.";
    } else if (modelName.includes("34b") || modelName.includes("8x7b")) {
      modelSizeInfo =
        " This is a medium-sized model (1-2 GB) and may take a few minutes to download.";
    }

    const { downloadModelConfirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "downloadModelConfirm",
        message: `Do you want to download the ${modelName} model?${modelSizeInfo} The download will happen in the background.`,
        default: true,
      },
    ]);

    if (downloadModelConfirm) {
      return await downloadModel(modelName);
    } else {
      console.log(chalk.red("The model is required to proceed."));
      return false;
    }
  }

  return true;
}

/**
 * Delete a locally downloaded Ollama model
 *
 * @param {string} modelName - Name of the model to delete
 * @returns {Promise<boolean>} True if model deleted successfully
 */
export async function deleteModel(modelName) {
  // Check if we're running in Docker
  const inDocker =
    process.env.OLLAMA_BASE_URL &&
    (process.env.OLLAMA_BASE_URL.startsWith("http://ollama:") ||
      process.env.OLLAMA_BASE_URL.startsWith("http://host.docker.internal:"));

  // In Docker environment, delegate to Docker functions
  if (inDocker) {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://ollama:11434";
    return await deleteModelDocker(modelName, ollamaUrl);
  }

  // Non-Docker environment
  if (!(await isOllamaServerRunning())) {
    if (!(await startOllamaServer())) {
      return false;
    }
  }

  console.log(chalk.yellow(`Deleting model ${modelName}...`));

  try {
    // Use the Ollama CLI to delete the model
    execSync(`ollama rm ${modelName}`, { stdio: "pipe" });
    console.log(chalk.green(`Model ${modelName} deleted successfully.`));
    return true;
  } catch (error) {
    console.log(
      chalk.red(`Failed to delete model ${modelName}. Error: ${error.message}`)
    );
    return false;
  }
}

/**
 * Docker-specific implementation of ensureOllamaAndModel
 * @private
 */
async function ensureOllamaAndModelDocker(modelName, ollamaUrl) {
  // Check if the Ollama service is accessible
  try {
    const response = await axios.get(`${ollamaUrl}/api/tags`, {
      timeout: 5000,
    });

    if (response.status === 200) {
      // Check if the model is available
      const availableModels =
        response.data.models?.map((model) => model.name) || [];

      if (!availableModels.includes(modelName)) {
        console.log(
          chalk.yellow(
            `Model ${modelName} is not available in the Docker container.`
          )
        );
        console.log(
          chalk.yellow(`Pulling model ${modelName} in the Docker container...`)
        );

        try {
          // Pull the model via API
          await axios.post(`${ollamaUrl}/api/pull`, { name: modelName });
          console.log(
            chalk.green(`Model ${modelName} pulled successfully in Docker.`)
          );
          return true;
        } catch (error) {
          console.log(
            chalk.red(
              `Failed to pull model ${modelName} in Docker: ${error.message}`
            )
          );
          return false;
        }
      }

      return true;
    } else {
      console.log(
        chalk.red(
          `Ollama service at ${ollamaUrl} returned unexpected status: ${response.status}`
        )
      );
      return false;
    }
  } catch (error) {
    console.log(
      chalk.red(
        `Cannot connect to Ollama service at ${ollamaUrl}: ${error.message}`
      )
    );
    console.log(
      chalk.yellow("Make sure the Ollama container is running and accessible.")
    );
    return false;
  }
}

/**
 * Docker-specific implementation of deleteModel
 * @private
 */
async function deleteModelDocker(modelName, ollamaUrl) {
  try {
    await axios.delete(`${ollamaUrl}/api/delete`, {
      data: { name: modelName },
    });
    console.log(
      chalk.green(`Model ${modelName} deleted successfully in Docker.`)
    );
    return true;
  } catch (error) {
    console.log(
      chalk.red(
        `Failed to delete model ${modelName} in Docker: ${error.message}`
      )
    );
    return false;
  }
}
