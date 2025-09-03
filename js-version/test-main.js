import dotenv from "dotenv";
import chalk from "chalk";
import fs from "fs/promises";
import { format } from "date-fns";

// Load environment variables from .env file
dotenv.config();

async function main() {
  try {
    console.log("Starting test");
    await fs.writeFile("main-test-log.txt", "Test started\n");

    console.log("Environment:");
    console.log(
      `- SELECTED_LLM_PROVIDER: ${process.env.SELECTED_LLM_PROVIDER}`
    );
    console.log(`- SELECTED_LLM_MODEL: ${process.env.SELECTED_LLM_MODEL}`);

    await fs.appendFile("main-test-log.txt", "Environment variables checked\n");

    console.log("Date check:");
    const startDate = format(
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      "yyyy-MM-dd"
    );
    const endDate = format(new Date(), "yyyy-MM-dd");
    console.log(`- Start date: ${startDate}`);
    console.log(`- End date: ${endDate}`);

    await fs.appendFile("main-test-log.txt", "Dates formatted\n");

    // Import check
    try {
      const { ensureOllamaAndModel } = await import("./src/utils/ollama.js");
      await fs.appendFile("main-test-log.txt", "Ollama module imported\n");

      // Test Ollama
      const ollamaResult = await ensureOllamaAndModel("llama3.2", true);
      await fs.appendFile(
        "main-test-log.txt",
        `Ollama check result: ${ollamaResult}\n`
      );
    } catch (importError) {
      await fs.appendFile(
        "main-test-log.txt",
        `Import error: ${importError.message}\n${importError.stack}\n`
      );
    }

    console.log("Test completed");
    await fs.appendFile("main-test-log.txt", "Test completed\n");
  } catch (error) {
    console.error("Error in test:", error);
    try {
      await fs.appendFile(
        "main-test-log.txt",
        `Error: ${error.message}\n${error.stack}\n`
      );
    } catch (writeError) {
      console.error("Error writing to log:", writeError);
    }
  }
}

main();
