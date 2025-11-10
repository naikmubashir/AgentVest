from pydantic import BaseModel


class Price(BaseModel):
    open: float
    close: float
    high: float
    low: float
    volume: int
    time: str


class PriceResponse(BaseModel):
    ticker: str
    prices: list[Price]


class FinancialMetrics(BaseModel):
    ticker: str
    report_period: str
    period: str
    currency: str
    market_cap: float | None
    enterprise_value: float | None
    price_to_earnings_ratio: float | None
    price_to_book_ratio: float | None
    price_to_sales_ratio: float | None
    enterprise_value_to_ebitda_ratio: float | None
    enterprise_value_to_revenue_ratio: float | None
    free_cash_flow_yield: float | None
    peg_ratio: float | None
    gross_margin: float | None
    operating_margin: float | None
    net_margin: float | None
    return_on_equity: float | None
    return_on_assets: float | None
    return_on_invested_capital: float | None
    asset_turnover: float | None
    inventory_turnover: float | None
    receivables_turnover: float | None
    days_sales_outstanding: float | None
    operating_cycle: float | None
    working_capital_turnover: float | None
    current_ratio: float | None
    quick_ratio: float | None = None
    cash_ratio: float | None = None
    operating_cash_flow_ratio: float | None = None
    debt_to_equity: float | None = None
    debt_to_assets: float | None = None
    interest_coverage: float | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None
    book_value_growth: float | None = None
    earnings_per_share_growth: float | None = None
    free_cash_flow_growth: float | None = None
    operating_income_growth: float | None = None
    ebitda_growth: float | None = None
    payout_ratio: float | None = None
    earnings_per_share: float | None = None
    book_value_per_share: float | None = None
    free_cash_flow_per_share: float | None = None


class FinancialMetricsResponse(BaseModel):
    financial_metrics: list[FinancialMetrics]


class LineItem(BaseModel):
    ticker: str
    report_period: str
    period: str
    currency: str

    # Allow additional fields dynamically
    model_config = {"extra": "allow"}


class LineItemResponse(BaseModel):
    search_results: list[LineItem]


class InsiderTrade(BaseModel):
    ticker: str
    issuer: str | None
    name: str | None
    title: str | None
    is_board_director: bool | None
    transaction_date: str | None
    transaction_shares: float | None
    transaction_price_per_share: float | None
    transaction_value: float | None
    shares_owned_before_transaction: float | None
    shares_owned_after_transaction: float | None
    security_title: str | None
    filing_date: str


class InsiderTradeResponse(BaseModel):
    insider_trades: list[InsiderTrade]


class CompanyNews(BaseModel):
    ticker: str
    title: str
    author: str
    source: str
    date: str
    url: str
    sentiment: str | None = None


class CompanyNewsResponse(BaseModel):
    news: list[CompanyNews]


# Crypto-specific models
class CryptoMetrics(BaseModel):
    """Cryptocurrency-specific market metrics"""
    ticker: str  # e.g., "BTCUSDT"
    timestamp: str
    
    # Price & Volume
    current_price: float
    volume_24h: float
    quote_volume_24h: float
    
    # Market Metrics
    market_cap: float | None = None
    circulating_supply: float | None = None
    total_supply: float | None = None
    max_supply: float | None = None
    
    # Performance
    price_change_24h: float
    price_change_percent_24h: float
    high_24h: float
    low_24h: float
    
    # Volatility & Trading
    volatility_30d: float | None = None
    average_volume_30d: float | None = None
    trades_24h: int | None = None
    
    # On-chain metrics (optional, from external APIs)
    active_addresses: int | None = None
    transaction_count: int | None = None
    exchange_inflow: float | None = None
    exchange_outflow: float | None = None
    whale_transaction_count: int | None = None


class CryptoNews(BaseModel):
    """Enhanced cryptocurrency news model"""
    title: str
    description: str
    published_at: str
    source: str
    url: str
    symbols: list[str]  # Crypto symbols mentioned
    sentiment: str | None = None  # "positive", "negative", "neutral"
    importance: int | None = None  # 1-10 scale


class CryptoNewsResponse(BaseModel):
    news: list[CryptoNews]


class CompanyFacts(BaseModel):
    ticker: str
    name: str
    cik: str | None = None
    industry: str | None = None
    sector: str | None = None
    category: str | None = None
    exchange: str | None = None
    is_active: bool | None = None
    listing_date: str | None = None
    location: str | None = None
    market_cap: float | None = None
    number_of_employees: int | None = None
    sec_filings_url: str | None = None
    sic_code: str | None = None
    sic_industry: str | None = None
    sic_sector: str | None = None
    website_url: str | None = None
    weighted_average_shares: int | None = None


class CompanyFactsResponse(BaseModel):
    company_facts: CompanyFacts


class Position(BaseModel):
    cash: float = 0.0
    shares: int = 0
    ticker: str


class Portfolio(BaseModel):
    positions: dict[str, Position]  # ticker -> Position mapping
    total_cash: float = 0.0


class AnalystSignal(BaseModel):
    signal: str | None = None
    confidence: float | None = None
    reasoning: dict | str | None = None
    max_position_size: float | None = None  # For risk management signals


class TickerAnalysis(BaseModel):
    ticker: str
    analyst_signals: dict[str, AnalystSignal]  # agent_name -> signal mapping


class AgentStateData(BaseModel):
    tickers: list[str]
    portfolio: Portfolio
    start_date: str
    end_date: str
    ticker_analyses: dict[str, TickerAnalysis]  # ticker -> analysis mapping


class AgentStateMetadata(BaseModel):
    show_reasoning: bool = False
    model_config = {"extra": "allow"}
