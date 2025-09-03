/**
 * Script to update progress imports across the codebase
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to src directory
const srcDir = path.join(__dirname, "src");

// Pattern to search for
const oldImport = `import progress from "../utils/progress.js";`;
const newImport = `import { progress } from "../utils/progress.js";`;

// Function to process a file
function processFile(filePath) {
  try {
    // Read the file
    const content = fs.readFileSync(filePath, "utf8");

    // Check if it contains the pattern
    if (content.includes(oldImport)) {
      // Replace the pattern
      const updatedContent = content.replace(oldImport, newImport);

      // Write the updated content back to the file
      fs.writeFileSync(filePath, updatedContent, "utf8");

      console.log(`Updated: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

// Function to recursively scan directories
function scanDirectory(dir) {
  let count = 0;

  // Get all files and directories in the current directory
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);

    if (stats.isDirectory()) {
      // Recursively scan subdirectories
      count += scanDirectory(itemPath);
    } else if (stats.isFile() && itemPath.endsWith(".js")) {
      // Process JavaScript files
      if (processFile(itemPath)) {
        count++;
      }
    }
  }

  return count;
}

// Main execution
console.log("Starting to update progress imports...");
const updatedCount = scanDirectory(srcDir);
console.log(`Completed! Updated ${updatedCount} files.`);
