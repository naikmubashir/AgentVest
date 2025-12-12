#!/usr/bin/env python3
"""Test all agents to identify errors after Binance API migration."""

from dotenv import load_dotenv
load_dotenv()  # Load environment variables first

from src.graph.state import AgentState
from datetime import datetime, timedelta
import traceback

# Create proper test state
end_date = datetime.now().strftime('%Y-%m-%d')
start_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')

def create_test_state():
    # Create test state with proper structure
    from datetime import datetime, timedelta
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
    return state  # Added return statement!

# Test all agents
agents_to_test = [
    ('fundamentals', 'fundamentals_analyst_agent'),
    ('sentiment', 'sentiment_analyst_agent'),
    ('technicals', 'technical_analyst_agent'),
    ('valuation', 'valuation_analyst_agent'),
    ('warren_buffett', 'warren_buffett_agent'),
    ('peter_lynch', 'peter_lynch_agent'),
    ('cathie_wood', 'cathie_wood_agent'),
    ('charlie_munger', 'charlie_munger_agent'),
    ('michael_burry', 'michael_burry_agent'),
    ('stanley_druckenmiller', 'stanley_druckenmiller_agent'),
]

print("=" * 80)
print("TESTING ALL AGENTS AFTER BINANCE API MIGRATION")
print("=" * 80)

for module_name, func_name in agents_to_test:
    print(f"\nTesting {func_name}...")
    try:
        module = __import__(f'src.agents.{module_name}', fromlist=[func_name])
        agent_func = getattr(module, func_name)
        state = create_test_state()
        result = agent_func(state)
        print(f'  ✅ SUCCESS')
    except Exception as e:
        print(f'  ❌ ERROR: {type(e).__name__}: {str(e)[:100]}')
        # Print full traceback for peter_lynch to debug
        if func_name == 'peter_lynch_agent':
            print(traceback.format_exc())
        else:
            # Print relevant traceback line
            tb = traceback.format_exc()
            for line in tb.split('\n'):
                if 'agents/' in line and 'File' in line:
                    print(f'     {line.strip()}')
                    break

print("\n" + "=" * 80)
