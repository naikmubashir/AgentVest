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

  // For development/testing, use mock data instead of making API calls
  const useMockData = process.env.USE_MOCK_DATA === "true" || true; // Default to mock data

  if (useMockData) {
    console.log(`Using mock price data for ${ticker}`);

    // Generate dates between start and end date
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const dayDiff = Math.floor(
      (endDateObj - startDateObj) / (1000 * 60 * 60 * 24)
    );

    // Generate sample price data with some randomness
    const mockPrices = [];
    let basePrice =
      ticker === "AAPL"
        ? 180
        : ticker === "MSFT"
        ? 380
        : ticker === "GOOGL"
        ? 150
        : 100;

    for (let i = 0; i <= dayDiff; i++) {
      const currentDate = new Date(startDateObj);
      currentDate.setDate(startDateObj.getDate() + i);

      // Skip weekends
      const day = currentDate.getDay();
      if (day === 0 || day === 6) continue;

      // Add some random price movements (between -2% and +2%)
      const priceChange = basePrice * (Math.random() * 0.04 - 0.02);
      basePrice += priceChange;

      mockPrices.push({
        date: currentDate.toISOString().split("T")[0],
        open: basePrice - 1,
        high: basePrice + 2,
        low: basePrice - 2,
        close: basePrice,
        volume: Math.floor(Math.random() * 10000000) + 5000000,
        ticker: ticker,
      });
    }

    // Cache the results
    cache.set(cacheKey, mockPrices);
    return mockPrices;
  }

  // If mock data is disabled, make the real API call
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
 * Converts the raw prices API response to a dataframe-like structure
 *
 * @param {Object} prices - The price data from the API
 * @returns {Array} An array of price data objects
 */
export function pricesToDf(prices) {
  if (!prices || !prices.data || !Array.isArray(prices.data)) {
    return [];
  }

  // Convert the data to a format similar to a DataFrame
  return prices.data.map((item) => ({
    date: new Date(item.date),
    open: parseFloat(item.open),
    high: parseFloat(item.high),
    low: parseFloat(item.low),
    close: parseFloat(item.close),
    volume: parseFloat(item.volume),
  }));
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

  // For development/testing, use mock data instead of making API calls
  const useMockData = process.env.USE_MOCK_DATA === "true" || true; // Default to mock data

  if (useMockData) {
    console.log(`Using mock financial metrics for ${ticker}`);

    // Generate sample financial metrics
    const mockMetrics = [];

    // Base values that vary by ticker
    const baseValues = {
      AAPL: {
        roe: 0.35,
        pe: 28.5,
        debt_to_equity: 1.2,
        profit_margin: 0.25,
        current_ratio: 1.5,
      },
      MSFT: {
        roe: 0.42,
        pe: 33.2,
        debt_to_equity: 0.8,
        profit_margin: 0.37,
        current_ratio: 1.8,
      },
      GOOGL: {
        roe: 0.25,
        pe: 25.1,
        debt_to_equity: 0.5,
        profit_margin: 0.28,
        current_ratio: 2.2,
      },
    };

    // Use base values for the ticker, or default values
    const baseMetrics = baseValues[ticker] || {
      roe: 0.2,
      pe: 20,
      debt_to_equity: 1.0,
      profit_margin: 0.15,
      current_ratio: 1.3,
    };

    // Generate metrics for each period
    for (let i = 0; i < limit; i++) {
      const date = new Date(endDate);
      date.setMonth(date.getMonth() - i * 3); // Go back 3 months for each period

      // Add some random variation to metrics
      const randomFactor = 0.9 + Math.random() * 0.2; // 0.9 to 1.1

      mockMetrics.push({
        date: date.toISOString().split("T")[0],
        period: period,
        roe: baseMetrics.roe * randomFactor,
        return_on_equity: baseMetrics.roe * randomFactor,
        pe_ratio: baseMetrics.pe * randomFactor,
        debt_to_equity: baseMetrics.debt_to_equity * randomFactor,
        profit_margin: baseMetrics.profit_margin * randomFactor,
        net_margin: baseMetrics.profit_margin * randomFactor,
        operating_margin: baseMetrics.profit_margin * 0.9 * randomFactor,
        current_ratio: baseMetrics.current_ratio * randomFactor,
        quick_ratio: baseMetrics.current_ratio * 0.8 * randomFactor,
        revenue_growth: 0.1 * randomFactor,
        earnings_growth: 0.12 * randomFactor,
        book_value_growth: 0.08 * randomFactor,
        eps_growth: 0.12 * randomFactor,
        ticker: ticker,
      });
    }

    // Cache the results
    cache.set(cacheKey, mockMetrics);
    return mockMetrics;
  }

  // If not using mock data, fetch from API
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

  // For development/testing, use mock data instead of making API calls
  const useMockData = process.env.USE_MOCK_DATA === "true" || true; // Default to mock data

  if (useMockData) {
    console.log(`Using mock line items for ${ticker}: ${items.join(", ")}`);

    // Base values for different tickers
    const baseValues = {
      AAPL: {
        revenue: 394328000000,
        netIncome: 97150000000,
        totalAssets: 350662000000,
        totalEquity: 63090000000,
        sharesOutstanding: 15634000000,
        marketCap: 2813968000000,
      },
      MSFT: {
        revenue: 211915000000,
        netIncome: 72361000000,
        totalAssets: 404000000000,
        totalEquity: 166000000000,
        sharesOutstanding: 7430000000,
        marketCap: 2823400000000,
      },
      GOOGL: {
        revenue: 307394000000,
        netIncome: 73795000000,
        totalAssets: 361966000000,
        totalEquity: 251906000000,
        sharesOutstanding: 12595000000,
        marketCap: 1889250000000,
      },
    };

    // Use base values for the ticker, or default values
    const baseMetrics = baseValues[ticker] || {
      revenue: 100000000000,
      netIncome: 15000000000,
      totalAssets: 150000000000,
      totalEquity: 75000000000,
      sharesOutstanding: 5000000000,
      marketCap: 750000000000,
    };

    // Generate line items for each period
    const result = {};

    for (const item of items) {
      result[item] = [];

      for (let i = 0; i < limit; i++) {
        const date = new Date(endDate);
        date.setMonth(date.getMonth() - i * 3); // Go back 3 months for each period

        // Add some random variation to values
        const randomFactor = 0.95 + Math.random() * 0.1; // 0.95 to 1.05

        // Select the appropriate base value
        let value = 0;
        if (item === "revenue" || item === "totalRevenue") {
          value = baseMetrics.revenue * randomFactor;
        } else if (item === "netIncome" || item === "totalNetIncome") {
          value = baseMetrics.netIncome * randomFactor;
        } else if (item === "totalAssets") {
          value = baseMetrics.totalAssets * randomFactor;
        } else if (item === "totalEquity") {
          value = baseMetrics.totalEquity * randomFactor;
        } else if (item === "sharesOutstanding") {
          value = baseMetrics.sharesOutstanding * randomFactor;
        } else if (item === "marketCap") {
          value = baseMetrics.marketCap * randomFactor;
        } else {
          // Default for other line items
          value = Math.random() * 1000000000 + 1000000000;
        }

        result[item].push({
          date: date.toISOString().split("T")[0],
          period: period,
          value: value,
          ticker: ticker,
        });
      }
    }

    // Cache the results
    cache.set(cacheKey, result);
    return result;
  }

  // If not using mock data, fetch from API
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

/**
 * Gets company news articles
 *
 * @param {string} ticker - The stock ticker
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Array>} Array of news articles
 */
export async function getCompanyNews(
  ticker,
  endDate,
  days = 7,
  limit = 10,
  apiKey = null
) {
  // Create a cache key
  const cacheKey = `news_${ticker}_${endDate}_${days}_${limit}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // For now, return mock data
  const mockNews = [];

  // Generate multiple mock news articles
  for (let i = 0; i < limit; i++) {
    const publishedDate = new Date(endDate);
    publishedDate.setDate(
      publishedDate.getDate() - Math.floor(Math.random() * days)
    );

    mockNews.push({
      title: `${ticker} ${
        i % 2 === 0 ? "Reports Strong Growth" : "Announces New Initiative"
      }`,
      published_date: publishedDate.toISOString().split("T")[0],
      summary: `This is a placeholder news article #${
        i + 1
      } for ${ticker} with ${i % 2 === 0 ? "positive" : "neutral"} sentiment.`,
      source: "Mock Financial News",
      url: `https://example.com/news/${ticker}/${i + 1}`,
      snippet: `Brief overview of ${ticker}'s latest ${
        i % 2 === 0 ? "financial results" : "business developments"
      }.`,
    });
  }

  // Cache the results
  cache.set(cacheKey, mockNews);

  return mockNews;
}

/**
 * Gets insider trading information
 *
 * @param {string} ticker - The stock ticker
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Array>} Array of insider trades
 */
export async function getInsiderTrades(
  ticker,
  startDate,
  endDate,
  apiKey = null
) {
  // Create a cache key
  const cacheKey = `insider_${ticker}_${startDate}_${endDate}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // For now, return mock data
  const mockTrades = [
    {
      date: new Date(),
      name: "John Doe",
      title: "Director",
      transactionType: "Buy",
      shares: 1000,
      price: 150.0,
      value: 150000.0,
    },
  ];

  // Cache the results
  cache.set(cacheKey, mockTrades);

  return mockTrades;
}

/**
 * Gets technical indicators for a stock
 *
 * @param {string} ticker - The stock ticker
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {number} days - Number of days of data to fetch
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Array>} Technical indicators data
 */
export async function getTechnicalIndicators(
  ticker,
  endDate,
  days = 30,
  apiKey = null
) {
  // Create a cache key
  const cacheKey = `technicals_${ticker}_${endDate}_${days}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // For development/testing, use mock data instead of making API calls
  const useMockData = process.env.USE_MOCK_DATA === "true" || true; // Default to mock data

  if (useMockData) {
    console.log(`Using mock technical indicators for ${ticker}`);

    // Generate sample technical indicators
    const mockIndicators = [];

    // Generate end date
    const endDateObj = new Date(endDate);

    // Generate indicators for each day
    for (let i = 0; i < days; i++) {
      const date = new Date(endDateObj);
      date.setDate(date.getDate() - i);

      // Skip weekends
      const day = date.getDay();
      if (day === 0 || day === 6) continue;

      // Base price varies by ticker
      let basePrice =
        ticker === "AAPL"
          ? 180
          : ticker === "MSFT"
          ? 380
          : ticker === "GOOGL"
          ? 150
          : 100;

      // Add some random price variations
      const priceVariation = basePrice * (0.8 + Math.random() * 0.4); // 0.8 to 1.2 of base price

      // Calculate moving averages with some variation
      const sma20 = priceVariation * (0.95 + Math.random() * 0.1);
      const sma50 = priceVariation * (0.9 + Math.random() * 0.1);
      const sma200 = priceVariation * (0.85 + Math.random() * 0.1);

      const ema12 = priceVariation * (0.97 + Math.random() * 0.06);
      const ema26 = priceVariation * (0.94 + Math.random() * 0.06);

      // Random RSI between 30 and 70
      const rsi = 30 + Math.random() * 40;

      // MACD values
      const macd = Math.random() * 2 - 1; // -1 to 1
      const macdSignal = macd * (0.9 + Math.random() * 0.2);
      const macdHist = macd - macdSignal;

      // Bollinger Bands
      const bollingerMiddle = priceVariation;
      const bollingerUpper =
        bollingerMiddle * (1 + (0.02 + Math.random() * 0.03));
      const bollingerLower =
        bollingerMiddle * (1 - (0.02 + Math.random() * 0.03));

      // Stochastic Oscillator
      const stochK = Math.random() * 100;
      const stochD = stochK * (0.9 + Math.random() * 0.2);

      // Average True Range
      const atr = priceVariation * (0.01 + Math.random() * 0.02);

      // On-Balance Volume
      const obv = Math.random() * 20000000 - 10000000;

      mockIndicators.push({
        date: date.toISOString().split("T")[0],
        close: priceVariation,
        volume: Math.floor(Math.random() * 10000000) + 5000000,
        sma_20: sma20,
        sma_50: sma50,
        sma_200: sma200,
        ema_12: ema12,
        ema_26: ema26,
        rsi: rsi,
        macd: macd,
        macd_signal: macdSignal,
        macd_hist: macdHist,
        bollinger_upper: bollingerUpper,
        bollinger_middle: bollingerMiddle,
        bollinger_lower: bollingerLower,
        stoch_k: stochK,
        stoch_d: stochD,
        atr: atr,
        obv: obv,
        ticker: ticker,
      });
    }

    // Cache the results
    cache.set(cacheKey, mockIndicators);
    return mockIndicators;
  }

  // If not using mock data, fetch from API
  const headers = {};
  const financialApiKey = apiKey || process.env.FINANCIAL_DATASETS_API_KEY;

  if (financialApiKey) {
    headers["X-API-KEY"] = financialApiKey;
  }

  // In a real implementation, we would make an API call here
  // For now, just return an empty array
  console.error(`Real API call for technical indicators not implemented yet`);
  return [];
}

/**
 * Gets market sentiment data
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Object>} Market sentiment data
 */
export async function getMarketSentiment(date, apiKey = null) {
  // Create a cache key
  const cacheKey = `sentiment_${date}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // For now, return mock data
  const mockSentiment = {
    date: date,
    vix: 18.5,
    putCallRatio: 0.9,
    cnbcSentiment: "Neutral",
    aaiiBullish: 35,
    aaiiNeutral: 40,
    aaiiBearish: 25,
  };

  // Cache the results
  cache.set(cacheKey, mockSentiment);

  return mockSentiment;
}

/**
 * Gets social media sentiment data
 *
 * @param {string} ticker - The stock ticker
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Object>} Social media sentiment data
 */
export async function getSocialMediaSentiment(
  ticker,
  endDate,
  days = 7,
  apiKey = null
) {
  // Create a cache key
  const cacheKey = `social_${ticker}_${endDate}_${days}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // For now, return mock data
  const mockSocialSentiment = {
    ticker: ticker,
    endDate: endDate,
    days: days,
    redditSentiment: 0.65,
    twitterSentiment: 0.58,
    stocktwitsRatio: 1.2,
    mentionCount: 250,
    positiveMentions: 150,
    negativeMentions: 50,
    neutralMentions: 50,
  };

  // Cache the results
  cache.set(cacheKey, mockSocialSentiment);

  return mockSocialSentiment;
}

/**
 * Gets sector performance data
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Object>} Sector performance data
 */
export async function getSectorPerformance(date, apiKey = null) {
  // Create a cache key
  const cacheKey = `sectors_${date}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // For now, return mock data
  const mockSectorData = {
    date: date,
    sectors: {
      technology: 0.8,
      healthcare: 0.3,
      finance: -0.2,
      consumer: 0.5,
      energy: -0.4,
      industrial: 0.1,
      utilities: 0.2,
      materials: -0.1,
      realestate: 0.0,
      communication: 0.6,
    },
  };

  // Cache the results
  cache.set(cacheKey, mockSectorData);

  return mockSectorData;
}

/**
 * Gets economic indicators
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Object>} Economic indicators data
 */
export async function getEconomicIndicators(date, apiKey = null) {
  // Create a cache key
  const cacheKey = `economic_${date}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // For now, return mock data
  const mockEconomicData = {
    date: date,
    gdpGrowth: 2.3,
    unemploymentRate: 3.8,
    inflationRate: 2.1,
    federalFundsRate: 4.75,
    tenYearTreasuryYield: 3.5,
    retailSales: 0.4,
    consumerSentiment: 98.5,
    pmi: 52.7,
  };

  // Cache the results
  cache.set(cacheKey, mockEconomicData);

  return mockEconomicData;
}

/**
 * Gets company profile information
 *
 * @param {string} ticker - The stock ticker
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Object>} Company profile data
 */
export async function getCompanyProfile(ticker, apiKey = null) {
  // Create a cache key
  const cacheKey = `profile_${ticker}`;

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // For now, return mock data
  const mockProfile = {
    ticker: ticker,
    name: `${ticker} Corporation`,
    industry: "Technology",
    sector: "Information Technology",
    employees: 5000,
    ceo: "Jane Smith",
    founded: 2000,
    headquarters: "San Francisco, CA",
    description: `A leading technology company specializing in software and services.`,
  };

  // Cache the results
  cache.set(cacheKey, mockProfile);

  return mockProfile;
}

/**
 * Gets historical price data - alias for getPrices for compatibility
 *
 * @param {string} ticker - The stock ticker
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string|null} apiKey - Optional API key
 * @returns {Promise<Object>} Price data
 */
export async function getPriceData(ticker, startDate, endDate, apiKey = null) {
  return getPrices(ticker, startDate, endDate, apiKey);
}
