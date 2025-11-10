import datetime
from datetime import timedelta
import os
import pandas as pd
import requests
import time

from src.data.cache import get_cache
from src.data.models import (
    CompanyNews,
    CompanyNewsResponse,
    FinancialMetrics,
    FinancialMetricsResponse,
    Price,
    PriceResponse,
    LineItem,
    LineItemResponse,
    InsiderTrade,
    InsiderTradeResponse,
    CompanyFactsResponse,
)

# Global cache instance
_cache = get_cache()

# Binance API Configuration
BINANCE_BASE_URL = "https://api.binance.com"


def _make_api_request(url: str, headers: dict = None, method: str = "GET", json_data: dict = None, params: dict = None, max_retries: int = 3) -> requests.Response:
    """
    Make an API request with rate limiting handling and moderate backoff.
    
    Args:
        url: The URL to request
        headers: Headers to include in the request (optional for Binance public endpoints)
        method: HTTP method (GET or POST)
        json_data: JSON data for POST requests
        params: Query parameters for GET requests
        max_retries: Maximum number of retries (default: 3)
    
    Returns:
        requests.Response: The response object
    
    Raises:
        Exception: If the request fails with a non-429 error
    """
    if headers is None:
        headers = {}
        
    for attempt in range(max_retries + 1):  # +1 for initial attempt
        if method.upper() == "POST":
            response = requests.post(url, headers=headers, json=json_data)
        else:
            response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 429 and attempt < max_retries:
            # Linear backoff: 60s, 90s, 120s, 150s...
            delay = 60 + (30 * attempt)
            print(f"Rate limited (429). Attempt {attempt + 1}/{max_retries + 1}. Waiting {delay}s before retrying...")
            time.sleep(delay)
            continue
        
        # Return the response (whether success, other errors, or final 429)
        return response


def get_prices(symbol: str, start_date: str, end_date: str, interval: str = "1d", api_key: str = None) -> list[Price]:
    """
    Fetch cryptocurrency price data from Binance API.
    
    Binance Endpoint: /api/v3/klines
    
    Args:
        symbol: Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        interval: Candlestick interval (default: '1d')
                 Options: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
        api_key: Optional API key (not required for public endpoints)
    
    Returns:
        list[Price]: List of Price objects containing OHLCV data
    """
    # Create a cache key that includes all parameters to ensure exact matches
    cache_key = f"{symbol}_{start_date}_{end_date}_{interval}"
    
    # Check cache first - simple exact match
    if cached_data := _cache.get_prices(cache_key):
        return [Price(**price) for price in cached_data]

    # Convert date strings to timestamps (milliseconds)
    start_timestamp = int(datetime.datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000)
    end_timestamp = int(datetime.datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000)

    # Prepare request parameters
    params = {
        "symbol": symbol.upper(),
        "interval": interval,
        "startTime": start_timestamp,
        "endTime": end_timestamp,
        "limit": 1000  # Max limit per request
    }

    url = f"{BINANCE_BASE_URL}/api/v3/klines"
    response = _make_api_request(url, headers={}, params=params)
    
    if response.status_code != 200:
        raise Exception(f"Error fetching data: {symbol} - {response.status_code} - {response.text}")

    # Parse Binance klines response
    # Format: [open_time, open, high, low, close, volume, close_time, quote_volume, trades, taker_buy_base, taker_buy_quote, ignore]
    klines_data = response.json()
    
    if not klines_data:
        return []

    # Convert Binance klines to Price objects
    prices = []
    for kline in klines_data:
        price = Price(
            open=float(kline[1]),
            high=float(kline[2]),
            low=float(kline[3]),
            close=float(kline[4]),
            volume=int(float(kline[5])),
            time=datetime.datetime.fromtimestamp(kline[0] / 1000).strftime("%Y-%m-%d %H:%M:%S")
        )
        prices.append(price)

    # Cache the results using the comprehensive cache key
    _cache.set_prices(cache_key, [p.model_dump() for p in prices])
    return prices


def get_financial_metrics(
    symbol: str,
    end_date: str,
    period: str = "24h",
    limit: int = 10,
    api_key: str = None,
) -> list[FinancialMetrics]:
    """
    Fetch cryptocurrency market metrics from Binance API.
    
    Binance Endpoint: /api/v3/ticker/24hr
    
    Args:
        symbol: Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
        end_date: End date (used for cache key, Binance returns current 24h data)
        period: Period indicator (default: '24h', used for compatibility)
        limit: Limit (used for cache key, not applicable to Binance 24hr ticker)
        api_key: Optional API key (not required for public endpoints)
    
    Returns:
        list[FinancialMetrics]: List with single FinancialMetrics object containing 24hr stats
        
    Note: This endpoint returns 24-hour rolling window statistics.
    For historical data, consider using additional Binance endpoints.
    """
    # Create a cache key that includes all parameters to ensure exact matches
    cache_key = f"{symbol}_{period}_{end_date}_{limit}"
    
    # Check cache first - simple exact match
    if cached_data := _cache.get_financial_metrics(cache_key):
        return [FinancialMetrics(**metric) for metric in cached_data]

    # Prepare request parameters
    params = {
        "symbol": symbol.upper()
    }

    url = f"{BINANCE_BASE_URL}/api/v3/ticker/24hr"
    response = _make_api_request(url, headers={}, params=params)
    
    if response.status_code != 200:
        raise Exception(f"Error fetching data: {symbol} - {response.status_code} - {response.text}")

    # Parse Binance 24hr ticker response
    ticker_data = response.json()
    
    if not ticker_data:
        return []

    # Convert Binance 24hr stats to FinancialMetrics format
    # Map crypto metrics to stock metrics equivalents
    current_price = float(ticker_data.get('lastPrice', 0))
    volume = float(ticker_data.get('volume', 0))
    quote_volume = float(ticker_data.get('quoteVolume', 0))
    price_change_percent = float(ticker_data.get('priceChangePercent', 0))
    
    # Calculate approximate market cap (for major coins, you'd need additional data)
    # This is a simplified calculation
    market_cap = current_price * volume if volume > 0 else None
    
    financial_metric = FinancialMetrics(
        ticker=symbol,
        report_period=str(end_date),
        period=period,
        currency="USDT",
        market_cap=market_cap,
        enterprise_value=None,
        price_to_earnings_ratio=None,  # N/A for crypto
        price_to_book_ratio=None,  # N/A for crypto
        price_to_sales_ratio=None,  # N/A for crypto
        enterprise_value_to_ebitda_ratio=None,  # N/A for crypto
        enterprise_value_to_revenue_ratio=None,  # N/A for crypto
        free_cash_flow_yield=None,  # N/A for crypto
        peg_ratio=None,  # N/A for crypto
        gross_margin=None,  # N/A for crypto
        operating_margin=None,  # N/A for crypto
        net_margin=None,  # N/A for crypto
        return_on_equity=price_change_percent / 100,  # 24h return as proxy
        return_on_assets=None,
        return_on_invested_capital=None,
        asset_turnover=None,
        inventory_turnover=None,
        receivables_turnover=None,
        days_sales_outstanding=None,
        operating_cycle=None,
        working_capital_turnover=None,
        current_ratio=None,
        quick_ratio=None,
        cash_ratio=None,
        operating_cash_flow_ratio=None,
        debt_to_equity=None,  # N/A for crypto
        debt_to_assets=None,  # N/A for crypto
        interest_coverage=None,  # N/A for crypto
    )

    financial_metrics = [financial_metric]

    # Cache the results as dicts using the comprehensive cache key
    _cache.set_financial_metrics(cache_key, [m.model_dump() for m in financial_metrics])
    return financial_metrics


def search_line_items(
    symbol: str,
    line_items: list[str],
    end_date: str,
    period: str = "24h",
    limit: int = 10,
    api_key: str = None,
) -> list[LineItem]:
    """
    Get crypto-equivalent metrics for requested line items.
    
    For cryptocurrency, we map traditional financial metrics to crypto equivalents:
    - revenue/net_income → Trading volume & Price appreciation
    - total_assets → Market cap & Circulating supply value
    - shareholders_equity → Network value
    - free_cash_flow → Net trading flow
    - capital_expenditure → Not applicable (returns 0)
    - dividends → Staking rewards (if applicable, returns 0 for most)
    
    Args:
        symbol: Trading pair symbol (e.g., 'BTCUSDT')
        line_items: List of line item names requested
        end_date: End date
        period: Period
        limit: Number of historical periods
        api_key: Optional API key
    
    Returns:
        list[LineItem]: List of crypto-equivalent metrics
    """
    # Cache key
    cache_key = f"{symbol}_line_items_{end_date}_{period}_{limit}"
    
    # Check cache
    if cached_data := _cache.get_line_items(cache_key):
        return [LineItem(**item) for item in cached_data]
    
    # Get historical klines data for trend analysis
    end_timestamp = int(datetime.datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000)
    
    # Calculate start date based on limit (get historical data)
    days_back = limit * (30 if period == "annual" else 7 if period == "ttm" else 1)
    start_timestamp = end_timestamp - (days_back * 24 * 60 * 60 * 1000)
    
    params = {
        "symbol": symbol.upper(),
        "interval": "1d",
        "startTime": start_timestamp,
        "endTime": end_timestamp,
        "limit": min(limit * 30, 1000)
    }
    
    url = f"{BINANCE_BASE_URL}/api/v3/klines"
    response = _make_api_request(url, headers={}, params=params)
    
    if response.status_code != 200:
        print(f"Warning: Could not fetch historical data for line items: {response.status_code}")
        return []
    
    klines_data = response.json()
    if not klines_data:
        return []
    
    # Also get 24hr ticker for current metrics
    ticker_params = {"symbol": symbol.upper()}
    ticker_url = f"{BINANCE_BASE_URL}/api/v3/ticker/24hr"
    ticker_response = _make_api_request(ticker_url, headers={}, params=ticker_params)
    
    ticker_data = {}
    if ticker_response.status_code == 200:
        ticker_data = ticker_response.json()
    
    # Process klines into periods
    line_item_list = []
    period_size = 30 if period == "annual" else 7 if period == "ttm" else 1
    
    for i in range(0, min(len(klines_data), limit * period_size), period_size):
        period_klines = klines_data[i:i+period_size]
        if not period_klines:
            continue
            
        # Calculate metrics for this period
        period_volume = sum(float(k[5]) for k in period_klines)  # Base asset volume
        period_quote_volume = sum(float(k[7]) for k in period_klines)  # Quote asset volume
        period_trades = sum(int(k[8]) for k in period_klines)  # Number of trades
        
        open_price = float(period_klines[0][1])
        close_price = float(period_klines[-1][4])
        high_price = max(float(k[2]) for k in period_klines)
        low_price = min(float(k[3]) for k in period_klines)
        
        price_change = close_price - open_price
        price_change_pct = (price_change / open_price * 100) if open_price > 0 else 0
        
        # Approximate market cap (price * volume as proxy)
        approx_market_cap = close_price * period_volume if period_volume > 0 else 0
        
        period_date = datetime.datetime.fromtimestamp(period_klines[-1][0] / 1000).strftime("%Y-%m-%d")
        
        # Create line item with crypto-equivalent metrics
        line_item = LineItem(
            ticker=symbol,
            report_period=period_date,
            period=period,
            currency="USDT",
            # Map traditional financial metrics to crypto equivalents
            # Revenue equivalent: Total trading volume in quote currency (USDT)
            revenue=period_quote_volume,
            # Net income equivalent: Price appreciation * volume
            net_income=price_change * period_volume if price_change > 0 else 0,
            # Total assets equivalent: Approximate market cap
            total_assets=approx_market_cap,
            # Shareholders equity equivalent: Current valuation
            shareholders_equity=close_price * period_volume,
            # Free cash flow equivalent: Net trading flow (simplified)
            free_cash_flow=period_quote_volume * (price_change_pct / 100),
            # Gross profit equivalent: Trading activity
            gross_profit=period_quote_volume * 0.1,  # Approximate 10% as profit proxy
            # Capital expenditure: Not applicable for crypto (set to 0)
            capital_expenditure=0,
            # Depreciation: Not applicable (set to 0)
            depreciation_and_amortization=0,
            # Outstanding shares equivalent: Volume as liquidity measure
            outstanding_shares=period_volume,
            # Total liabilities: Not applicable (set to 0)
            total_liabilities=0,
            # Dividends: Staking rewards if applicable (set to 0 for most)
            dividends_and_other_cash_distributions=0,
            # Share issuance: Not applicable (set to 0)
            issuance_or_purchase_of_equity_shares=0,
            # Additional fields that agents expect
            earnings_per_share=price_change if period_volume > 0 else 0,
            book_value_per_share=close_price,
            current_assets=approx_market_cap * 0.7,  # Assume 70% liquid
            current_liabilities=0,  # No debt for crypto
            working_capital=approx_market_cap * 0.7,  # Same as current assets
            operating_margin=0.1,  # Assume 10% operating margin
            operating_income=period_quote_volume * 0.1,
            research_and_development=0,  # Not applicable for crypto
            selling_general_and_administrative=0,  # Not applicable
            interest_expense=0,  # No debt
            # Additional financial metrics for advanced analysis
            total_debt=0,  # Crypto has no debt
            ebit=period_quote_volume * 0.1,  # Same as operating income
            ebitda=period_quote_volume * 0.1,  # No depreciation, so same as EBIT
            cash_and_equivalents=approx_market_cap * 0.7,  # High liquidity
        )
        
        line_item_list.append(line_item)
    
    # Cache the results
    _cache.set_line_items(cache_key, [item.model_dump() for item in line_item_list])
    
    return line_item_list


def get_insider_trades(
    symbol: str,
    end_date: str,
    start_date: str | None = None,
    limit: int = 1000,
    api_key: str = None,
) -> list[InsiderTrade]:
    """
    Get whale trades (large transactions) as crypto equivalent of insider trades.
    
    For cryptocurrency markets, we track "whale" activity - large trades that
    can indicate smart money movement, similar to insider trading signals in stocks.
    
    Args:
        symbol: Trading pair symbol (e.g., 'BTCUSDT')
        end_date: End date
        start_date: Start date (optional)
        limit: Number of trades to fetch (max 1000)
        api_key: Optional API key
    
    Returns:
        list[InsiderTrade]: List of large trades (whale activity)
    """
    # Cache key
    cache_key = f"{symbol}_whale_trades_{start_date}_{end_date}_{limit}"
    
    # Check cache
    if cached_data := _cache.get_insider_trades(cache_key):
        return [InsiderTrade(**trade) for trade in cached_data]
    
    # Get recent trades
    params = {
        "symbol": symbol.upper(),
        "limit": min(limit, 1000)
    }
    
    url = f"{BINANCE_BASE_URL}/api/v3/trades"
    response = _make_api_request(url, headers={}, params=params)
    
    if response.status_code != 200:
        print(f"Warning: Could not fetch whale trades: {response.status_code}")
        return []
    
    trades_data = response.json()
    if not trades_data:
        return []
    
    # Calculate average trade size to identify "whales"
    trade_sizes = [float(trade['qty']) for trade in trades_data]
    avg_size = sum(trade_sizes) / len(trade_sizes) if trade_sizes else 0
    
    # Define whale threshold as trades 10x larger than average
    whale_threshold = avg_size * 10
    
    # Filter for whale trades
    insider_trades_list = []
    for trade in trades_data:
        trade_qty = float(trade['qty'])
        trade_price = float(trade['price'])
        trade_value = trade_qty * trade_price
        
        # Only include large trades (whales)
        if trade_qty >= whale_threshold or trade_value >= 100000:  # $100k+ trades
            trade_time = datetime.datetime.fromtimestamp(trade['time'] / 1000)
            
            # Determine if it's a buy or sell based on buyer maker flag
            is_buyer_maker = trade.get('isBuyerMaker', False)
            transaction_type = "Sell" if is_buyer_maker else "Buy"
            
            insider_trade = InsiderTrade(
                ticker=symbol,
                issuer=f"Whale_{str(trade['id'])[-6:]}",  # Anonymous whale ID
                name=None,  # Anonymous
                title="Large Trader",
                is_board_director=False,  # Not applicable for crypto
                transaction_date=trade_time.strftime("%Y-%m-%d"),
                transaction_shares=int(trade_qty),
                transaction_price_per_share=trade_price,
                transaction_value=trade_value,
                shares_owned_before_transaction=None,  # Not available
                shares_owned_after_transaction=None,  # Not available
                security_title=transaction_type,  # Buy or Sell
                filing_date=trade_time.strftime("%Y-%m-%d"),
            )
            insider_trades_list.append(insider_trade)
    
    # Sort by transaction value (largest first)
    insider_trades_list.sort(key=lambda x: x.transaction_value, reverse=True)
    
    # Cache the results
    _cache.set_insider_trades(cache_key, [trade.model_dump() for trade in insider_trades_list[:limit]])
    
    return insider_trades_list[:limit]


def get_company_news(
    symbol: str,
    end_date: str,
    start_date: str | None = None,
    limit: int = 100,
    api_key: str = None,
) -> list[CompanyNews]:
    """
    Generate market activity insights as crypto equivalent of company news.
    
    Instead of traditional news, we create insightful summaries of market activity:
    - Price action summaries
    - Volume trends
    - Volatility indicators
    - Market sentiment signals
    
    Args:
        symbol: Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
        end_date: End date
        start_date: Start date (optional)
        limit: Number of insights to generate
        api_key: Optional API key
    
    Returns:
        list[CompanyNews]: List of market activity insights formatted as news
    """
    # Create a cache key
    cache_key = f"{symbol}_news_{start_date or 'none'}_{end_date}_{limit}"
    
    # Check cache
    if cached_data := _cache.get_company_news(cache_key):
        return [CompanyNews(**news) for news in cached_data]

    # Get 24hr ticker for current market state
    ticker_params = {"symbol": symbol.upper()}
    ticker_url = f"{BINANCE_BASE_URL}/api/v3/ticker/24hr"
    ticker_response = _make_api_request(ticker_url, headers={}, params=ticker_params)
    
    if ticker_response.status_code != 200:
        print(f"Warning: Could not fetch market data for news: {ticker_response.status_code}")
        return []

    ticker_data = ticker_response.json()
    
    # Get recent klines for trend analysis
    end_timestamp = int(datetime.datetime.strptime(end_date, "%Y-%m-%d").timestamp() * 1000)
    start_timestamp = end_timestamp - (30 * 24 * 60 * 60 * 1000)  # Last 30 days
    
    klines_params = {
        "symbol": symbol.upper(),
        "interval": "1d",
        "startTime": start_timestamp,
        "endTime": end_timestamp,
        "limit": 30
    }
    
    klines_url = f"{BINANCE_BASE_URL}/api/v3/klines"
    klines_response = _make_api_request(klines_url, headers={}, params=klines_params)
    
    klines_data = []
    if klines_response.status_code == 200:
        klines_data = klines_response.json()
    
    # Generate market insights as "news"
    company_news_list = []
    current_time = datetime.datetime.now()
    
    # Extract key metrics
    last_price = float(ticker_data.get('lastPrice', 0))
    price_change = float(ticker_data.get('priceChange', 0))
    price_change_pct = float(ticker_data.get('priceChangePercent', 0))
    volume = float(ticker_data.get('volume', 0))
    quote_volume = float(ticker_data.get('quoteVolume', 0))
    high_24h = float(ticker_data.get('highPrice', 0))
    low_24h = float(ticker_data.get('lowPrice', 0))
    trades_count = int(ticker_data.get('count', 0))
    
    # 1. Price Action News
    if abs(price_change_pct) > 5:
        direction = "Surges" if price_change_pct > 0 else "Drops"
        news_item = CompanyNews(
            ticker=symbol,
            title=f"{symbol} {direction} {abs(price_change_pct):.2f}% in 24H Trading",
            author="Market Analysis",
            source="Binance Exchange",
            date=(current_time - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S"),
            url=f"https://www.binance.com/en/trade/{symbol}"
        )
        company_news_list.append(news_item)
    
    # 2. Volume Analysis News
    if quote_volume > 0:
        volume_intensity = "High" if trades_count > 100000 else "Moderate" if trades_count > 50000 else "Low"
        news_item = CompanyNews(
            ticker=symbol,
            title=f"{symbol} Shows {volume_intensity} Trading Activity: ${quote_volume:,.0f} Volume",
            author="Market Analysis",
            source="Binance Exchange",
            date=(current_time - timedelta(hours=4)).strftime("%Y-%m-%d %H:%M:%S"),
            url=f"https://www.binance.com/en/trade/{symbol}"
        )
        company_news_list.append(news_item)
    
    # 3. Volatility News
    if high_24h > 0 and low_24h > 0:
        volatility_pct = ((high_24h - low_24h) / low_24h * 100)
        if volatility_pct > 10:
            news_item = CompanyNews(
                ticker=symbol,
                title=f"{symbol} Experiences {volatility_pct:.1f}% Intraday Volatility",
                author="Market Analysis",
                source="Binance Exchange",
                date=(current_time - timedelta(hours=6)).strftime("%Y-%m-%d %H:%M:%S"),
                url=f"https://www.binance.com/en/trade/{symbol}"
            )
            company_news_list.append(news_item)
    
    # 4. Trend Analysis from klines
    if len(klines_data) >= 7:
        # Calculate 7-day trend
        week_ago_close = float(klines_data[-7][4])
        today_close = float(klines_data[-1][4])
        weekly_change = ((today_close - week_ago_close) / week_ago_close * 100)
        
        if abs(weekly_change) > 15:
            trend = "Uptrend" if weekly_change > 0 else "Downtrend"
            news_item = CompanyNews(
                ticker=symbol,
                title=f"{symbol} in Strong {trend}: {abs(weekly_change):.1f}% Weekly Movement",
                author="Technical Analysis",
                source="Binance Exchange",
                date=(current_time - timedelta(hours=8)).strftime("%Y-%m-%d %H:%M:%S"),
                url=f"https://www.binance.com/en/trade/{symbol}"
            )
            company_news_list.append(news_item)
    
    # 5. Support/Resistance Levels
    if len(klines_data) >= 14:
        recent_highs = [float(k[2]) for k in klines_data[-14:]]
        recent_lows = [float(k[3]) for k in klines_data[-14:]]
        resistance = max(recent_highs)
        support = min(recent_lows)
        
        distance_to_resistance = ((resistance - last_price) / last_price * 100)
        distance_to_support = ((last_price - support) / last_price * 100)
        
        if distance_to_resistance < 5:
            news_item = CompanyNews(
                ticker=symbol,
                title=f"{symbol} Approaches Key Resistance at ${resistance:.2f}",
                author="Technical Analysis",
                source="Binance Exchange",
                date=(current_time - timedelta(hours=10)).strftime("%Y-%m-%d %H:%M:%S"),
                url=f"https://www.binance.com/en/trade/{symbol}"
            )
            company_news_list.append(news_item)
        
        if distance_to_support < 5:
            news_item = CompanyNews(
                ticker=symbol,
                title=f"{symbol} Near Support Level at ${support:.2f}",
                author="Technical Analysis",
                source="Binance Exchange",
                date=(current_time - timedelta(hours=12)).strftime("%Y-%m-%d %H:%M:%S"),
                url=f"https://www.binance.com/en/trade/{symbol}"
            )
            company_news_list.append(news_item)
    
    # 6. Market Sentiment
    if price_change_pct > 0 and volume > 0:
        sentiment = "Bullish" if price_change_pct > 3 else "Cautiously Optimistic"
        news_item = CompanyNews(
            ticker=symbol,
            title=f"Market Sentiment for {symbol} Turns {sentiment}",
            author="Sentiment Analysis",
            source="Binance Exchange",
            date=(current_time - timedelta(hours=14)).strftime("%Y-%m-%d %H:%M:%S"),
            url=f"https://www.binance.com/en/trade/{symbol}"
        )
        company_news_list.append(news_item)
    elif price_change_pct < 0:
        sentiment = "Bearish" if price_change_pct < -3 else "Cautious"
        news_item = CompanyNews(
            ticker=symbol,
            title=f"{sentiment} Pressure Observed on {symbol}",
            author="Sentiment Analysis",
            source="Binance Exchange",
            date=(current_time - timedelta(hours=14)).strftime("%Y-%m-%d %H:%M:%S"),
            url=f"https://www.binance.com/en/trade/{symbol}"
        )
        company_news_list.append(news_item)
    
    # Cache the results
    _cache.set_company_news(cache_key, [news.model_dump() for news in company_news_list[:limit]])
    
    return company_news_list[:limit]

    # Convert recent trades to CompanyNews format for compatibility
    # This is a workaround since crypto doesn't have traditional news
    company_news_list = []
    for trade in trades_data[:limit]:
        # Convert timestamp to date string
        trade_time = datetime.datetime.fromtimestamp(trade['time'] / 1000)
        
        # Create a news-like summary of the trade
        price = float(trade['price'])
        qty = float(trade['qty'])
        is_buyer_maker = trade['isBuyerMaker']
        side = "SELL" if is_buyer_maker else "BUY"
        
        news_item = CompanyNews(
            ticker=symbol,
            title=f"Trade Activity: {side} {qty:.4f} @ ${price:.2f}",
            author="Binance Exchange",
            source="Binance",
            date=trade_time.strftime("%Y-%m-%d %H:%M:%S"),
            url=f"https://www.binance.com/en/trade/{symbol}"
        )
        company_news_list.append(news_item)

    # Cache the results using the comprehensive cache key
    _cache.set_company_news(cache_key, [news.model_dump() for news in company_news_list])
    return company_news_list


def get_market_cap(
    symbol: str,
    end_date: str,
    api_key: str = None,
) -> float | None:
    """
    Fetch market cap estimation from Binance 24hr ticker.
    
    Binance Endpoint: /api/v3/ticker/24hr
    
    Note: This provides an approximation. For accurate market cap data,
    use dedicated crypto data providers like CoinGecko or CoinMarketCap.
    
    Args:
        symbol: Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
        end_date: End date (used for caching)
        api_key: Optional API key (not required for public endpoints)
    
    Returns:
        float | None: Estimated market cap based on 24hr volume and price
    """
    # Prepare request parameters
    params = {
        "symbol": symbol.upper()
    }

    url = f"{BINANCE_BASE_URL}/api/v3/ticker/24hr"
    response = _make_api_request(url, headers={}, params=params)
    
    if response.status_code != 200:
        print(f"Error fetching market cap: {symbol} - {response.status_code}")
        return None

    ticker_data = response.json()
    
    # Calculate approximate market cap using price * volume
    # Note: This is a rough estimate, not actual circulating supply market cap
    last_price = float(ticker_data.get('lastPrice', 0))
    volume = float(ticker_data.get('volume', 0))
    
    if last_price > 0 and volume > 0:
        # This is a simplified calculation
        # For real market cap, you'd need circulating supply data
        estimated_market_cap = last_price * volume
        return estimated_market_cap
    
    return None


def prices_to_df(prices: list[Price]) -> pd.DataFrame:
    """
    Convert Price objects to a pandas DataFrame.
    
    Args:
        prices: List of Price objects from get_prices()
    
    Returns:
        pd.DataFrame: DataFrame with OHLCV data indexed by date
    """
    df = pd.DataFrame([p.model_dump() for p in prices])
    df["Date"] = pd.to_datetime(df["time"])
    df.set_index("Date", inplace=True)
    numeric_cols = ["open", "close", "high", "low", "volume"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df.sort_index(inplace=True)
    return df


def get_price_data(symbol: str, start_date: str, end_date: str, interval: str = "1d", api_key: str = None) -> pd.DataFrame:
    """
    Get cryptocurrency price data as a DataFrame.
    
    Args:
        symbol: Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        interval: Candlestick interval (default: '1d')
        api_key: Optional API key
    
    Returns:
        pd.DataFrame: Price data with OHLCV columns indexed by date
    """
    prices = get_prices(symbol, start_date, end_date, interval, api_key=api_key)
    return prices_to_df(prices)
