import dotenv from "dotenv";
import chalk from "chalk";
import { format } from "date-fns";
import fs from "fs/promises";

// Load environment variables from .env file
dotenv.config();

async function main() {
  const output = [];
  output.push(chalk.blue.bold("Starting AI Hedge Fund analysis..."));
  output.push(chalk.yellow(`Current environment settings:`));
  output.push(`SELECTED_LLM_PROVIDER: ${process.env.SELECTED_LLM_PROVIDER}`);
  output.push(`SELECTED_LLM_MODEL: ${process.env.SELECTED_LLM_MODEL}`);
  output.push(`Current date: ${format(new Date(), "yyyy-MM-dd")}`);

  output.push(chalk.green("\nDone!"));

  // Write to console
  output.forEach((line) => console.log(line));

  // Also write to a file
  await fs.writeFile("debug-output.txt", output.join("\n"));
}

main().catch((error) => {
  console.error("Error:", error);
  fs.writeFile("debug-error.txt", String(error)).catch(() => {});
});
