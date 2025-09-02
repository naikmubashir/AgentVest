import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

describe("API Rate Limiting Tests", () => {
  const FINANCIAL_API_KEY = process.env.FINANCIAL_DATASETS_API_KEY;
  const TEST_TICKER = "AAPL";
  const TEST_DATE = "2023-12-31";

  before(() => {
    if (!FINANCIAL_API_KEY) {
      console.warn(
        "WARNING: FINANCIAL_DATASETS_API_KEY not set. Tests will likely fail."
      );
    }
  });

  it("should handle rate limiting with retries", async function () {
    // Increase timeout for this test
    this.timeout(120000);

    // Set up API URL and headers
    const url = `https://api.financialdatasets.ai/prices/?ticker=${TEST_TICKER}&interval=day&interval_multiplier=1&start_date=${TEST_DATE}&end_date=${TEST_DATE}`;
    const headers = {
      "X-API-KEY": FINANCIAL_API_KEY,
    };

    // Function to make an API request
    const makeRequest = async () => {
      try {
        const response = await axios.get(url, { headers });
        return response.data;
      } catch (error) {
        if (error.response && error.response.status === 429) {
          console.log("Rate limited (429). Retrying after delay...");
          // Wait for 2 seconds before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return makeRequest(); // Retry
        }
        throw error;
      }
    };

    // Make 3 requests in succession
    try {
      const results = [];
      for (let i = 0; i < 3; i++) {
        console.log(`Making request ${i + 1}/3`);
        const result = await makeRequest();
        results.push(result);
      }

      // Verify that we got responses for all requests
      expect(results.length).to.equal(3);

      // Check that each response has the expected structure
      results.forEach((result) => {
        expect(result).to.have.property("prices");
      });
    } catch (error) {
      if (!FINANCIAL_API_KEY) {
        console.log("Test skipped due to missing API key");
        this.skip();
      } else {
        throw error;
      }
    }
  });

  it("should properly mask API keys", () => {
    const maskApiKey = (apiKey) => {
      if (!apiKey) return "";

      if (apiKey.length <= 8) {
        return "*".repeat(apiKey.length);
      }

      const firstFour = apiKey.substring(0, 4);
      const lastFour = apiKey.substring(apiKey.length - 4);
      const middle = "*".repeat(Math.min(apiKey.length - 8, 10));

      return `${firstFour}${middle}${lastFour}`;
    };

    // Test API key masking
    const testKey1 = "sk-1234567890abcdef";
    const testKey2 = "abcdef";
    const testKey3 = "abcdefghijklmnopqrstuvwxyz1234567890";

    expect(maskApiKey(testKey1)).to.equal("sk-1**********cdef");
    expect(maskApiKey(testKey2)).to.equal("******");
    expect(maskApiKey(testKey3)).to.equal("abcd**********7890");
  });
});
