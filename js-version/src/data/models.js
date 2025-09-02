import { z } from "zod";

/**
 * Price schema
 */
export const PriceSchema = z.object({
  open: z.number(),
  close: z.number(),
  high: z.number(),
  low: z.number(),
  volume: z.number(),
  time: z.string(),
});

/**
 * Price response schema
 */
export const PriceResponseSchema = z.object({
  ticker: z.string(),
  prices: z.array(PriceSchema),
});

/**
 * Financial metrics schema
 */
export const FinancialMetricsSchema = z.object({
  ticker: z.string(),
  report_period: z.string(),
  period: z.string(),
  currency: z.string(),
  market_cap: z.number().nullable(),
  enterprise_value: z.number().nullable(),
  price_to_earnings_ratio: z.number().nullable(),
  price_to_book_ratio: z.number().nullable(),
  price_to_sales_ratio: z.number().nullable(),
  enterprise_value_to_ebitda_ratio: z.number().nullable(),
  enterprise_value_to_revenue_ratio: z.number().nullable(),
  free_cash_flow_yield: z.number().nullable(),
  peg_ratio: z.number().nullable(),
  gross_margin: z.number().nullable(),
  operating_margin: z.number().nullable(),
  net_margin: z.number().nullable(),
  return_on_equity: z.number().nullable(),
  return_on_assets: z.number().nullable(),
  return_on_invested_capital: z.number().nullable(),
  asset_turnover: z.number().nullable(),
  inventory_turnover: z.number().nullable(),
  receivables_turnover: z.number().nullable(),
  days_sales_outstanding: z.number().nullable(),
  operating_cycle: z.number().nullable(),
  working_capital_turnover: z.number().nullable(),
  current_ratio: z.number().nullable(),
  quick_ratio: z.number().nullable(),
  cash_ratio: z.number().nullable(),
  operating_cash_flow_ratio: z.number().nullable(),
  debt_to_equity: z.number().nullable(),
  debt_to_assets: z.number().nullable(),
  interest_coverage: z.number().nullable(),
  revenue_growth: z.number().nullable(),
  earnings_growth: z.number().nullable(),
  book_value_growth: z.number().nullable(),
  earnings_per_share_growth: z.number().nullable(),
  free_cash_flow_growth: z.number().nullable(),
  operating_income_growth: z.number().nullable(),
  ebitda_growth: z.number().nullable(),
  payout_ratio: z.number().nullable(),
  earnings_per_share: z.number().nullable(),
  book_value_per_share: z.number().nullable(),
  free_cash_flow_per_share: z.number().nullable(),
});

/**
 * Financial metrics response schema
 */
export const FinancialMetricsResponseSchema = z.object({
  financial_metrics: z.array(FinancialMetricsSchema),
});

/**
 * Line item schema with extra fields allowed
 */
export const LineItemSchema = z
  .object({
    ticker: z.string(),
    report_period: z.string(),
    period: z.string(),
    currency: z.string(),
  })
  .passthrough(); // Allow additional fields dynamically

/**
 * Line item response schema
 */
export const LineItemResponseSchema = z.object({
  search_results: z.array(LineItemSchema),
});

/**
 * Insider trade schema
 */
export const InsiderTradeSchema = z.object({
  ticker: z.string(),
  issuer: z.string().nullable(),
  name: z.string().nullable(),
  title: z.string().nullable(),
  is_board_director: z.boolean().nullable(),
  transaction_date: z.string().nullable(),
  transaction_shares: z.number().nullable(),
  transaction_price_per_share: z.number().nullable(),
  transaction_value: z.number().nullable(),
  shares_owned_before_transaction: z.number().nullable(),
  shares_owned_after_transaction: z.number().nullable(),
  security_title: z.string().nullable(),
  filing_date: z.string(),
});

/**
 * Insider trade response schema
 */
export const InsiderTradeResponseSchema = z.object({
  insider_trades: z.array(InsiderTradeSchema),
});

/**
 * Company news schema
 */
export const CompanyNewsSchema = z.object({
  ticker: z.string(),
  title: z.string(),
  author: z.string(),
  source: z.string(),
  date: z.string(),
  url: z.string(),
  sentiment: z.string().nullable().optional(),
});

/**
 * Company news response schema
 */
export const CompanyNewsResponseSchema = z.object({
  news: z.array(CompanyNewsSchema),
});

/**
 * Company facts schema
 */
export const CompanyFactsSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  cik: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  listing_date: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  number_of_employees: z.number().nullable().optional(),
  sec_filings_url: z.string().nullable().optional(),
  sic_code: z.string().nullable().optional(),
  sic_industry: z.string().nullable().optional(),
  sic_sector: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
  weighted_average_shares: z.number().nullable().optional(),
});

/**
 * Company facts response schema
 */
export const CompanyFactsResponseSchema = z.object({
  company_facts: CompanyFactsSchema,
});

/**
 * Position schema
 */
export const PositionSchema = z.object({
  cash: z.number().default(0.0),
  shares: z.number().default(0),
  ticker: z.string(),
});

/**
 * Portfolio schema
 */
export const PortfolioSchema = z.object({
  positions: z.record(z.string(), PositionSchema), // ticker -> Position mapping
  total_cash: z.number().default(0.0),
});

/**
 * Analyst signal schema
 */
export const AnalystSignalSchema = z.object({
  signal: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  reasoning: z
    .union([z.record(z.string(), z.any()), z.string()])
    .nullable()
    .optional(),
  max_position_size: z.number().nullable().optional(), // For risk management signals
});

/**
 * Ticker analysis schema
 */
export const TickerAnalysisSchema = z.object({
  ticker: z.string(),
  analyst_signals: z.record(z.string(), AnalystSignalSchema), // agent_name -> signal mapping
});

/**
 * Agent state data schema
 */
export const AgentStateDataSchema = z.object({
  tickers: z.array(z.string()),
  portfolio: PortfolioSchema,
  start_date: z.string(),
  end_date: z.string(),
  ticker_analyses: z.record(z.string(), TickerAnalysisSchema), // ticker -> analysis mapping
});

/**
 * Agent state metadata schema
 */
export const AgentStateMetadataSchema = z
  .object({
    show_reasoning: z.boolean().default(false),
  })
  .passthrough(); // Allow extra fields
