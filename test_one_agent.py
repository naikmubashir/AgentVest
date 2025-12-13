#!/usr/bin/env python3
"""Test single agent quickly"""

import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.graph.state import AgentState
from src.agents.fundamentals import fundamentals_analyst_agent

# Create test state
end_date = datetime.now().strftime("%Y-%m-%d")
start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

state = AgentState(
    messages=[],
    data={
        'tickers': ['BTCUSDT'],
        'analyst_signals': {},
        'show_reasoning': False,
        'end_date': end_date,
        'start_date': start_date
    },
    metadata={
        'BINANCE_API_KEY': None,
        'show_reasoning': False,
        'model_name': 'gemini-2.5-flash-preview-05-20',
        'model_provider': 'Google'
    }
)

print("Testing fundamentals_analyst_agent with Gemini API...")
try:
    result = fundamentals_analyst_agent(state)
    print("  ✅ SUCCESS!")
    print(f"\nResult keys: {result.keys()}")
    if 'data' in result and result['data']:
        print(f"Data keys: {result['data'].keys()}")
        if 'analyst_signals' in result['data']:
            print(f"Analyst signals: {result['data']['analyst_signals'].keys()}")
except Exception as e:
    print(f"  ❌ ERROR: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
