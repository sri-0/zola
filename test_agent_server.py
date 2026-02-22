#!/usr/bin/env python3
"""
test_agent_server.py
--------------------
FastAPI agent server using LangGraph + a real LLM via OpenRouter.

astream_events(v2) fires:
  on_chat_model_stream (planner) → stream tool_call chunks + reasoning_content
  on_chat_model_end   (planner) → build ID map, emit finish_reason:"tool_calls"
  on_tool_end                   → emit custom tool_result extension
  on_chain_end        (responder)→ stream final text

Emits standard OpenAI SSE + one custom extension:
  data: {"tool_result": {"toolCallId":"...","toolName":"...","result":{...}}}

Zola's agent-stream.ts converts this to Vercel AI SDK data stream format.

Config (env vars):
  LLM_BASE_URL  defaults to https://openrouter.ai/api/v1
  LLM_API_KEY   required — your OpenRouter (or OpenAI) key
  LLM_MODEL     defaults to openai/gpt-4o-mini

Run:
  LLM_API_KEY=sk-or-... .venv/bin/python test_agent_server.py
"""

import asyncio
import json
import os
import time
import uuid
from typing import Any, AsyncGenerator, TypedDict

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph


# ---------------------------------------------------------------------------
# LLM — OpenRouter (or any OpenAI-compatible provider)
# ---------------------------------------------------------------------------

_LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://openrouter.ai/api/v1")
_LLM_API_KEY  = os.environ.get("LLM_API_KEY", "")
_LLM_MODEL    = os.environ.get("LLM_MODEL",    "openai/gpt-4o-mini")

if not _LLM_API_KEY:
    raise RuntimeError("LLM_API_KEY env var is required")

_llm = ChatOpenAI(
    base_url=_LLM_BASE_URL,
    api_key=_LLM_API_KEY,
    model=_LLM_MODEL,
    streaming=True,
)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@tool
def query_database(query: str) -> dict:
    """Query the internal analytics database for business metrics and sales data.

    Args:
        query: SQL-like query string describing what data to fetch
    """
    return {
        "query": query,
        "row_count": 3,
        "rows": [
            {"product": "Widget Pro",  "revenue": 42_000, "units": 840,  "quarter": "Q4 2024"},
            {"product": "Gadget Max",  "revenue": 31_500, "units": 630,  "quarter": "Q4 2024"},
            {"product": "Device Lite", "revenue": 18_750, "units": 1_250, "quarter": "Q4 2024"},
        ],
    }


@tool
def retrieve_documents(query: str, top_k: int = 3) -> dict:
    """Retrieve relevant documents from the knowledge base using semantic search.

    Args:
        query:  Natural language search query
        top_k:  Number of documents to return (default 3)
    """
    docs = [
        {
            "id": "doc_001",
            "title": "Q4 2024 Performance Report",
            "content": "Revenue exceeded targets by 12%. Enterprise segment and APAC launches drove growth.",
            "score": 0.94,
            "source": "reports/q4-2024.pdf",
        },
        {
            "id": "doc_002",
            "title": "Market Analysis: Competitive Landscape",
            "content": "Market share grew to 23.4% from 19.1%. Strong mid-market positioning.",
            "score": 0.87,
            "source": "research/competitive-analysis.pdf",
        },
        {
            "id": "doc_003",
            "title": "Product Roadmap 2025",
            "content": "Enhanced AI, API-first architecture, and expanded integrations planned for Q1–Q3 2025.",
            "score": 0.81,
            "source": "product/roadmap-2025.md",
        },
    ]
    return {"query": query, "total_retrieved": top_k, "documents": docs[:top_k]}


TOOLS = [query_database, retrieve_documents]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}

# Bind tools to the LLM so it can decide which to call
_llm_with_tools = _llm.bind_tools(TOOLS)


# ---------------------------------------------------------------------------
# LangGraph state + nodes
# ---------------------------------------------------------------------------

class AgentState(TypedDict):
    messages: list
    tool_calls: list    # decisions from planner (name, id, args)
    tool_results: list  # outputs from executor
    final_text: str     # assembled response


def planner_node(state: AgentState) -> AgentState:
    """Call the LLM with tools bound. The LLM decides what (if anything) to call.
    astream_events will fire on_chat_model_stream for every token/tool-call-chunk.
    """
    response = _llm_with_tools.invoke(state["messages"])
    tool_calls = [
        {"id": tc["id"], "name": tc["name"], "args": tc["args"]}
        for tc in (response.tool_calls or [])
    ]
    # Store direct content for no-tool replies
    return {**state, "tool_calls": tool_calls, "_llm_content": response.content}


def executor_node(state: AgentState) -> AgentState:
    """Execute each planned tool. fn.invoke() triggers on_tool_start/on_tool_end."""
    results = []
    for call in state["tool_calls"]:
        fn = TOOLS_BY_NAME.get(call["name"])
        result = fn.invoke(call["args"]) if fn else {"error": f"Unknown tool: {call['name']}"}
        results.append({"id": call["id"], "name": call["name"], "result": result})
    return {**state, "tool_results": results}


def responder_node(state: AgentState) -> AgentState:
    """Build the final markdown response from tool results.
    Falls back to the LLM's direct content if no tools ran.
    """
    if not state.get("tool_results"):
        return {**state, "final_text": state.get("_llm_content", "")}

    parts: list[str] = []
    for tr in state["tool_results"]:
        if tr["name"] == "query_database":
            rows = tr["result"].get("rows", [])
            parts.append("**Database results:**\n\n")
            parts.append("| Product | Revenue | Units | Quarter |\n|---|---|---|---|\n")
            for r in rows:
                parts.append(f"| {r['product']} | ${r['revenue']:,} | {r['units']:,} | {r['quarter']} |\n")
            total = sum(r["revenue"] for r in rows)
            parts.append(f"\nTotal Q4 revenue: **${total:,}**\n\n")
        elif tr["name"] == "retrieve_documents":
            docs = tr["result"].get("documents", [])
            parts.append("**Documents retrieved:**\n\n")
            for i, d in enumerate(docs, 1):
                parts.append(f"{i}. **{d['title']}** *(score: {d['score']})* — {d['content']}\n")
            parts.append("\n")

    parts.append("Let me know if you'd like to explore any of this further.")
    return {**state, "final_text": "".join(parts)}


def build_graph():
    wf = StateGraph(AgentState)
    wf.add_node("planner",   planner_node)
    wf.add_node("executor",  executor_node)
    wf.add_node("responder", responder_node)
    wf.set_entry_point("planner")
    wf.add_edge("planner",   "executor")
    wf.add_edge("executor",  "responder")
    wf.add_edge("responder", END)
    return wf.compile()


GRAPH = build_graph()


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def sse(data: Any) -> str:
    return f"data: {json.dumps(data)}\n\n"


def openai_chunk(request_id: str, delta: dict, finish_reason: str | None = None) -> str:
    return sse({
        "id": request_id,
        "object": "chat.completion.chunk",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    })


# ---------------------------------------------------------------------------
# Main stream — maps astream_events onto OpenAI SSE
# ---------------------------------------------------------------------------

async def run_agent_stream(messages: list[dict]) -> AsyncGenerator[str, None]:
    """
    Event → SSE mapping:

      on_chat_model_stream (planner node)
        tool_call_chunks  → choices[0].delta.tool_calls  (live argument streaming)
        reasoning_content → choices[0].delta.reasoning_content
        content           → ignored here (responder will stream the final text)

      on_chat_model_end (planner node)
        had tool_calls    → finish_reason:"tool_calls" + build planner_id_by_tool map

      on_tool_end
        result            → custom: data: {"tool_result":{...}}

      on_chain_end (responder)
        final_text        → choices[0].delta.content chunks + finish_reason:"stop"
    """
    request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    def chunk(delta: dict, finish_reason: str | None = None) -> str:
        return openai_chunk(request_id, delta, finish_reason)

    lc_messages = []
    for m in messages:
        role, content = m.get("role", ""), m.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))

    initial_state: AgentState = {
        "messages": lc_messages,
        "tool_calls": [],
        "tool_results": [],
        "final_text": "",
        "_llm_content": "",
    }

    # Maps tool name → LLM-assigned call ID (built at on_chat_model_end)
    # Used so on_tool_end can emit the same ID that appeared in tool_calls delta
    planner_id_by_tool: dict[str, str] = {}

    async for event in GRAPH.astream_events(initial_state, version="v2"):
        kind = event.get("event", "")
        name = event.get("name", "")
        node = event.get("metadata", {}).get("langgraph_node", "")

        # ── Live token / tool-call-chunk streaming from the planner LLM ───────
        if kind == "on_chat_model_stream" and node == "planner":
            ai_chunk = event["data"]["chunk"]
            delta: dict = {}

            # Reasoning tokens (e.g. deepseek-r1, o1)
            reasoning = (
                ai_chunk.additional_kwargs.get("reasoning_content")
                or ai_chunk.additional_kwargs.get("reasoning")
            )
            if reasoning:
                delta["reasoning_content"] = reasoning

            # Text content — stream live when the model replies without tools
            if ai_chunk.content and not ai_chunk.tool_call_chunks:
                delta["content"] = ai_chunk.content

            # Tool call argument chunks — stream them live as the LLM writes them
            if ai_chunk.tool_call_chunks:
                tc_deltas = []
                for tcc in ai_chunk.tool_call_chunks:
                    td: dict = {"index": tcc.get("index", 0)}
                    if tcc.get("id"):
                        td["id"] = tcc["id"]
                        td["type"] = "function"
                        td["function"] = {"name": tcc.get("name", ""), "arguments": ""}
                    if tcc.get("args"):
                        td.setdefault("function", {})["arguments"] = tcc["args"]
                    tc_deltas.append(td)
                if tc_deltas:
                    delta["tool_calls"] = tc_deltas

            if delta:
                yield chunk(delta)

        # ── LLM finished — build ID map, signal tool-calls step complete ──────
        elif kind == "on_chat_model_end" and node == "planner":
            output = event["data"]["output"]
            if output.tool_calls:
                planner_id_by_tool = {tc["name"]: tc["id"] for tc in output.tool_calls}
                yield chunk({}, finish_reason="tool_calls")

        # ── Tool finished — emit custom tool_result extension ─────────────────
        elif kind == "on_tool_end":
            tc_id = planner_id_by_tool.get(name, event.get("run_id", uuid.uuid4().hex))

            raw = event["data"].get("output")
            if isinstance(raw, ToolMessage):
                try:
                    result = json.loads(raw.content) if isinstance(raw.content, str) else raw.content
                except (json.JSONDecodeError, TypeError):
                    result = raw.content
            elif isinstance(raw, dict):
                result = raw
            else:
                result = str(raw) if raw is not None else None

            # Brief pause so the UI's "Running" badge is visible
            await asyncio.sleep(0.5)
            yield sse({"tool_result": {"toolCallId": tc_id, "toolName": name, "result": result}})

        # ── Responder assembled the final text — stream it word-by-word ───────
        elif kind == "on_chain_end" and name == "responder":
            final_text: str = event["data"].get("output", {}).get("final_text", "")
            for word in final_text.split(" "):
                yield chunk({"content": word + " "})
                await asyncio.sleep(0.02)

    yield chunk({}, finish_reason="stop")
    yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Zola LangGraph Agent Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    return StreamingResponse(
        run_agent_stream(body.get("messages", [])),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [{
            "id": "test-agent",
            "object": "model",
            "created": int(time.time()),
            "owned_by": "local",
            "description": f"LangGraph agent via {_LLM_MODEL}",
        }],
    }


@app.get("/health")
async def health():
    return {"status": "ok", "model": _LLM_MODEL, "tools": list(TOOLS_BY_NAME.keys())}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
