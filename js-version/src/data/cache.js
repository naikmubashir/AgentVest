import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Simple data cache implementation
 */
class Cache {
  constructor() {
    // Define paths relative to this file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Set up cache directories
    this.baseCacheDir = path.join(__dirname, "..", "..", "cache");
    this.pricesDir = path.join(this.baseCacheDir, "prices");
    this.metricsDir = path.join(this.baseCacheDir, "metrics");
    this.lineItemsDir = path.join(this.baseCacheDir, "line_items");
    this.newsDir = path.join(this.baseCacheDir, "news");
    this.insiderTradesDir = path.join(this.baseCacheDir, "insider_trades");
    this.companyFactsDir = path.join(this.baseCacheDir, "company_facts");

    // Ensure cache directories exist
    this.ensureCacheDirs();
  }

  /**
   * Create cache directories if they don't exist
   */
  async ensureCacheDirs() {
    try {
      await fs.mkdir(this.baseCacheDir, { recursive: true });
      await fs.mkdir(this.pricesDir, { recursive: true });
      await fs.mkdir(this.metricsDir, { recursive: true });
      await fs.mkdir(this.lineItemsDir, { recursive: true });
      await fs.mkdir(this.newsDir, { recursive: true });
      await fs.mkdir(this.insiderTradesDir, { recursive: true });
      await fs.mkdir(this.companyFactsDir, { recursive: true });
    } catch (error) {
      console.error("Error creating cache directories:", error);
    }
  }

  /**
   * Get cached prices
   *
   * @param {string} key - Cache key
   * @returns {Array|null} - Cached data or null if not found
   */
  async getPrices(key) {
    return await this.getCache(this.pricesDir, key);
  }

  /**
   * Set prices in cache
   *
   * @param {string} key - Cache key
   * @param {Array} data - Data to cache
   */
  async setPrices(key, data) {
    await this.setCache(this.pricesDir, key, data);
  }

  /**
   * Get cached metrics
   *
   * @param {string} key - Cache key
   * @returns {Array|null} - Cached data or null if not found
   */
  async getMetrics(key) {
    return await this.getCache(this.metricsDir, key);
  }

  /**
   * Set metrics in cache
   *
   * @param {string} key - Cache key
   * @param {Array} data - Data to cache
   */
  async setMetrics(key, data) {
    await this.setCache(this.metricsDir, key, data);
  }

  /**
   * Get cached line items
   *
   * @param {string} key - Cache key
   * @returns {Array|null} - Cached data or null if not found
   */
  async getLineItems(key) {
    return await this.getCache(this.lineItemsDir, key);
  }

  /**
   * Set line items in cache
   *
   * @param {string} key - Cache key
   * @param {Array} data - Data to cache
   */
  async setLineItems(key, data) {
    await this.setCache(this.lineItemsDir, key, data);
  }

  /**
   * Get cached news
   *
   * @param {string} key - Cache key
   * @returns {Array|null} - Cached data or null if not found
   */
  async getNews(key) {
    return await this.getCache(this.newsDir, key);
  }

  /**
   * Set news in cache
   *
   * @param {string} key - Cache key
   * @param {Array} data - Data to cache
   */
  async setNews(key, data) {
    await this.setCache(this.newsDir, key, data);
  }

  /**
   * Get cached insider trades
   *
   * @param {string} key - Cache key
   * @returns {Array|null} - Cached data or null if not found
   */
  async getInsiderTrades(key) {
    return await this.getCache(this.insiderTradesDir, key);
  }

  /**
   * Set insider trades in cache
   *
   * @param {string} key - Cache key
   * @param {Array} data - Data to cache
   */
  async setInsiderTrades(key, data) {
    await this.setCache(this.insiderTradesDir, key, data);
  }

  /**
   * Get cached company facts
   *
   * @param {string} key - Cache key
   * @returns {Object|null} - Cached data or null if not found
   */
  async getCompanyFacts(key) {
    return await this.getCache(this.companyFactsDir, key);
  }

  /**
   * Set company facts in cache
   *
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   */
  async setCompanyFacts(key, data) {
    await this.setCache(this.companyFactsDir, key, data);
  }

  /**
   * Generic method to get cached data
   *
   * @param {string} dir - Cache directory
   * @param {string} key - Cache key
   * @returns {any|null} - Cached data or null if not found
   */
  async getCache(dir, key) {
    try {
      const filePath = path.join(dir, `${key}.json`);
      const exists = await this.fileExists(filePath);

      if (!exists) {
        return null;
      }

      const data = await fs.readFile(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error reading cache for ${key}:`, error);
      return null;
    }
  }

  /**
   * Generic method to set data in cache
   *
   * @param {string} dir - Cache directory
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   */
  async setCache(dir, key, data) {
    try {
      const filePath = path.join(dir, `${key}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
      console.error(`Error writing cache for ${key}:`, error);
    }
  }

  /**
   * Check if a file exists
   *
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - True if file exists, false otherwise
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let cacheInstance = null;

/**
 * Get the cache instance
 *
 * @returns {Cache} - Cache instance
 */
export function getCache() {
  if (!cacheInstance) {
    cacheInstance = new Cache();
  }

  return cacheInstance;
}
