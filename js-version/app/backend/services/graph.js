import { HumanMessage } from "langchain/schema";

/**
 * Creates a graph object from nodes and edges
 *
 * @param {Array} graphNodes - The nodes in the graph
 * @param {Array} graphEdges - The edges in the graph
 * @returns {Object} Graph object with nodes and edges
 */
export function createGraph(graphNodes, graphEdges) {
  // Convert ReactFlow graph representation to our internal format
  const nodes = graphNodes.map((node) => {
    return {
      id: node.id,
      type: node.type || "default",
      data: node.data || {},
      position: node.position || { x: 0, y: 0 },
    };
  });

  const edges = graphEdges.map((edge) => {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type || "default",
    };
  });

  return {
    nodes,
    edges,

    /**
     * Compiles the graph into an executable workflow
     * @returns {Object} The compiled graph
     */
    compile() {
      // Create a map of node IDs to their agent functions
      const nodeMap = {};
      for (const node of this.nodes) {
        // For each node, check if it has an agent function
        if (node.data && node.data.agentFunction) {
          nodeMap[node.id] = node.data.agentFunction;
        }
      }

      // Create an adjacency list of node IDs
      const adjacencyList = {};
      for (const node of this.nodes) {
        adjacencyList[node.id] = [];
      }

      for (const edge of this.edges) {
        if (adjacencyList[edge.source]) {
          adjacencyList[edge.source].push(edge.target);
        }
      }

      // Return the compiled graph
      return {
        nodeMap,
        adjacencyList,
        nodes: this.nodes,
        edges: this.edges,
      };
    },
  };
}

/**
 * Parses the hedge fund response message to extract decisions
 *
 * @param {string} response - The response content to parse
 * @returns {Object} Parsed decisions object
 */
export function parseHedgeFundResponse(response) {
  try {
    // Try to parse as JSON directly
    return JSON.parse(response);
  } catch (error) {
    console.warn(
      "Could not parse response as JSON, attempting to extract JSON from text"
    );

    try {
      // Try to extract JSON from markdown or text
      const jsonMatch =
        response.match(/```json\n([\s\S]*?)\n```/) ||
        response.match(/```([\s\S]*?)```/) ||
        response.match(/{[\s\S]*?}/);

      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      } else if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (extractError) {
      console.error("Failed to extract JSON from response", extractError);
    }

    // Fallback: return a basic object with the full text
    return {
      raw_response: response,
      decisions: {},
      error: "Could not parse response",
    };
  }
}

/**
 * Runs the graph asynchronously
 *
 * @param {Object} graph - The compiled graph
 * @param {Object} portfolio - The portfolio
 * @param {Array<string>} tickers - List of stock tickers
 * @param {string} startDate - Start date for analysis
 * @param {string} endDate - End date for analysis
 * @param {string} modelName - The LLM model name
 * @param {string} modelProvider - The LLM provider
 * @param {Object} request - The full request object
 * @returns {Promise<Object>} The result of running the graph
 */
export async function runGraphAsync(
  graph,
  portfolio,
  tickers,
  startDate,
  endDate,
  modelName,
  modelProvider,
  request
) {
  // Initialize the state
  const state = {
    messages: [
      new HumanMessage({
        content:
          "You are a hedge fund analyst. Please analyze the following stocks and provide trading recommendations.",
      }),
    ],
    data: {
      portfolio,
      tickers,
      start_date: startDate,
      end_date: endDate,
      current_prices: {},
      analyst_signals: {},
      api_keys: request.api_keys || {},
    },
    metadata: {
      show_reasoning: true,
      model_name: modelName,
      model_provider: modelProvider,
    },
  };

  // Find all root nodes (nodes with no incoming edges)
  const rootNodes = graph.nodes.filter((node) => {
    return !graph.edges.some((edge) => edge.target === node.id);
  });

  // Process the graph in topological order
  const visited = new Set();
  const finalState = await processNodes(rootNodes, graph, state, visited);

  return finalState;
}

/**
 * Processes nodes in the graph recursively
 *
 * @param {Array} nodes - Nodes to process
 * @param {Object} graph - The compiled graph
 * @param {Object} state - Current state
 * @param {Set} visited - Set of visited nodes
 * @returns {Promise<Object>} Updated state
 */
async function processNodes(nodes, graph, state, visited) {
  if (!nodes || nodes.length === 0) {
    return state;
  }

  let currentState = { ...state };

  // Process each node
  for (const node of nodes) {
    // Skip if already visited
    if (visited.has(node.id)) {
      continue;
    }

    // Mark as visited
    visited.add(node.id);

    // Get the agent function for this node
    const agentFunction = graph.nodeMap[node.id];
    if (agentFunction) {
      try {
        // Run the agent
        const newState = await agentFunction(currentState, node.id);
        currentState = newState;
      } catch (error) {
        console.error(`Error processing node ${node.id}:`, error);
        // Continue with current state
      }
    }

    // Find all child nodes
    const childNodeIds = graph.adjacencyList[node.id] || [];
    const childNodes = childNodeIds
      .map((id) => graph.nodes.find((n) => n.id === id))
      .filter(Boolean);

    // Process child nodes
    currentState = await processNodes(childNodes, graph, currentState, visited);
  }

  return currentState;
}
