/**
 * Sentiment Analyst Agent
 * Analyzes market sentiment using news articles and social media data.
 */
import { HumanMessage } from "langchain/schema";
import { ChatPromptTemplate } from "langchain/prompts";
import { showAgentReasoning } from "../graph/state.js";
import { getApiKeyFromState } from "../utils/api_key.js";
import { progress } from "../utils/progress.js";
import { callLLM } from "../utils/llm.js";
import { getCompanyNews, getSocialMediaSentiment } from "../tools/api.js";

/**
 * Analyzes market sentiment using news articles and social media data
 *
 * @param {Object} state - The agent state
 * @param {string} agentId - The agent ID
 * @returns {Object} Updated state with sentiment analysis
 */
export async function sentimentAnalystAgent(
  state,
  agentId = "sentiment_analyst_agent"
) {
  const data = state.data;
  const endDate = data.end_date;
  const tickers = data.tickers;
  const apiKey = getApiKeyFromState(state, "NEWS_API_KEY");
  const socialApiKey = getApiKeyFromState(state, "SOCIAL_MEDIA_API_KEY");
  const modelName = state.metadata.model_name;
  const modelProvider = state.metadata.model_provider;

  // Initialize sentiment analysis for each ticker
  const sentimentAnalysis = {};

  for (const ticker of tickers) {
    progress.updateStatus(agentId, ticker, "Fetching news articles");

    // Get recent news articles
    const news = getCompanyNews(
      ticker,
      endDate,
      7, // Last 7 days of news
      10, // Limit to 10 articles
      apiKey
    );

    if (!news || news.length === 0) {
      progress.updateStatus(agentId, ticker, "No recent news articles found");

      // Add neutral sentiment if no news is found
      sentimentAnalysis[ticker] = {
        signal: "neutral",
        confidence: 50,
        reasoning: {
          news_sentiment: {
            signal: "neutral",
            articles: [],
            details: "No recent news articles found.",
          },
          social_sentiment: {
            signal: "neutral",
            details: "No social media data analyzed.",
          },
        },
      };

      continue;
    }

    // Get social media sentiment if available
    progress.updateStatus(agentId, ticker, "Fetching social media sentiment");
    const socialSentiment = getSocialMediaSentiment(
      ticker,
      endDate,
      3, // Last 3 days
      socialApiKey
    );

    // Prepare news data for LLM analysis
    const newsArticles = news.map((article) => ({
      title: article.title,
      date: article.published_date,
      summary: article.summary || article.snippet || "No summary available.",
    }));

    // Analyze news sentiment using LLM
    progress.updateStatus(agentId, ticker, "Analyzing news sentiment");

    const newsSentiment = await analyzeNewsSentiment(
      ticker,
      newsArticles,
      modelName,
      modelProvider
    );

    // Analyze social media sentiment
    progress.updateStatus(agentId, ticker, "Analyzing social media sentiment");
    const socialAnalysis = analyzeSocialSentiment(socialSentiment);

    // Calculate overall sentiment signal
    let overallSignal;
    let overallConfidence;
    let reasoning = {};

    if (newsSentiment) {
      reasoning.news_sentiment = newsSentiment;

      if (socialAnalysis) {
        // We have both news and social sentiment
        reasoning.social_sentiment = socialAnalysis;

        // If both agree, higher confidence
        if (newsSentiment.signal === socialAnalysis.signal) {
          overallSignal = newsSentiment.signal;
          overallConfidence = 80;
        } else {
          // If they disagree, lean towards news (more reliable)
          overallSignal = newsSentiment.signal;
          overallConfidence = 60;
        }
      } else {
        // Only news sentiment
        overallSignal = newsSentiment.signal;
        overallConfidence = 70;
      }
    } else if (socialAnalysis) {
      // Only social sentiment
      reasoning.social_sentiment = socialAnalysis;
      overallSignal = socialAnalysis.signal;
      overallConfidence = 50;
    } else {
      // No sentiment data
      overallSignal = "neutral";
      overallConfidence = 50;
      reasoning = {
        details: "No sentiment data available.",
      };
    }

    sentimentAnalysis[ticker] = {
      signal: overallSignal,
      confidence: overallConfidence,
      reasoning: reasoning,
    };

    progress.updateStatus(agentId, ticker, "Done", {
      analysis: JSON.stringify(reasoning, null, 4),
    });
  }

  // Create the sentiment analysis message
  const message = new HumanMessage({
    content: JSON.stringify(sentimentAnalysis),
    name: agentId,
  });

  // Print the reasoning if the flag is set
  if (state.metadata.show_reasoning) {
    showAgentReasoning(sentimentAnalysis, "Sentiment Analysis Agent");
  }

  // Add the signal to the analyst_signals list
  state.data.analyst_signals = state.data.analyst_signals || {};
  state.data.analyst_signals[agentId] = sentimentAnalysis;

  progress.updateStatus(agentId, null, "Done");

  return {
    messages: [message],
    data: data,
  };
}

/**
 * Analyze news sentiment using an LLM
 *
 * @param {string} ticker - Stock ticker
 * @param {Array} articles - News articles
 * @param {string} modelName - LLM model name
 * @param {string} modelProvider - LLM provider
 * @returns {Promise<Object>} Sentiment analysis results
 */
async function analyzeNewsSentiment(
  ticker,
  articles,
  modelName,
  modelProvider
) {
  // If no articles, return neutral
  if (!articles || articles.length === 0) {
    return {
      signal: "neutral",
      articles: [],
      details: "No news articles to analyze.",
    };
  }

  // Prepare articles for the prompt
  const articlesText = articles
    .map(
      (article, i) =>
        `ARTICLE ${i + 1}:\nDate: ${article.date}\nTitle: ${
          article.title
        }\nSummary: ${article.summary}`
    )
    .join("\n\n");

  // Create the prompt
  const template = `You are a stock market sentiment analyst. Analyze the following news articles about ${ticker} and determine the overall sentiment. 
  
Articles:
${articlesText}

Provide your analysis in JSON format:
{
  "signal": "bullish", "bearish", or "neutral",
  "articles": [
    {
      "index": article index number,
      "sentiment": "positive", "negative", or "neutral",
      "key_points": "Brief extraction of key points related to stock performance"
    },
    ...
  ],
  "details": "Brief explanation of your overall sentiment assessment"
}`;

  try {
    // Call the LLM
    const response = await callLLM(template, modelName, modelProvider, {
      responseFormat: { type: "json_object" },
    });

    // Parse the response
    let result;
    try {
      // Try to parse the response as JSON
      if (typeof response === "string") {
        // Extract JSON if wrapped in ```json or ```
        const jsonMatch =
          response.match(/```json\n([\s\S]*?)\n```/) ||
          response.match(/```([\s\S]*?)```/) ||
          response.match(/{[\s\S]*?}/);

        if (jsonMatch && jsonMatch[1]) {
          result = JSON.parse(jsonMatch[1]);
        } else if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = JSON.parse(response);
        }
      } else {
        result = response;
      }
    } catch (error) {
      console.error("Failed to parse LLM response:", error);
      return {
        signal: "neutral",
        articles: [],
        details: "Error analyzing news sentiment.",
      };
    }

    return result;
  } catch (error) {
    console.error("Error calling LLM for sentiment analysis:", error);
    return {
      signal: "neutral",
      articles: [],
      details: "Error analyzing news sentiment.",
    };
  }
}

/**
 * Analyze social media sentiment
 *
 * @param {Object} socialData - Social media sentiment data
 * @returns {Object} Sentiment analysis results
 */
function analyzeSocialSentiment(socialData) {
  if (!socialData || Object.keys(socialData).length === 0) {
    return null;
  }

  // Extract sentiment metrics
  const positive = socialData.positive_ratio || 0;
  const negative = socialData.negative_ratio || 0;
  const neutral = socialData.neutral_ratio || 0;
  const postVolume = socialData.post_volume || 0;

  // Determine signal
  let signal = "neutral";
  if (positive > negative && positive > neutral && positive > 0.4) {
    signal = "bullish";
  } else if (negative > positive && negative > neutral && negative > 0.4) {
    signal = "bearish";
  }

  // Create details string
  const details = `Social Sentiment: ${positive.toFixed(2) * 100}% positive, ${
    negative.toFixed(2) * 100
  }% negative, ${
    neutral.toFixed(2) * 100
  }% neutral. Volume: ${postVolume} posts.`;

  return {
    signal: signal,
    details: details,
  };
}
