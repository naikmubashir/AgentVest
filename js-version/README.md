# AI Hedge Fund (JavaScript Version)

This is a JavaScript implementation of the AI Hedge Fund proof of concept, converted from the original Python codebase.

## Project Structure

The project is organized in a similar structure to the original Python version:

```
js-version/
├── app/
│   ├── backend/             # Backend API server (Express.js)
│   │   ├── database/        # Database models and connection (Sequelize)
│   │   ├── models/          # Schema definitions
│   │   ├── repositories/    # Data access layer
│   │   ├── routes/          # API routes
│   │   └── services/        # Business logic
│   └── frontend/            # Frontend (React) - not implemented yet
├── src/
│   ├── agents/              # Investment strategy agents
│   ├── data/                # Data models and caching
│   ├── graph/               # Workflow graph
│   ├── llm/                 # LLM integration
│   ├── tools/               # API and other tools
│   └── utils/               # Utility functions
└── tests/                   # Test files
```

## Technology Stack

- **Runtime**: Node.js
- **Backend Framework**: Express.js
- **Database ORM**: Sequelize with SQLite
- **LLM Integration**: LangChain.js
- **CLI Interface**: Inquirer

## Setup and Installation

1. Install Node.js (v18+ recommended)
2. Clone the repository
3. Install dependencies:

```bash
cd ai-hedge-fund/js-version
npm install
```

4. Create a `.env` file with your API keys:

```
OPENAI_API_KEY=your_openai_api_key
FINANCIAL_DATASETS_API_KEY=your_financial_datasets_api_key
```

## Running the Application

### CLI Interface

To run the hedge fund simulation through the command line:

```bash
npm start
```

### Web Server

To start the backend API server:

```bash
npm run server
```

## Core Components

### Agents

The system employs several agents working together:

1. Investment strategy agents (Warren Buffett, Charlie Munger, etc.)
2. Specialized agents (Valuation, Sentiment, Fundamentals, Technicals)
3. Risk Manager
4. Portfolio Manager

Each agent provides signals that influence the final investment decisions.

### API Integration

The system integrates with financial data APIs to obtain market data, which is then analyzed by the agents.

### LLM Integration

The system uses language models to perform reasoning about investments, accessed through LangChain.js.

## Disclaimer

This project is for **educational and research purposes only**.

- Not intended for real trading or investment
- No investment advice or guarantees provided
- Creator assumes no liability for financial losses
- Consult a financial advisor for investment decisions
- Past performance does not indicate future results

By using this software, you agree to use it solely for learning purposes.
