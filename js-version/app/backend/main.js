import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import winston from "winston";

import { initializeDatabase, syncModels } from "./database/models.js";
import { checkOllamaStatus } from "./services/ollama_service.js";
import apiRouter from "./routes/index.js";

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
await initializeDatabase();
await syncModels();

// Configure middleware
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

// Include all routes
app.use("/api", apiRouter);

// Start the server
app.listen(PORT, async () => {
  logger.info(`AI Hedge Fund API running on port ${PORT}`);

  // Check Ollama availability
  try {
    logger.info("Checking Ollama availability...");
    const status = await checkOllamaStatus();

    if (status.installed) {
      if (status.running) {
        logger.info(
          `✓ Ollama is installed and running at ${status.server_url}`
        );
        if (status.available_models.length > 0) {
          logger.info(
            `✓ Available models: ${status.available_models.join(", ")}`
          );
        } else {
          logger.info("ℹ No models are currently downloaded");
        }
      } else {
        logger.info("ℹ Ollama is installed but not running");
        logger.info(
          "ℹ You can start it from the Settings page or manually with 'ollama serve'"
        );
      }
    } else {
      logger.info("ℹ Ollama is not installed. Install it to use local models.");
    }
  } catch (error) {
    logger.error(`Error checking Ollama status: ${error.message}`);
  }
});

export default app;
