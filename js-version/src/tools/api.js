import axios from "axios";
import { z } from "zod";
import NodeCache from "node-cache";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a cache instance with 1 hour TTL
const cache = new NodeCache({ stdTTL: 3600 });

/**
 * Make an API request with rate limiting handling and moderate backoff
 *
 * @param {string} url - The URL to request
 * @param {Object} headers - Headers to include in the request
 * @param {string} method - HTTP method (GET or POST)
 * @param {Object} jsonData - JSON data for POST requests
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<Object>} - The API response
 */
async function makeApiRequest(
  url,
  headers,
  method = "GET",
  jsonData = null,
  maxRetries = 3
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let response;

      if (method.toUpperCase() === "POST") {
        response = await axios.post(url, jsonData, { headers });
      } else {
        response = await axios.get(url, { headers });
      }

      return response.data;
    } catch (error) {
      if (
        error.response &&
        error.response.status === 429 &&
        attempt < maxRetries
      ) {
        // Linear backoff: 60s, 90s, 120s, 150s...
        const delay = 60000 + 30000 * attempt;
        console.log(
          `Rate limited (429). Attempt ${attempt + 1}/${
            maxRetries + 1
          }. Waiting ${delay / 1000}s before retrying...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // If we've reached the max retries or it's not a rate limit error, throw
      if (attempt === maxRetries) {
        throw new Error(`API request failed: ${error.message}`);
      }
    }
  }
}

// Schema definitions for data models
const PriceSchema = z.object({
  ticker: z.string(),
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
  adjusted_close: z.number().optional(),
});

const PriceResponseSchema = z.object({
  prices: z.array(PriceSchema),
});

const FinancialMetricSchema = z.object({
  ticker: z.string(),
  date: z.string(),
  period: z.string(),
  pe_ratio: z.number().optional().nullable(),
  pb_ratio: z.number().optional().nullable(),
  dividend_yield: z.number().optional().nullable(),
  roe: z.number().optional().nullable(),
  roa: z.number().optional().nullable(),
  debt_to_equity: z.number().optional().nullable(),
  current_ratio: z.number().optional().nullable(),
  quick_ratio: z.number().optional().nullable(),
  gross_margin: z.number().optional().nullable(),
  operating_margin: z.number().optional().nullable(),
  net_margin: z.number().optional().nullable(),
  peg_ratio: z.number().optional().nullable(),
  ev_to_ebitda: z.number().optional().nullable(),
});

const FinancialMetricsResponseSchema = z.object({
  metrics: z.array(FinancialMetricSchema),
});

const LineItemSchema = z.object({
  ticker: z.string(),
  date: z.string(),
  period: z.string(),
  name: z.string(),
  value: z.number(),
});

const LineItemResponseSchema = z.object({
  items: z.array(LineItemSchema),
});

/**
 * Get prices for a stock
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} apiKey - API key for the financial data service
 * @returns {Promise<Array>} - Array of price objects
 */
export async function getPrices(ticker, startDate, endDate, apiKey = null) {
  // Create a cache key
  const cacheKey = `prices_${ticker}_${startDate}_${endDate}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // If not in cache, fetch from API
  const headers = {};
  const financialApiKey = apiKey || process.env.FINANCIAL_DATASETS_API_KEY;

  if (financialApiKey) {
    headers["X-API-KEY"] = financialApiKey;
  }

  const url = `https://api.financialdatasets.ai/prices/?ticker=${ticker}&interval=day&interval_multiplier=1&start_date=${startDate}&end_date=${endDate}`;

  try {
    const responseData = await makeApiRequest(url, headers);
    const validatedData = PriceResponseSchema.parse(responseData);

    // Cache the results
    cache.set(cacheKey, validatedData.prices);

    return validatedData.prices;
  } catch (error) {
    console.error(`Error fetching prices for ${ticker}:`, error);
    return [];
  }
}

/**
 * Get financial metrics for a stock
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} period - Period ('ttm', 'quarterly', 'annual')
 * @param {number} limit - Maximum number of periods to return
 * @param {string} apiKey - API key for the financial data service
 * @returns {Promise<Array>} - Array of financial metric objects
 */
export async function getFinancialMetrics(
  ticker,
  endDate,
  period = "ttm",
  limit = 10,
  apiKey = null
) {
  // Create a cache key
  const cacheKey = `metrics_${ticker}_${endDate}_${period}_${limit}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // If not in cache, fetch from API
  const headers = {};
  const financialApiKey = apiKey || process.env.FINANCIAL_DATASETS_API_KEY;

  if (financialApiKey) {
    headers["X-API-KEY"] = financialApiKey;
  }

  const url = `https://api.financialdatasets.ai/metrics/?ticker=${ticker}&period=${period}&limit=${limit}&end_date=${endDate}`;

  try {
    const responseData = await makeApiRequest(url, headers);
    const validatedData = FinancialMetricsResponseSchema.parse(responseData);

    // Cache the results
    cache.set(cacheKey, validatedData.metrics);

    return validatedData.metrics;
  } catch (error) {
    console.error(`Error fetching financial metrics for ${ticker}:`, error);
    return [];
  }
}

/**
 * Search for financial line items
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {Array<string>} items - Array of line item names to search for
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} period - Period ('ttm', 'quarterly', 'annual')
 * @param {number} limit - Maximum number of periods to return
 * @param {string} apiKey - API key for the financial data service
 * @returns {Promise<Array>} - Array of line item objects
 */
export async function searchLineItems(
  ticker,
  items,
  endDate,
  period = "ttm",
  limit = 10,
  apiKey = null
) {
  // Create a cache key
  const cacheKey = `lineitems_${ticker}_${items.join(
    "_"
  )}_${endDate}_${period}_${limit}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // If not in cache, fetch from API
  const headers = {};
  const financialApiKey = apiKey || process.env.FINANCIAL_DATASETS_API_KEY;

  if (financialApiKey) {
    headers["X-API-KEY"] = financialApiKey;
  }

  const url = `https://api.financialdatasets.ai/line-items/?ticker=${ticker}&items=${items.join(
    ","
  )}&period=${period}&limit=${limit}&end_date=${endDate}`;

  try {
    const responseData = await makeApiRequest(url, headers);
    const validatedData = LineItemResponseSchema.parse(responseData);

    // Cache the results
    cache.set(cacheKey, validatedData.items);

    return validatedData.items;
  } catch (error) {
    console.error(`Error fetching line items for ${ticker}:`, error);
    return [];
  }
}

/**
 * Get market cap for a stock
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} apiKey - API key for the financial data service
 * @returns {Promise<number>} - Market cap value
 */
export async function getMarketCap(ticker, date, apiKey = null) {
  try {
    const items = await searchLineItems(
      ticker,
      ["market_cap"],
      date,
      "ttm",
      1,
      apiKey
    );

    if (items && items.length > 0) {
      return items[0].value;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching market cap for ${ticker}:`, error);
    return null;
  }
}
