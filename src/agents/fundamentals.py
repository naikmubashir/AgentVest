from langchain_core.messages import HumanMessage
from src.graph.state import AgentState, show_agent_reasoning
from src.utils.api_key import get_api_key_from_state
from src.utils.progress import progress
import json

from src.tools.api import get_financial_metrics, get_prices, prices_to_df


##### Crypto Fundamental Agent #####
def fundamentals_analyst_agent(state: AgentState, agent_id: str = "fundamentals_analyst_agent"):
    """
    Analyzes crypto-native fundamentals and generates trading signals for multiple tickers.
    
    Crypto fundamentals are different from traditional stocks:
    - No traditional financial statements
    - Focus on market metrics: volume, volatility, price momentum
    - Network adoption and trading activity
    - Market cap and supply dynamics
    """
    data = state["data"]
    end_date = data["end_date"]
    start_date = data["start_date"]
    tickers = data["tickers"]
    api_key = get_api_key_from_state(state, "BINANCE_API_KEY")
    
    # Initialize fundamental analysis for each ticker
    fundamental_analysis = {}

    for ticker in tickers:
        progress.update_status(agent_id, ticker, "Fetching crypto metrics")

        # Get the crypto market metrics (24hr stats from Binance)
        financial_metrics = get_financial_metrics(
            symbol=ticker,
            end_date=end_date,
            period="24h",
            limit=1,
            api_key=api_key,
        )

        if not financial_metrics:
            progress.update_status(agent_id, ticker, "Failed: No crypto metrics found")
            continue

        # Get price history for trend analysis
        prices = get_prices(
            symbol=ticker,
            start_date=start_date,
            end_date=end_date,
            interval="1d",
            api_key=api_key,
        )
        
        if not prices:
            progress.update_status(agent_id, ticker, "Failed: No price data found")
            continue
            
        prices_df = prices_to_df(prices)

        # Pull the most recent metrics
        metrics = financial_metrics[0]

        # Initialize signals list for different fundamental aspects
        signals = []
        reasoning = {}

        progress.update_status(agent_id, ticker, "Analyzing trading activity")
        # 1. Trading Activity & Volume Analysis (replaces profitability for stocks)
        market_cap = metrics.market_cap
        # Using return_on_equity as proxy for 24h return (set in api.py)
        price_change_24h = metrics.return_on_equity if metrics.return_on_equity else 0.0
        
        # Calculate volume trend (recent vs average)
        avg_volume = prices_df['volume'].tail(30).mean() if len(prices_df) >= 30 else prices_df['volume'].mean()
        recent_volume = prices_df['volume'].tail(3).mean()
        volume_ratio = recent_volume / avg_volume if avg_volume > 0 else 1.0
        
        activity_score = 0
        if volume_ratio > 1.2:  # Volume increasing by 20%+
            activity_score += 1
        if abs(price_change_24h) > 0.02:  # Significant 24h price movement (>2%)
            activity_score += 1
        if market_cap and market_cap > 1_000_000_000:  # Market cap > $1B indicates mature crypto
            activity_score += 1

        signals.append("bullish" if activity_score >= 2 else "bearish" if activity_score == 0 else "neutral")
        reasoning["trading_activity_signal"] = {
            "signal": signals[0],
            "details": f"24h Change: {price_change_24h:.2%}, Volume Ratio: {volume_ratio:.2f}, Market Cap: ${market_cap/1e9:.2f}B" if market_cap else f"24h Change: {price_change_24h:.2%}, Volume Ratio: {volume_ratio:.2f}",
        }

        progress.update_status(agent_id, ticker, "Analyzing price momentum")
        # 2. Price Momentum & Trend Analysis (replaces growth for stocks)
        # Calculate moving averages
        if len(prices_df) >= 50:
            ma_20 = prices_df['close'].tail(20).mean()
            ma_50 = prices_df['close'].tail(50).mean()
            current_price = prices_df['close'].iloc[-1]
            
            momentum_score = 0
            if current_price > ma_20:  # Price above 20-day MA
                momentum_score += 1
            if current_price > ma_50:  # Price above 50-day MA
                momentum_score += 1
            if ma_20 > ma_50:  # 20-day MA above 50-day MA (golden cross direction)
                momentum_score += 1
            
            signals.append("bullish" if momentum_score >= 2 else "bearish" if momentum_score == 0 else "neutral")
            reasoning["momentum_signal"] = {
                "signal": signals[1],
                "details": f"Price: ${current_price:.2f}, MA20: ${ma_20:.2f}, MA50: ${ma_50:.2f}",
            }
        else:
            signals.append("neutral")
            reasoning["momentum_signal"] = {
                "signal": "neutral",
                "details": "Insufficient data for momentum analysis",
            }

        progress.update_status(agent_id, ticker, "Analyzing volatility")
        # 3. Volatility Analysis (replaces financial health for stocks)
        # Lower volatility in crypto can indicate stability and maturity
        daily_returns = prices_df['close'].pct_change().dropna()
        volatility_30d = daily_returns.tail(30).std() if len(daily_returns) >= 30 else daily_returns.std()
        
        # For crypto, moderate volatility is acceptable; extreme is risky
        volatility_score = 0
        if volatility_30d < 0.05:  # Very low volatility (<5% daily)
            volatility_score = 2  # Stable, mature crypto
        elif volatility_30d < 0.08:  # Moderate volatility (5-8% daily)
            volatility_score = 1  # Acceptable
        else:  # High volatility (>8% daily)
            volatility_score = 0  # Risky
        
        signals.append("bullish" if volatility_score >= 1 else "bearish")
        reasoning["volatility_signal"] = {
            "signal": signals[2],
            "details": f"30-day Volatility: {volatility_30d:.2%}",
        }

        progress.update_status(agent_id, ticker, "Analyzing price trends")
        # 4. Short-term vs Long-term Performance
        price_change_7d = (prices_df['close'].iloc[-1] / prices_df['close'].iloc[-7] - 1) if len(prices_df) >= 7 else 0
        price_change_30d = (prices_df['close'].iloc[-1] / prices_df['close'].iloc[-30] - 1) if len(prices_df) >= 30 else 0
        
        performance_score = 0
        if price_change_7d > 0:  # Positive 7-day performance
            performance_score += 1
        if price_change_30d > 0:  # Positive 30-day performance
            performance_score += 1
        if price_change_7d > price_change_30d:  # Accelerating uptrend
            performance_score += 1

        signals.append("bullish" if performance_score >= 2 else "bearish" if performance_score == 0 else "neutral")
        reasoning["performance_signal"] = {
            "signal": signals[3],
            "details": f"7-day: {price_change_7d:.2%}, 30-day: {price_change_30d:.2%}",
        }

        progress.update_status(agent_id, ticker, "Calculating final signal")
        # Determine overall signal
        bullish_signals = signals.count("bullish")
        bearish_signals = signals.count("bearish")

        if bullish_signals > bearish_signals:
            overall_signal = "bullish"
        elif bearish_signals > bullish_signals:
            overall_signal = "bearish"
        else:
            overall_signal = "neutral"

        # Calculate confidence level
        total_signals = len(signals)
        confidence = round(max(bullish_signals, bearish_signals) / total_signals, 2) * 100

        fundamental_analysis[ticker] = {
            "signal": overall_signal,
            "confidence": confidence,
            "reasoning": reasoning,
        }

        # Format reasoning as plain text for display
        reasoning_text = f"Signal: {overall_signal.upper()} (Confidence: {confidence}%)\n\n"
        for key, value in reasoning.items():
            signal_name = key.replace("_", " ").title()
            reasoning_text += f"{signal_name}: {value['signal'].upper()}\n{value['details']}\n\n"
        
        progress.update_status(agent_id, ticker, "Done", analysis=reasoning_text.strip())

    # Create the fundamental analysis message
    message = HumanMessage(
        content=json.dumps(fundamental_analysis),
        name=agent_id,
    )

    # Print the reasoning if the flag is set
    if state["metadata"]["show_reasoning"]:
        show_agent_reasoning(fundamental_analysis, "Crypto Fundamental Analysis Agent")

    # Add the signal to the analyst_signals list
    state["data"]["analyst_signals"][agent_id] = fundamental_analysis

    progress.update_status(agent_id, None, "Done")
    
    return {
        "messages": [message],
        "data": data,
    }
