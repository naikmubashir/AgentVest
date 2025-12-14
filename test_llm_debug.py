#!/usr/bin/env python3
"""Debug LLM initialization."""

from dotenv import load_dotenv
load_dotenv()

from src.graph.state import AgentState
from datetime import datetime, timedelta

end_date = datetime.now().strftime('%Y-%m-%d')
start_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')

state = {
    "messages": [],
    "data": {
        "tickers": ["BTCUSDT"],
        "start_date": start_date,
        "end_date": end_date,
        "show_reasoning": False,
        "portfolio": {},
        "analyst_signals": {},
    },
    "metadata": {
        "BINANCE_API_KEY": None,
        "show_reasoning": False,
        "model_name": "llama-3.3-70b-versatile",
        "model_provider": "GROQ",
    }
}

print("Testing call_llm function...")

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel
from src.utils.llm import call_llm

class TestOutput(BaseModel):
    result: str

template = ChatPromptTemplate.from_messages([
    ("system", "You are a test assistant."),
    ("human", "Just say 'test successful'")
])

prompt = template.invoke({})

try:
    output = call_llm(
        prompt=prompt,
        pydantic_model=TestOutput,
        agent_name="test_agent",
        state=state,
    )
    print(f"SUCCESS! Output: {output}")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()

