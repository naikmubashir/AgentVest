/**
 * Constants and utilities related to analysts configuration.
 */

import { warrenBuffettAgent } from "../agents/warren_buffett.js";
// Use simplified Charlie Munger agent for testing
// import { charlieMungerAgent } from "../agents/charlie_munger.js";
import { charlieMungerAgent } from "../agents/charlie_munger_simple.js";
import { fundamentalsAnalystAgent } from "../agents/fundamentals.js";
import { technicalAnalystAgent } from "../agents/technicals.js";
import { sentimentAnalystAgent } from "../agents/sentiment.js";
import { aswathDamodaranAgent } from "../agents/aswath_damodaran.js";
import { benGrahamAgent } from "../agents/ben_graham.js";
import { billAckmanAgent } from "../agents/bill_ackman.js";
import { cathieWoodAgent } from "../agents/cathie_wood.js";
import { michaelBurryAgent } from "../agents/michael_burry.js";
import { philFisherAgent } from "../agents/phil_fisher.js";
import { peterLynchAgent } from "../agents/peter_lynch.js";
import { stanleyDruckenmillerAgent } from "../agents/stanley_druckenmiller.js";
import { valuationAnalystAgent } from "../agents/valuation.js";
import { rakeshJhunjhunwalaAgent } from "../agents/rakesh_jhunjhunwala.js";
import { mohnishPabraiAgent } from "../agents/mohnish_pabrai.js";
import { portfolioManagementAgent } from "../agents/portfolio_manager.js";
import { riskManagementAgent } from "../agents/risk_manager.js";

// Define analyst configuration - single source of truth
export const ANALYST_CONFIG = {
  warren_buffett: {
    display_name: "Warren Buffett",
    description: "The Oracle of Omaha",
    investing_style:
      "Seeks wonderful companies at a fair price, focusing on long-term value and competitive advantages.",
    agent_func: warrenBuffettAgent,
    type: "analyst",
    order: 0,
  },
  charlie_munger: {
    display_name: "Charlie Munger",
    description: "The Rational Investor",
    investing_style:
      "Uses mental models and focuses on high-quality businesses with strong competitive advantages.",
    agent_func: charlieMungerAgent,
    type: "analyst",
    order: 1,
  },
  fundamentals_analyst: {
    display_name: "Fundamentals Analyst",
    description: "Financial Metrics Expert",
    investing_style:
      "Analyzes core financial metrics like profitability, growth, and valuation.",
    agent_func: fundamentalsAnalystAgent,
    type: "analyst",
    order: 2,
  },
  technicals_analyst: {
    display_name: "Technical Analyst",
    description: "Chart Pattern Specialist",
    investing_style:
      "Examines price movements, trends, and technical indicators to identify trading opportunities.",
    agent_func: technicalAnalystAgent,
    type: "analyst",
    order: 3,
  },
  sentiment_analyst: {
    display_name: "Sentiment Analyst",
    description: "Market Sentiment Expert",
    investing_style:
      "Analyzes news and social media to gauge market sentiment and investor psychology.",
    agent_func: sentimentAnalystAgent,
    type: "analyst",
    order: 4,
  },
  aswath_damodaran: {
    display_name: "Aswath Damodaran",
    description: "The Dean of Valuation",
    investing_style:
      "Focuses on intrinsic value and financial metrics to assess investment opportunities through rigorous valuation analysis.",
    agent_func: aswathDamodaranAgent,
    type: "analyst",
    order: 5,
  },
  ben_graham: {
    display_name: "Ben Graham",
    description: "The Father of Value Investing",
    investing_style:
      "Emphasizes a margin of safety and invests in undervalued companies with strong fundamentals through systematic value analysis.",
    agent_func: benGrahamAgent,
    type: "analyst",
    order: 6,
  },
  bill_ackman: {
    display_name: "Bill Ackman",
    description: "The Activist Investor",
    investing_style:
      "Takes concentrated positions in high-quality businesses and pushes for changes to unlock shareholder value.",
    agent_func: billAckmanAgent,
    type: "analyst",
    order: 7,
  },
  cathie_wood: {
    display_name: "Cathie Wood",
    description: "The Innovation Investor",
    investing_style:
      "Focuses on disruptive innovation and high-growth technology companies with transformative potential.",
    agent_func: cathieWoodAgent,
    type: "analyst",
    order: 8,
  },
  michael_burry: {
    display_name: "Michael Burry",
    description: "The Big Short",
    investing_style:
      "Contrarian investor who identifies market bubbles and inefficiencies through deep fundamental research.",
    agent_func: michaelBurryAgent,
    type: "analyst",
    order: 9,
  },
  phil_fisher: {
    display_name: "Phil Fisher",
    description: "The Growth Investor",
    investing_style:
      "Focuses on high-quality growth companies with strong management and long-term competitive advantages through scuttlebutt research.",
    agent_func: philFisherAgent,
    type: "analyst",
    order: 10,
  },
  peter_lynch: {
    display_name: "Peter Lynch",
    description: "The Practical Investor",
    investing_style:
      "Believes in investing in what you know and categorizing stocks by their growth characteristics with a practical approach.",
    agent_func: peterLynchAgent,
    type: "analyst",
    order: 11,
  },
  mohnish_pabrai: {
    display_name: "Mohnish Pabrai",
    description: "The Clone Investor",
    investing_style:
      "Focuses on low-risk, high-uncertainty opportunities with a concentrated portfolio and cloning strategies of successful investors.",
    agent_func: mohnishPabraiAgent,
    type: "analyst",
    order: 12,
  },
  rakesh_jhunjhunwala: {
    display_name: "Rakesh Jhunjhunwala",
    description: "The Indian Bull",
    investing_style:
      "Combines fundamental analysis with calculated risk-taking, focusing on emerging market opportunities with long-term growth potential.",
    agent_func: rakeshJhunjhunwalaAgent,
    type: "analyst",
    order: 13,
  },
  stanley_druckenmiller: {
    display_name: "Stanley Druckenmiller",
    description: "The Macro Trader",
    investing_style:
      "Emphasizes macroeconomic themes, concentrated bets with high conviction, and willingness to adjust positions based on changing market conditions.",
    agent_func: stanleyDruckenmillerAgent,
    type: "analyst",
    order: 14,
  },
  valuation_analyst: {
    display_name: "Valuation Analyst",
    description: "The Value Estimator",
    investing_style:
      "Applies multiple valuation methodologies to determine intrinsic value and margin of safety with a quantitative approach.",
    agent_func: valuationAnalystAgent,
    type: "analyst",
    order: 15,
  },
  portfolio_manager: {
    display_name: "Portfolio Manager",
    description: "Portfolio Optimization Specialist",
    investing_style:
      "Balances risk and return across the portfolio while implementing the analysts' recommendations.",
    agent_func: portfolioManagementAgent,
    type: "manager",
    order: 90,
  },
  risk_manager: {
    display_name: "Risk Manager",
    description: "Risk Assessment Specialist",
    investing_style:
      "Evaluates potential risks and ensures the portfolio stays within risk tolerance guidelines.",
    agent_func: riskManagementAgent,
    type: "manager",
    order: 91,
  },
  /*
  "michael_burry": {
    "display_name": "Michael Burry",
    "description": "The Big Short",
    "investing_style": "Contrarian investor who identifies market bubbles and inefficiencies through deep fundamental research.",
    "agent_func": michaelBurryAgent,
    "type": "analyst",
    "order": 9
  },
  */
  // Additional analysts will be uncommented as they are implemented
};

// Order of analysts for sequential processing
export const ANALYST_ORDER = [
  "warren_buffett",
  "charlie_munger",
  "fundamentals_analyst",
  "technicals_analyst",
  "sentiment_analyst",
  "aswath_damodaran",
  "ben_graham",
  "bill_ackman",
  "cathie_wood",
  "michael_burry",
  "phil_fisher",
  "peter_lynch",
  "mohnish_pabrai",
  "rakesh_jhunjhunwala",
  "stanley_druckenmiller",
  "valuation_analyst",
  "portfolio_manager",
  "risk_manager",
];

/**
 * Get the agent nodes for the workflow graph
 *
 * @param {Array<string>|null} selectedAgents - Which agents to use in the analysis
 * @returns {Array<Function>} - Array of agent functions in the correct order
 */
export function getAnalystNodes(selectedAgents) {
  // If no agents are selected, use all available analysts
  if (!selectedAgents || selectedAgents.length === 0) {
    return Object.values(ANALYST_CONFIG)
      .filter((analyst) => analyst.agent_func)
      .sort((a, b) => a.order - b.order)
      .map((analyst) => analyst.agent_func);
  }

  // Otherwise, filter and sort the analysts based on selection
  const filteredAgents = [];

  for (const analystId of selectedAgents) {
    const analystConfig = ANALYST_CONFIG[analystId];
    if (analystConfig && analystConfig.agent_func) {
      filteredAgents.push(analystConfig.agent_func);
    }
  }

  return filteredAgents;
}

/**
 * Get the list of available agents for the UI
 *
 * @returns {Array<Object>} List of agent configurations
 */
export function getAgentsList() {
  return Object.entries(ANALYST_CONFIG).map(([id, config]) => ({
    id,
    display_name: config.display_name,
    description: config.description,
    investing_style: config.investing_style,
    type: config.type,
  }));
}
