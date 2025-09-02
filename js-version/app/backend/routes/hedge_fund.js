import express from "express";
import { asyncHandler } from "../utils/async_handler.js";
import { ApiKeyService } from "../services/api_key_service.js";
import { createPortfolio } from "../services/portfolio.js";
import { createGraph, parseHedgeFundResponse, runGraphAsync } from "../services/graph.js";
import { BacktestService } from "../services/backtest_service.js";
import { getAgentsList } from "../../src/utils/analysts.js";
import { ProgressTracker } from "../../src/utils/progress.js";

const router = express.Router();
const progress = new ProgressTracker();

/**
 * @route POST /api/hedge-fund/run
 * @description Run the hedge fund agent graph and stream results
 * @access Public
 */
router.post("/run", asyncHandler(async (req, res) => {
    // Create SSE connection for streaming updates
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    try {
        const requestData = req.body;
        
        // Hydrate API keys from database if not provided
        if (!requestData.api_keys) {
            const apiKeyService = new ApiKeyService();
            requestData.api_keys = await apiKeyService.getApiKeysDict();
        }
        
        // Create the portfolio
        const portfolio = createPortfolio(
            requestData.initial_cash, 
            requestData.margin_requirement, 
            requestData.tickers, 
            requestData.portfolio_positions
        );
        
        // Construct agent graph using the React Flow graph structure
        let graph = createGraph(
            requestData.graph_nodes,
            requestData.graph_edges
        );
        graph = graph.compile();
        
        // Log a test progress update for debugging
        progress.updateStatus("system", null, "Preparing hedge fund run");
        
        // Convert model_provider to string if it's an enum
        let modelProvider = requestData.model_provider;
        if (modelProvider && modelProvider.value) {
            modelProvider = modelProvider.value;
        }
        
        // Send initial message
        res.write(`event: start\ndata: {}\n\n`);
        
        // Client disconnect detection
        req.on('close', () => {
            console.log("Client disconnected, cancelling hedge fund execution");
            // Note: In a real implementation, we would cancel any ongoing processes here
        });
        
        // Register progress handler
        const runProgressHandler = (agentName, ticker, status, analysis, timestamp) => {
            const event = {
                event: "progress",
                data: {
                    agent: agentName,
                    ticker: ticker,
                    status: status,
                    timestamp: timestamp,
                    analysis: analysis
                }
            };
            res.write(`event: progress\ndata: ${JSON.stringify(event.data)}\n\n`);
        };
        
        progress.registerHandler(runProgressHandler);
        
        try {
            // Run the graph execution
            const result = await runGraphAsync(
                graph,
                portfolio,
                requestData.tickers,
                requestData.start_date,
                requestData.end_date,
                requestData.model_name,
                modelProvider,
                requestData // Pass the full request for agent-specific model access
            );
            
            if (!result || !result.messages) {
                res.write(`event: error\ndata: {"message": "Failed to generate hedge fund decisions"}\n\n`);
                return;
            }
            
            // Send the final result
            const finalData = {
                decisions: parseHedgeFundResponse(result.messages[result.messages.length - 1].content),
                analyst_signals: result.data?.analyst_signals || {},
                current_prices: result.data?.current_prices || {}
            };
            
            res.write(`event: complete\ndata: ${JSON.stringify({ data: finalData })}\n\n`);
            
        } catch (error) {
            console.error("Error in hedge fund execution:", error);
            res.write(`event: error\ndata: {"message": "An error occurred during execution: ${error.message}"}\n\n`);
        } finally {
            // Clean up
            progress.unregisterHandler(runProgressHandler);
            res.end();
        }
        
    } catch (error) {
        console.error("Error processing hedge fund request:", error);
        res.write(`event: error\ndata: {"message": "An error occurred while processing the request: ${error.message}"}\n\n`);
        res.end();
    }
}));

/**
 * @route POST /api/hedge-fund/backtest
 * @description Run a continuous backtest over a time period with streaming updates
 * @access Public
 */
router.post("/backtest", asyncHandler(async (req, res) => {
    // Create SSE connection for streaming updates
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    try {
        const requestData = req.body;
        
        // Hydrate API keys from database if not provided
        if (!requestData.api_keys) {
            const apiKeyService = new ApiKeyService();
            requestData.api_keys = await apiKeyService.getApiKeysDict();
        }
        
        // Convert model_provider to string if it's an enum
        let modelProvider = requestData.model_provider;
        if (modelProvider && modelProvider.value) {
            modelProvider = modelProvider.value;
        }
        
        // Create the portfolio
        const portfolio = createPortfolio(
            requestData.initial_capital, 
            requestData.margin_requirement, 
            requestData.tickers, 
            requestData.portfolio_positions
        );
        
        // Construct agent graph using the React Flow graph structure
        let graph = createGraph(
            requestData.graph_nodes,
            requestData.graph_edges
        );
        graph = graph.compile();
        
        // Create backtest service with the compiled graph
        const backtestService = new BacktestService(
            graph,
            portfolio,
            requestData.tickers,
            requestData.start_date,
            requestData.end_date,
            requestData.initial_capital,
            requestData.model_name,
            modelProvider,
            requestData // Pass the full request for agent-specific model access
        );
        
        // Send initial message
        res.write(`event: start\ndata: {}\n\n`);
        
        // Client disconnect detection
        req.on('close', () => {
            console.log("Client disconnected, cancelling backtest execution");
            // Note: In a real implementation, we would cancel any ongoing processes here
        });
        
        // Register progress handler for backtest agent updates
        const backtestAgentHandler = (agentName, ticker, status, analysis, timestamp) => {
            // Add a prefix to differentiate this handler's events
            const eventData = {
                event: "progress",
                data: {
                    source: "agent_updates",
                    agent: agentName,
                    ticker: ticker,
                    status: status,
                    timestamp: timestamp,
                    analysis: analysis
                }
            };
            res.write(`event: progress\ndata: ${JSON.stringify(eventData.data)}\n\n`);
        };
        
        progress.registerHandler(backtestAgentHandler);
        
        // Progress callback to handle backtest-specific updates
        const progressCallback = (update) => {
            if (update.type === "progress") {
                const event = {
                    agent: "backtest",
                    ticker: null,
                    status: `Processing ${update.current_date} (${update.current_step}/${update.total_dates})`,
                    timestamp: null,
                    analysis: null
                };
                res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
            } else if (update.type === "backtest_result") {
                // Convert day result to a streaming event
                const backtestResult = update.data;
                
                // Send the full day result data as JSON in the analysis field
                const analysisData = JSON.stringify(update.data);
                
                const event = {
                    agent: "backtest",
                    ticker: null,
                    status: `Completed ${backtestResult.date} - Portfolio: $${parseFloat(backtestResult.portfolio_value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    timestamp: null,
                    analysis: analysisData
                };
                res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
            }
        };
        
        try {
            // Run the backtest
            const result = await backtestService.runBacktestAsync(progressCallback);
            
            if (!result) {
                res.write(`event: error\ndata: {"message": "Failed to complete backtest"}\n\n`);
                return;
            }
            
            // Send the final result
            const finalData = {
                performance_metrics: result.performance_metrics,
                final_portfolio: result.final_portfolio,
                total_days: result.results.length
            };
            
            res.write(`event: complete\ndata: ${JSON.stringify({ data: finalData })}\n\n`);
            
        } catch (error) {
            console.error("Error in backtest execution:", error);
            res.write(`event: error\ndata: {"message": "An error occurred during backtest: ${error.message}"}\n\n`);
        } finally {
            // Clean up
            progress.unregisterHandler(backtestAgentHandler);
            res.end();
        }
        
    } catch (error) {
        console.error("Error processing backtest request:", error);
        res.write(`event: error\ndata: {"message": "An error occurred while processing the backtest request: ${error.message}"}\n\n`);
        res.end();
    }
}));

/**
 * @route GET /api/hedge-fund/agents
 * @description Get the list of available agents
 * @access Public
 */
router.get("/agents", asyncHandler(async (req, res) => {
    try {
        res.json({ agents: getAgentsList() });
    } catch (error) {
        console.error("Failed to retrieve agents:", error);
        res.status(500).json({ detail: `Failed to retrieve agents: ${error.message}` });
    }
}));

export default router;
