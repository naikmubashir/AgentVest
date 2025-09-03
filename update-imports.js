#!/usr/bin/env node

const fs = require("fs").promises;
const path = require("path");
const { exec } = require("child_process");

// Get the project root
const projectRoot = path.resolve(__dirname, "../js-version");

// Define import mappings
const importMappings = {
  'import { ChatPromptTemplate } from "langchain/prompts";':
    'import { ChatPromptTemplate } from "@langchain/core/prompts";',
  'import { HumanMessage } from "langchain/schema";':
    'import { HumanMessage } from "@langchain/core/messages";',
};

// Function to update imports in a file
async function updateImports(filePath) {
  try {
    // Read the file
    let content = await fs.readFile(filePath, "utf8");
    let modified = false;

    // Apply mappings
    for (const [oldImport, newImport] of Object.entries(importMappings)) {
      if (content.includes(oldImport)) {
        content = content.replace(
          new RegExp(oldImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          newImport
        );
        modified = true;
      }
    }

    // Save changes if modified
    if (modified) {
      await fs.writeFile(filePath, content, "utf8");
      console.log(`Updated imports in ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

// Function to recursively process all .js files
async function processDirectory(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules
      if (entry.name !== "node_modules") {
        await processDirectory(fullPath);
      }
    } else if (entry.name.endsWith(".js")) {
      await updateImports(fullPath);
    }
  }
}

// Main function
async function main() {
  // Update package.json to include new langchain packages
  const packageJsonPath = path.join(projectRoot, "package.json");
  let packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));

  // Add required packages if not already present
  packageJson.dependencies["@langchain/core"] = "^0.1.33";
  packageJson.dependencies["@langchain/openai"] = "^0.0.14";
  packageJson.dependencies["@langchain/community"] = "^0.0.29";

  // Write updated package.json
  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
    "utf8"
  );
  console.log("Updated package.json with new dependencies");

  // Process all JS files
  await processDirectory(projectRoot);

  // Install dependencies
  console.log("Installing dependencies...");
  exec("cd " + projectRoot + " && npm install", (error, stdout, stderr) => {
    if (error) {
      console.error(`Error installing dependencies: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.log("Dependencies installed successfully");
  });
}

main().catch(console.error);
