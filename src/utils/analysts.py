"""Constants and utilities related to analysts configuration."""

from src.agents import portfolio_manager
from src.agents.aswath_damodaran import aswath_damodaran_agent
from src.agents.ben_graham import ben_graham_agent
from src.agents.bill_ackman import bill_ackman_agent
from src.agents.cathie_wood import cathie_wood_agent
from src.agents.charlie_munger import charlie_munger_agent
from src.agents.fundamentals import fundamentals_analyst_agent
from src.agents.michael_burry import michael_burry_agent
from src.agents.phil_fisher import phil_fisher_agent
from src.agents.peter_lynch import peter_lynch_agent
from src.agents.sentiment import sentiment_analyst_agent
from src.agents.stanley_druckenmiller import stanley_druckenmiller_agent
from src.agents.technicals import technical_analyst_agent
from src.agents.valuation import valuation_analyst_agent
from src.agents.warren_buffett import warren_buffett_agent
from src.agents.rakesh_jhunjhunwala import rakesh_jhunjhunwala_agent
from src.agents.mohnish_pabrai import mohnish_pabrai_agent

# Define analyst configuration - single source of truth
# Updated for crypto-focused personalities while keeping original file names for code stability
ANALYST_CONFIG = {
    "aswath_damodaran": {
        "display_name": "Lyn Alden",
        "description": "The Macro & Crypto Analyst",
        "investing_style": "Combines rigorous macroeconomic analysis with deep understanding of crypto fundamentals, focusing on monetary policy and technology adoption cycles.",
        "agent_func": aswath_damodaran_agent,
        "type": "analyst",
        "order": 0,
    },
    "ben_graham": {
        "display_name": "Willy Woo",
        "description": "The On-Chain Analyst",
        "investing_style": "Emphasizes on-chain metrics and data-driven analysis to identify undervalued cryptocurrencies with strong network fundamentals.",
        "agent_func": ben_graham_agent,
        "type": "analyst",
        "order": 1,
    },
    "bill_ackman": {
        "display_name": "Barry Silbert",
        "description": "The Crypto Advocate",
        "investing_style": "Actively promotes cryptocurrency adoption and invests in blockchain companies and digital assets through strategic institutional positioning.",
        "agent_func": bill_ackman_agent,
        "type": "analyst",
        "order": 2,
    },
    "cathie_wood": {
        "display_name": "Raoul Pal",
        "description": "The Crypto Macro Bull",
        "investing_style": "Focuses on exponential growth and network effects in crypto, investing in projects that benefit from macro liquidity trends and technological disruption.",
        "agent_func": cathie_wood_agent,
        "type": "analyst",
        "order": 3,
    },
    "charlie_munger": {
        "display_name": "Nick Szabo",
        "description": "The Cryptographic Rationalist",
        "investing_style": "Advocates for decentralized systems with focus on security, smart contracts, and long-term value through rational protocol analysis.",
        "agent_func": charlie_munger_agent,
        "type": "analyst",
        "order": 4,
    },
    "michael_burry": {
        "display_name": "Arthur Hayes",
        "description": "The Crypto Contrarian",
        "investing_style": "Makes bold contrarian bets on crypto trends, often leveraging macro insights to identify market dislocations and overvalued narratives.",
        "agent_func": michael_burry_agent,
        "type": "analyst",
        "order": 5,
    },
    "mohnish_pabrai": {
        "display_name": "Pomp (Anthony Pompliano)",
        "description": "The Bitcoin Maximalist",
        "investing_style": "Focuses on Bitcoin as digital gold with long-term value investment approach, emphasizing sound money principles and adoption metrics.",
        "agent_func": mohnish_pabrai_agent,
        "type": "analyst",
        "order": 6,
    },
    "peter_lynch": {
        "display_name": "Michael Saylor",
        "description": "The Bitcoin Strategist",
        "investing_style": "Invests in Bitcoin with deep conviction based on understanding monetary debasement and digital scarcity, using a 'study what you hold' strategy.",
        "agent_func": peter_lynch_agent,
        "type": "analyst",
        "order": 6,
    },
    "phil_fisher": {
        "display_name": "Chris Burniske",
        "description": "The Crypto Network Analyst",
        "investing_style": "Emphasizes investing in crypto protocols with strong network effects and innovative technology, focusing on long-term growth through fundamental research.",
        "agent_func": phil_fisher_agent,
        "type": "analyst",
        "order": 7,
    },
    "rakesh_jhunjhunwala": {
        "display_name": "Changpeng Zhao (CZ)",
        "description": "The Binance Builder",
        "investing_style": "Leverages ecosystem growth and platform economics to invest in high-growth crypto projects, particularly in emerging DeFi and Web3 sectors.",
        "agent_func": rakesh_jhunjhunwala_agent,
        "type": "analyst",
        "order": 8,
    },
    "stanley_druckenmiller": {
        "display_name": "Mike Novogratz",
        "description": "The Institutional Crypto Investor",
        "investing_style": "Focuses on macro trends and institutional adoption of crypto, making strategic bets on Bitcoin, Ethereum, and major altcoins through top-down analysis.",
        "agent_func": stanley_druckenmiller_agent,
        "type": "analyst",
        "order": 9,
    },
    "warren_buffett": {
        "display_name": "Vitalik Buterin",
        "description": "The Ethereum Visionary",
        "investing_style": "Seeks protocols with strong fundamentals, network effects, and sustainable competitive advantages through long-term value creation and technological innovation.",
        "agent_func": warren_buffett_agent,
        "type": "analyst",
        "order": 10,
    },
    "technical_analyst": {
        "display_name": "Technical Analyst",
        "description": "Crypto Chart Pattern Specialist",
        "investing_style": "Focuses on crypto chart patterns, volume analysis, and market trends to make trading decisions using technical indicators and price action.",
        "agent_func": technical_analyst_agent,
        "type": "analyst",
        "order": 11,
    },
    "fundamentals_analyst": {
        "display_name": "Fundamentals Analyst",
        "description": "Crypto Fundamentals Specialist",
        "investing_style": "Analyzes tokenomics, network metrics, and protocol economics to assess the intrinsic value of cryptocurrencies through fundamental analysis.",
        "agent_func": fundamentals_analyst_agent,
        "type": "analyst",
        "order": 12,
    },
    "sentiment_analyst": {
        "display_name": "Sentiment Analyst",
        "description": "Crypto Market Sentiment Specialist",
        "investing_style": "Gauges social media sentiment, whale movements, and market psychology to predict crypto price movements and identify opportunities.",
        "agent_func": sentiment_analyst_agent,
        "type": "analyst",
        "order": 13,
    },
    "valuation_analyst": {
        "display_name": "Valuation Analyst",
        "description": "Crypto Valuation Specialist",
        "investing_style": "Specializes in determining fair value of crypto assets using network valuation models, tokenomics analysis, and comparative metrics.",
        "agent_func": valuation_analyst_agent,
        "type": "analyst",
        "order": 14,
    },
}

# Derive ANALYST_ORDER from ANALYST_CONFIG for backwards compatibility
ANALYST_ORDER = [(config["display_name"], key) for key, config in sorted(ANALYST_CONFIG.items(), key=lambda x: x[1]["order"])]


def get_analyst_nodes():
    """Get the mapping of analyst keys to their (node_name, agent_func) tuples."""
    return {key: (f"{key}_agent", config["agent_func"]) for key, config in ANALYST_CONFIG.items()}


def get_agents_list():
    """Get the list of agents for API responses."""
    return [
        {
            "key": key,
            "display_name": config["display_name"],
            "description": config["description"],
            "investing_style": config["investing_style"],
            "order": config["order"]
        }
        for key, config in sorted(ANALYST_CONFIG.items(), key=lambda x: x[1]["order"])
    ]
