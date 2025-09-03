import dotenv from "dotenv";
import chalk from "chalk";
import { format } from "date-fns";
import fs from "fs/promises";

// Load environment variables from .env file
dotenv.config();

// Create a log function
async function log(message) {
  console.log(message);
  await fs
    .appendFile("llm-test-log.txt", message + "\n")
    .catch((err) => console.error("Error writing to log file:", err));
}

/**
 * Test LLM functionality
 */
async function testLLM() {
  try {
    await fs.writeFile("llm-test-log.txt", "Starting LLM test\n");

    // Import the models module
    const { ModelProvider, getModel } = await import("./src/llm/models.js");
    await log("Models module imported");

    // Check model providers
    await log(`Model providers: ${JSON.stringify(ModelProvider)}`);

    // Try to get a model with OLLAMA provider
    try {
      const model = await getModel("llama3.2", ModelProvider.OLLAMA);
      await log(`Successfully created model: ${model.constructor.name}`);

      // Try a simple invocation
      const messages = [
        {
          role: "user",
          content: "Hello, please respond with a simple greeting.",
        },
      ];

      await log("Attempting to invoke the model...");
      const response = await model.invoke(messages);

      await log(`Response received: ${JSON.stringify(response)}`);
      await log("LLM test completed successfully!");
    } catch (modelError) {
      await log(`Error creating or using model: ${modelError.message}`);
      await log(`Error stack: ${modelError.stack}`);
    }
  } catch (error) {
    await log(`Test error: ${error.message}`);
    await log(`Error stack: ${error.stack}`);
  }
}

// Run the test
testLLM().catch(console.error);
