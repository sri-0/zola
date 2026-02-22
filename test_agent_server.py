#!/usr/bin/env python3
"""
test_agent_server.py
--------------------
LangGraph ReAct agent server.

Graph: planner ↔ executor loop (ReAct style).
  planner  — LLM with tools; if it returns tool calls → executor
             else → END (its last message IS the final answer)
  executor — runs each tool, appends ToolMessages, loops back to planner

Special path:
  If any tool requires approval, route to interrupt_node first.
  interrupt() pauses the graph; /v1/agent/resume resumes it.

Custom SSE extensions (layered on top of OpenAI SSE format):
  {"agent_progress": {"phase":"...","message":"..."}}
  {"tool_result":    {"toolCallId":"...","toolName":"...","result":{...}}}
  {"tool_interrupt": {"toolCallId":"...","toolName":"...","prompt":"...",
                      "details":{...},"thread_id":"..."}}
"""

import asyncio
import json
import math
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
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import Command, interrupt


# ---------------------------------------------------------------------------
# LLM configuration
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
def query_database(sql: str) -> dict:
    """Query the internal analytics database. Read-only; returns rows matching the query.

    Args:
        sql: SQL-like query string describing what data to fetch
    """
    all_data = {
        "products": [
            {"id": 1, "name": "Widget Pro",  "revenue": 42_000, "units": 840,  "quarter": "Q4 2024"},
            {"id": 2, "name": "Gadget Max",  "revenue": 31_500, "units": 630,  "quarter": "Q4 2024"},
            {"id": 3, "name": "Device Lite", "revenue": 18_750, "units": 1_250, "quarter": "Q4 2024"},
            {"id": 4, "name": "Cloud Suite", "revenue": 95_000, "units": 190,  "quarter": "Q4 2024"},
            {"id": 5, "name": "Analytics+",  "revenue": 67_200, "units": 448,  "quarter": "Q4 2024"},
        ],
        "orders": [
            {"order_id": 1001, "customer": "Alice Chen",   "amount": 2_400, "date": "2024-10-15"},
            {"order_id": 1002, "customer": "Bob Martinez", "amount":   149, "date": "2024-10-22"},
            {"order_id": 1003, "customer": "Carol Smith",  "amount": 1_800, "date": "2024-11-03"},
            {"order_id": 1004, "customer": "David Lee",    "amount":   320, "date": "2024-11-18"},
            {"order_id": 1005, "customer": "Eva Patel",    "amount": 4_500, "date": "2024-12-01"},
            {"order_id": 1006, "customer": "Frank Wu",     "amount":   980, "date": "2024-12-08"},
            {"order_id": 1007, "customer": "Grace Kim",    "amount": 2_150, "date": "2024-12-14"},
            {"order_id": 1008, "customer": "Henry James",  "amount":   720, "date": "2024-12-20"},
        ],
        "users": [
            {"id": 1, "name": "Alice Chen",   "plan": "enterprise", "mrr": 2_400},
            {"id": 2, "name": "Bob Martinez", "plan": "pro",        "mrr":   149},
            {"id": 3, "name": "Carol Smith",  "plan": "enterprise", "mrr": 1_800},
        ],
        "metrics": [
            {"metric": "total_mrr",    "value": 284_000, "change_pct": 12.3},
            {"metric": "churn_rate",   "value":     2.1, "change_pct": -0.4},
            {"metric": "nps_score",    "value":      67, "change_pct":  3.2},
            {"metric": "active_users", "value":  14_820, "change_pct":  8.7},
        ],
    }
    sql_lower = sql.lower()
    if "order" in sql_lower:
        return {"query": sql, "table": "orders", "row_count": 8, "rows": all_data["orders"]}
    elif "user" in sql_lower:
        return {"query": sql, "table": "users",  "row_count": 3, "rows": all_data["users"]}
    elif "metric" in sql_lower or "kpi" in sql_lower or "mrr" in sql_lower:
        return {"query": sql, "table": "metrics", "row_count": 4, "rows": all_data["metrics"]}
    else:
        return {"query": sql, "table": "products", "row_count": 5, "rows": all_data["products"]}


@tool
def write_database(table: str, operation: str, data: dict) -> dict:
    """Write, update, or delete records in the database. This operation modifies data.

    Args:
        table:     Target table name (e.g. 'products', 'users', 'orders')
        operation: One of 'insert', 'update', 'delete'
        data:      The record data for insert/update, or filter criteria for delete
    """
    return {
        "success": True,
        "table": table,
        "operation": operation,
        "rows_affected": 1,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "data": data,
    }


@tool
def retrieve_documents(query: str, top_k: int = 3) -> dict:
    """Search the knowledge base using semantic similarity.

    Args:
        query: Natural language search query
        top_k: Number of documents to retrieve (default 3, max 5)
    """
    docs = [
        {"id": "doc_001", "title": "Q4 2024 Business Performance Report",
         "content": "Revenue exceeded targets by 12%. Enterprise segment grew 24% YoY. Cloud Suite became the top-selling product.",
         "score": 0.96, "source": "reports/q4-2024-performance.pdf"},
        {"id": "doc_002", "title": "Competitive Landscape Analysis",
         "content": "Market share grew from 19.1% to 23.4%. Three main competitors: Acme Corp (31%), TechCo (18%), NovaSoft (12%).",
         "score": 0.89, "source": "research/competitive-analysis-2024.pdf"},
        {"id": "doc_003", "title": "Product Roadmap 2025",
         "content": "Q1: AI assistant integration. Q2: API-first redesign. Q3: Mobile apps. Q4: Enterprise SSO.",
         "score": 0.83, "source": "product/roadmap-2025.md"},
    ]
    return {"query": query, "total_retrieved": min(int(top_k), 5), "documents": docs[:top_k]}


@tool
def web_search(query: str, num_results: int = 4) -> dict:
    """Search the web for current information and news.

    Args:
        query:       Search query string
        num_results: Number of results to return (default 4)
    """
    results = [
        {"url": "https://techcrunch.com/2025/02/ai-market-growth",
         "title": "AI Market Expected to Reach $1.8T by 2030",
         "snippet": "Analysts project 38% CAGR. Enterprise adoption is the primary driver.",
         "published": "2025-02-18"},
        {"url": "https://gartner.com/insights/2025-tech-predictions",
         "title": "Gartner's Top 10 Tech Trends for 2025",
         "snippet": "AI agents and autonomous systems top the list. 80% of enterprises will deploy at least one AI agent by end of 2025.",
         "published": "2025-01-15"},
        {"url": "https://bloomberg.com/news/saas-consolidation-2025",
         "title": "SaaS Consolidation Wave Accelerates",
         "snippet": f"Related to '{query}': Major SaaS players acquiring AI startups. M&A activity up 67%.",
         "published": "2025-02-10"},
    ]
    return {"query": query, "results": results[:num_results]}


@tool
def calculate(expression: str) -> dict:
    """Evaluate a mathematical expression.

    Args:
        expression: A math expression e.g. '50000 / 8', 'sqrt(2500)', '(95000 + 67200) / 2'
    """
    try:
        allowed = {k: v for k, v in math.__dict__.items() if not k.startswith("_")}
        allowed.update({"abs": abs, "round": round, "min": min, "max": max, "sum": sum})
        result = eval(expression, {"__builtins__": {}}, allowed)  # noqa: S307
        return {
            "expression": expression,
            "result": result,
            "formatted": f"{result:,.2f}" if isinstance(result, float) else f"{result:,}",
        }
    except Exception as e:
        return {"expression": expression, "error": str(e)}


TOOLS            = [query_database, write_database, retrieve_documents, web_search, calculate]
TOOLS_BY_NAME    = {t.name: t for t in TOOLS}
APPROVAL_REQUIRED_TOOLS = {"write_database"}

_llm_with_tools = _llm.bind_tools(TOOLS)


# ---------------------------------------------------------------------------
# Graph state — minimal; messages list carries everything
# ---------------------------------------------------------------------------

class AgentState(TypedDict):
    messages:    list   # Full LangChain message history (grows each round)
    approvals:   dict   # {tool_call_id: "approved"|"denied"|"skipped"}
    _thread_id:  str
    _step:       int    # Safety limit on ReAct iterations


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def planner_node(state: AgentState) -> AgentState:
    """LLM decides next action.  If it returns tool_calls → executor.
    If it returns plain text → route_after_planner sends us to END."""
    response = _llm_with_tools.invoke(state["messages"])
    return {
        **state,
        "messages": state["messages"] + [response],
        "_step":    state.get("_step", 0) + 1,
    }


def route_after_planner(state: AgentState) -> str:
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    if not tool_calls or state.get("_step", 0) >= 6:
        return "end"   # Final answer or safety limit reached
    needs_approval = any(tc["name"] in APPROVAL_REQUIRED_TOOLS for tc in tool_calls)
    return "interrupt" if needs_approval else "executor"


def interrupt_node(state: AgentState) -> AgentState:
    """Pause graph and ask the user for approval before a protected tool runs."""
    last  = state["messages"][-1]
    calls = [tc for tc in (getattr(last, "tool_calls", None) or [])
             if tc["name"] in APPROVAL_REQUIRED_TOOLS]
    if not calls:
        return state

    call = calls[0]
    payload = {
        "toolCallId": call["id"],
        "toolName":   call["name"],
        "prompt": (
            f"The agent wants to perform a **{call['args'].get('operation', 'write')}** "
            f"operation on the **{call['args'].get('table', 'database')}** table. "
            "Do you want to allow this?"
        ),
        "details": {
            "table":     call["args"].get("table", "unknown"),
            "operation": call["args"].get("operation", "unknown"),
            "data":      call["args"].get("data", {}),
        },
        "thread_id": state.get("_thread_id", ""),
    }

    # Graph suspends here; resumes when client calls /v1/agent/resume
    action: str = interrupt(payload)

    approvals = dict(state.get("approvals") or {})
    approvals[call["id"]] = action
    return {**state, "approvals": approvals}


async def executor_node(state: AgentState) -> AgentState:
    """Execute all tool calls from the latest AIMessage, append ToolMessages."""
    last      = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    approvals  = state.get("approvals") or {}
    tool_msgs: list = []

    for tc in tool_calls:
        name    = tc["name"]
        call_id = tc["id"]

        if name in APPROVAL_REQUIRED_TOOLS:
            action = approvals.get(call_id, "denied")
            if action != "approved":
                result = {"status": f"Operation {action} by user", "success": False}
                tool_msgs.append(ToolMessage(
                    content=json.dumps(result), tool_call_id=call_id, name=name))
                continue

        fn = TOOLS_BY_NAME.get(name)
        if fn:
            try:
                result = fn.invoke(tc["args"])
            except Exception as exc:
                result = {"error": str(exc)}
        else:
            result = {"error": f"Unknown tool: {name}"}

        tool_msgs.append(ToolMessage(
            content=json.dumps(result) if isinstance(result, dict) else str(result),
            tool_call_id=call_id,
            name=name,
        ))
        await asyncio.sleep(0.3)  # Slight delay so Running badge is briefly visible

    return {**state, "messages": state["messages"] + tool_msgs}


# ---------------------------------------------------------------------------
# Build graph
# ---------------------------------------------------------------------------

_memory = MemorySaver()


def _build_graph():
    wf = StateGraph(AgentState)

    wf.add_node("planner",       planner_node)
    wf.add_node("interrupt_node", interrupt_node)
    wf.add_node("executor",      executor_node)

    wf.set_entry_point("planner")

    wf.add_conditional_edges(
        "planner",
        route_after_planner,
        {"end": END, "interrupt": "interrupt_node", "executor": "executor"},
    )
    wf.add_edge("interrupt_node", "executor")
    wf.add_edge("executor",       "planner")   # ← ReAct loop back

    return wf.compile(checkpointer=_memory)


GRAPH = _build_graph()


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
# Shared event processing (handles N ReAct rounds)
# ---------------------------------------------------------------------------

async def _process_events(
    event_stream: AsyncGenerator,
    chunk_fn,
    pending_tool_call_ids: list,  # mutable list — caller owns it
) -> AsyncGenerator[str, None]:
    """
    Processes astream_events for a ReAct loop and yields SSE strings.

    Progress is inferred from standard LangGraph events:
      on_chat_model_start (planner) → "planning" phase (fires every round)
      on_tool_start                 → "executing" phase per tool
    """
    had_natural_finish = False

    async for event in event_stream:
        kind = event.get("event", "")
        name = event.get("name", "")
        node = event.get("metadata", {}).get("langgraph_node", "")

        # ── Progress inferred from standard events ─────────────────────────
        if kind == "on_chat_model_start" and node == "planner":
            yield sse({"agent_progress": {
                "phase": "planning", "message": "Analyzing...",
            }})
            continue

        if kind == "on_tool_start":
            yield sse({"agent_progress": {
                "phase": "executing", "message": f"Running {name}...",
            }})
            continue

        # ── Planner LLM: live token / tool-call streaming ──────────────────
        if kind == "on_chat_model_stream" and node == "planner":
            ai_chunk = event["data"]["chunk"]
            delta: dict = {}

            reasoning = (
                ai_chunk.additional_kwargs.get("reasoning_content")
                or ai_chunk.additional_kwargs.get("reasoning")
            )
            if reasoning:
                delta["reasoning_content"] = reasoning

            if ai_chunk.content and not ai_chunk.tool_call_chunks:
                delta["content"] = ai_chunk.content

            if ai_chunk.tool_call_chunks:
                tc_deltas = []
                for tcc in ai_chunk.tool_call_chunks:
                    td: dict = {"index": tcc.get("index", 0)}
                    if tcc.get("id"):
                        td["id"]       = tcc["id"]
                        td["type"]     = "function"
                        td["function"] = {"name": tcc.get("name", ""), "arguments": ""}
                    if tcc.get("args"):
                        td.setdefault("function", {})["arguments"] = tcc["args"]
                    tc_deltas.append(td)
                if tc_deltas:
                    delta["tool_calls"] = tc_deltas

            if delta:
                yield chunk_fn(delta)

        # ── Planner LLM: finished ──────────────────────────────────────────
        elif kind == "on_chat_model_end" and node == "planner":
            output = event["data"]["output"]
            if output.tool_calls:
                # Queue tool call IDs so on_tool_end can correlate (FIFO)
                pending_tool_call_ids.extend(tc["id"] for tc in output.tool_calls)
                yield chunk_fn({}, finish_reason="tool_calls")
            else:
                # No more tool calls — planner produced the final answer
                had_natural_finish = True

        # ── Tool completed ─────────────────────────────────────────────────
        elif kind == "on_tool_end":
            # Match to queued tool call ID (sequential execution → FIFO is correct)
            tc_id = (pending_tool_call_ids.pop(0)
                     if pending_tool_call_ids
                     else event.get("run_id", uuid.uuid4().hex))

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

            await asyncio.sleep(0.4)  # Brief pause so Running badge is visible
            yield sse({"tool_result": {"toolCallId": tc_id, "toolName": name, "result": result}})

    if had_natural_finish:
        yield "__HAD_NATURAL_FINISH__"


# ---------------------------------------------------------------------------
# Agent stream (new conversation turn)
# ---------------------------------------------------------------------------

async def run_agent_stream(
    messages: list[dict],
    thread_id: str,
) -> AsyncGenerator[str, None]:
    request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    def chunk(delta: dict, finish_reason: str | None = None) -> str:
        return openai_chunk(request_id, delta, finish_reason)

    lc_messages = []
    for m in messages:
        role    = m.get("role", "")
        content = m.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))

    initial_state: AgentState = {
        "messages":   lc_messages,
        "approvals":  {},
        "_thread_id": thread_id,
        "_step":      0,
    }

    thread_config            = {"configurable": {"thread_id": thread_id}}
    pending_tool_call_ids: list[str] = []
    had_natural_finish       = False

    event_gen = GRAPH.astream_events(initial_state, config=thread_config, version="v2")

    async for part in _process_events(event_gen, chunk, pending_tool_call_ids):
        if part == "__HAD_NATURAL_FINISH__":
            had_natural_finish = True
        else:
            yield part

    # Check for a pending interrupt (graph suspended waiting for user)
    if not had_natural_finish:
        try:
            state = await GRAPH.aget_state(thread_config)
            if state.interrupts:
                yield sse({"tool_interrupt": state.interrupts[0].value})
        except Exception as exc:
            print(f"[agent] Failed to read interrupt state: {exc}")

    yield chunk({}, finish_reason="stop")
    yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Resume stream (continue after human approval)
# ---------------------------------------------------------------------------

async def run_resume_stream(
    thread_id: str,
    action: str,
) -> AsyncGenerator[str, None]:
    request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    def chunk(delta: dict, finish_reason: str | None = None) -> str:
        return openai_chunk(request_id, delta, finish_reason)

    thread_config = {"configurable": {"thread_id": thread_id}}

    # Recover pending tool calls so we can emit synthetic "Running" cards in the UI
    pending_tool_calls: list[dict] = []
    try:
        state   = await GRAPH.aget_state(thread_config)
        tc_list = getattr(state.values.get("messages", [])[-1], "tool_calls", []) or []
        pending_tool_calls = [tc for tc in tc_list if tc["name"] in APPROVAL_REQUIRED_TOOLS]
    except Exception as exc:
        print(f"[resume] Failed to read state: {exc}")

    # Synthetic tool-call announcement so UI shows Running → result for any action
    if pending_tool_calls:
        tc_deltas = [
            {
                "index":    i,
                "id":       tc["id"],
                "type":     "function",
                "function": {"name": tc["name"], "arguments": json.dumps(tc["args"])},
            }
            for i, tc in enumerate(pending_tool_calls)
        ]
        yield chunk({"tool_calls": tc_deltas})
        yield chunk({}, finish_reason="tool_calls")

    # Pre-seed the FIFO queue with the IDs from the synthetic announcement so that
    # on_tool_end events (which lack the original call ID) are matched correctly.
    pending_tool_call_ids: list[str] = [tc["id"] for tc in pending_tool_calls]
    had_natural_finish = False

    event_gen = GRAPH.astream_events(Command(resume=action), config=thread_config, version="v2")

    async for part in _process_events(event_gen, chunk, pending_tool_call_ids):
        if part == "__HAD_NATURAL_FINISH__":
            had_natural_finish = True
        else:
            yield part

    # After a resume the graph may hit ANOTHER interrupt (e.g. second write_database call).
    # Check for a new pending interrupt, same as run_agent_stream does.
    if not had_natural_finish:
        try:
            state = await GRAPH.aget_state(thread_config)
            if state.interrupts:
                yield sse({"tool_interrupt": state.interrupts[0].value})
        except Exception as exc:
            print(f"[resume] Failed to read interrupt state: {exc}")

    yield chunk({}, finish_reason="stop")
    yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# FastAPI application
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
    body      = await request.json()
    messages  = body.get("messages", [])
    thread_id = body.get("thread_id", f"anon-{uuid.uuid4().hex[:12]}")

    return StreamingResponse(
        run_agent_stream(messages, thread_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/v1/agent/resume")
async def agent_resume(request: Request):
    body      = await request.json()
    thread_id = body.get("thread_id", "")
    action    = body.get("action", "denied")

    if not thread_id:
        return {"error": "thread_id is required"}, 400

    return StreamingResponse(
        run_resume_stream(thread_id, action),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [{
            "id":          "test-agent",
            "object":      "model",
            "created":     int(time.time()),
            "owned_by":    "local",
            "description": f"LangGraph ReAct agent via {_LLM_MODEL}",
        }],
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model":  _LLM_MODEL,
        "tools":  list(TOOLS_BY_NAME.keys()),
        "approval_required": list(APPROVAL_REQUIRED_TOOLS),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
