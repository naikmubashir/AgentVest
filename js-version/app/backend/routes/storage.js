/**
 * Routes for storage functionality
 */

import { Router } from "express";
import fs from "fs";
import path from "path";
import { ErrorResponse } from "../models/schemas.js";

const router = Router();

/**
 * Save JSON data to the project's /outputs directory
 *
 * @route POST /storage/save-json
 * @param {Object} request.body.filename - The name of the file to save
 * @param {Object} request.body.data - The JSON data to save
 * @returns {Object} 200 - File saved successfully
 * @returns {ErrorResponse} 400 - Invalid request parameters
 * @returns {ErrorResponse} 500 - Internal server error
 */
router.post("/save-json", async (req, res) => {
  try {
    const { filename, data } = req.body;

    if (!filename || !data) {
      return res.status(400).json({
        detail: "Missing required parameters: filename and data",
      });
    }

    // Create outputs directory if it doesn't exist
    const projectRoot = path.resolve(process.cwd());
    const outputsDir = path.join(projectRoot, "outputs");

    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    // Construct file path
    const filePath = path.join(outputsDir, filename);

    // Save JSON data to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
      encoding: "utf-8",
    });

    return res.json({
      success: true,
      message: `File saved successfully to ${filePath}`,
      filename,
    });
  } catch (err) {
    console.error("Failed to save file:", err);
    return res.status(500).json({
      detail: `Failed to save file: ${err.message}`,
    });
  }
});

export default router;
