from langchain_core.messages import HumanMessage
from src.graph.state import AgentState, show_agent_reasoning
from src.utils.progress import progress
import pandas as pd
import numpy as np
import json
from src.utils.api_key import get_api_key_from_state
from src.tools.api import get_company_news, get_prices, prices_to_df


##### Crypto Sentiment Agent #####
def sentiment_analyst_agent(state: AgentState, agent_id: str = "sentiment_analyst_agent"):
    """
    Analyzes cryptocurrency market sentiment and generates trading signals for multiple tickers.
    
    For crypto, sentiment is derived from:
    1. Trading activity patterns (volume spikes, price volatility)
    2. Market news and events (adapted from company news function)
    3. Price momentum as sentiment proxy
    
    Note: Insider trading doesn't exist in crypto markets.
    """
    data = state.get("data", {})
    end_date = data.get("end_date")
    start_date = data.get("start_date")
    tickers = data.get("tickers")
    api_key = get_api_key_from_state(state, "BINANCE_API_KEY")
    
    # Initialize sentiment analysis for each ticker
    sentiment_analysis = {}

    for ticker in tickers:
        progress.update_status(agent_id, ticker, "Fetching price data for sentiment analysis")

        # Get price data for volume and volatility analysis
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

        progress.update_status(agent_id, ticker, "Analyzing trading activity sentiment")

        # 1. Trading Activity Sentiment (replaces insider trading)
        # Analyze volume patterns - increasing volume suggests growing interest
        recent_volume = prices_df['volume'].tail(7).mean()
        historical_volume = prices_df['volume'].head(-7).mean() if len(prices_df) > 14 else prices_df['volume'].mean()
        volume_ratio = recent_volume / historical_volume if historical_volume > 0 else 1.0
        
        # Analyze price momentum
        recent_returns = prices_df['close'].pct_change().tail(7).mean()
        
        # Volume + positive returns = bullish, volume + negative returns = bearish
        trading_signals = []
        if volume_ratio > 1.2:  # High volume
            if recent_returns > 0:
                trading_signals.extend(["bullish"] * 3)  # Strong bullish signal
            else:
                trading_signals.extend(["bearish"] * 3)  # Strong bearish signal (selling pressure)
        elif volume_ratio > 1.0:  # Moderate volume increase
            if recent_returns > 0:
                trading_signals.append("bullish")
            else:
                trading_signals.append("bearish")
        else:  # Low volume
            trading_signals.append("neutral")  # Indecisive market

        progress.update_status(agent_id, ticker, "Fetching crypto news")

        # 2. Get crypto news/trade data (adapted from get_company_news)
        company_news = get_company_news(symbol=ticker, end_date=end_date, limit=100, api_key=api_key)

        # Note: get_company_news for crypto returns recent trades as news items
        # We can use this as a proxy for market activity
        news_signals = []
        if company_news:
            # Analyze the "news" (which is really trade data for crypto)
            for news_item in company_news:
                sentiment_word = news_item.title.split()[2]  # "SELL" or "BUY" from title
                if "BUY" in sentiment_word:
                    news_signals.append("bullish")
                elif "SELL" in sentiment_word:
                    news_signals.append("bearish")
                else:
                    news_signals.append("neutral")
        else:
            # If no news data, use price momentum as proxy
            if recent_returns > 0.02:  # >2% positive return
                news_signals.extend(["bullish"] * 2)
            elif recent_returns < -0.02:  # >2% negative return
                news_signals.extend(["bearish"] * 2)
            else:
                news_signals.append("neutral")
        
        progress.update_status(agent_id, ticker, "Analyzing volatility sentiment")
        
        # 3. Volatility Sentiment
        # High volatility can be bullish (high interest) or bearish (panic)
        # Context from price direction determines interpretation
        daily_returns = prices_df['close'].pct_change().dropna()
        volatility_7d = daily_returns.tail(7).std()
        
        volatility_signals = []
        if volatility_7d > 0.05:  # High volatility (>5% daily)
            if recent_returns > 0:
                volatility_signals.append("bullish")  # Volatile rally
            else:
                volatility_signals.extend(["bearish"] * 2)  # Volatile selloff (more bearish)
        elif volatility_7d < 0.02:  # Low volatility (<2% daily)
            volatility_signals.append("neutral")  # Calm, consolidating
        else:  # Moderate volatility
            if recent_returns > 0:
                volatility_signals.append("bullish")
            else:
                volatility_signals.append("neutral")
        
        progress.update_status(agent_id, ticker, "Combining sentiment signals")
        
        # Combine signals from all sources with weights
        trading_weight = 0.4
        news_weight = 0.3
        volatility_weight = 0.3
        
        # Calculate weighted signal counts
        bullish_signals = (
            trading_signals.count("bullish") * trading_weight +
            news_signals.count("bullish") * news_weight +
            volatility_signals.count("bullish") * volatility_weight
        )
        bearish_signals = (
            trading_signals.count("bearish") * trading_weight +
            news_signals.count("bearish") * news_weight +
            volatility_signals.count("bearish") * volatility_weight
        )

        if bullish_signals > bearish_signals:
            overall_signal = "bullish"
        elif bearish_signals > bullish_signals:
            overall_signal = "bearish"
        else:
            overall_signal = "neutral"

        # Calculate confidence level based on the weighted proportion
        total_weighted_signals = (
            len(trading_signals) * trading_weight + 
            len(news_signals) * news_weight +
            len(volatility_signals) * volatility_weight
        )
        confidence = 0  # Default confidence when there are no signals
        if total_weighted_signals > 0:
            confidence = round((max(bullish_signals, bearish_signals) / total_weighted_signals) * 100, 2)
        
        # Create structured reasoning
        reasoning = {
            "trading_activity": {
                "signal": "bullish" if trading_signals.count("bullish") > trading_signals.count("bearish") else 
                         "bearish" if trading_signals.count("bearish") > trading_signals.count("bullish") else "neutral",
                "confidence": round((max(trading_signals.count("bullish"), trading_signals.count("bearish")) / max(len(trading_signals), 1)) * 100),
                "metrics": {
                    "volume_ratio": round(volume_ratio, 2),
                    "recent_return": f"{recent_returns:.2%}",
                    "bullish_signals": trading_signals.count("bullish"),
                    "bearish_signals": trading_signals.count("bearish"),
                    "weight": trading_weight,
                    "weighted_bullish": round(trading_signals.count("bullish") * trading_weight, 1),
                    "weighted_bearish": round(trading_signals.count("bearish") * trading_weight, 1),
                }
            },
            "market_activity": {
                "signal": "bullish" if news_signals.count("bullish") > news_signals.count("bearish") else 
                         "bearish" if news_signals.count("bearish") > news_signals.count("bullish") else "neutral",
                "confidence": round((max(news_signals.count("bullish"), news_signals.count("bearish")) / max(len(news_signals), 1)) * 100),
                "metrics": {
                    "total_events": len(news_signals),
                    "bullish_events": news_signals.count("bullish"),
                    "bearish_events": news_signals.count("bearish"),
                    "neutral_events": news_signals.count("neutral"),
                    "weight": news_weight,
                    "weighted_bullish": round(news_signals.count("bullish") * news_weight, 1),
                    "weighted_bearish": round(news_signals.count("bearish") * news_weight, 1),
                }
            },
            "volatility_sentiment": {
                "signal": "bullish" if volatility_signals.count("bullish") > volatility_signals.count("bearish") else 
                         "bearish" if volatility_signals.count("bearish") > volatility_signals.count("bullish") else "neutral",
                "confidence": round((max(volatility_signals.count("bullish"), volatility_signals.count("bearish")) / max(len(volatility_signals), 1)) * 100),
                "metrics": {
                    "volatility_7d": f"{volatility_7d:.2%}",
                    "bullish_signals": volatility_signals.count("bullish"),
                    "bearish_signals": volatility_signals.count("bearish"),
                    "weight": volatility_weight,
                    "weighted_bullish": round(volatility_signals.count("bullish") * volatility_weight, 1),
                    "weighted_bearish": round(volatility_signals.count("bearish") * volatility_weight, 1),
                }
            },
            "combined_analysis": {
                "total_weighted_bullish": round(bullish_signals, 1),
                "total_weighted_bearish": round(bearish_signals, 1),
                "signal_determination": f"{'Bullish' if bullish_signals > bearish_signals else 'Bearish' if bearish_signals > bullish_signals else 'Neutral'} based on weighted signal comparison"
            }
        }

        sentiment_analysis[ticker] = {
            "signal": overall_signal,
            "confidence": confidence,
            "reasoning": reasoning,
        }

        progress.update_status(agent_id, ticker, "Done", analysis=json.dumps(reasoning, indent=4))

    # Create the sentiment message
    message = HumanMessage(
        content=json.dumps(sentiment_analysis),
        name=agent_id,
    )

    # Print the reasoning if the flag is set
    if state["metadata"]["show_reasoning"]:
        show_agent_reasoning(sentiment_analysis, "Sentiment Analysis Agent")

    # Add the signal to the analyst_signals list
    state["data"]["analyst_signals"][agent_id] = sentiment_analysis

    progress.update_status(agent_id, None, "Done")

    return {
        "messages": [message],
        "data": data,
    }
