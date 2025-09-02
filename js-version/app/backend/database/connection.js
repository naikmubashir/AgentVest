import { Sequelize } from "sequelize";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the backend directory path
const BACKEND_DIR = path.join(__dirname, "..");
const DATABASE_PATH = path.join(BACKEND_DIR, "hedge_fund.db");

// Create database directory if it doesn't exist
const databaseDir = path.dirname(DATABASE_PATH);
if (!fs.existsSync(databaseDir)) {
  fs.mkdirSync(databaseDir, { recursive: true });
}

// Database configuration
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: DATABASE_PATH,
  logging: false,
});

// Function to initialize the database connection
export async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log("Database connection has been established successfully.");
    return true;
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    return false;
  }
}

export default sequelize;
