#!/usr/bin/env python3
"""
test_agent_server.py
--------------------
Sophisticated LangGraph agent server demonstrating:

  1. Five tools covering different domains:
       query_database   — read-only analytics query (no approval needed)
       write_database   — modifies data (REQUIRES human approval via interrupt)
       retrieve_documents — semantic document search (no approval)
       web_search       — simulated web search (no approval)
       calculate        — math expression evaluator (no approval)

  2. LangGraph MemorySaver checkpointer for stateful conversations.

  3. get_stream_writer() for live progress updates emitted from inside nodes.
     These appear in the SSE stream as custom agent_progress events.

  4. interrupt() in interrupt_node — the graph pauses and a tool_interrupt
     SSE event is pushed to the client, which shows an approval UI.
     On resume, the graph continues from the checkpointed state.

  5. Multi-step reasoning graph:
       planner → [route] → executor → synthesizer → END
                         → interrupt_node → executor

  6. A /v1/agent/resume endpoint to continue an interrupted graph.

Custom SSE extension events (in addition to standard OpenAI SSE):
  data: {"agent_progress": {"phase":"...", "message":"...", "step":N, "total":N}}
  data: {"tool_result": {"toolCallId":"...","toolName":"...","result":{...}}}
  data: {"tool_interrupt": {"toolCallId":"...","toolName":"...","prompt":"...",
                             "details":{...},"thread_id":"..."}}

These are consumed by Zola's agent-stream.ts converter.

Config (env vars):
  LLM_BASE_URL  defaults to https://openrouter.ai/api/v1
  LLM_API_KEY   required
  LLM_MODEL     defaults to openai/gpt-4o-mini

Run:
  LLM_API_KEY=sk-or-... .venv/bin/python test_agent_server.py
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
    # Simulated database with realistic data
    all_data = {
        "products": [
            {"id": 1, "name": "Widget Pro",  "revenue": 42_000, "units": 840,  "quarter": "Q4 2024", "category": "hardware"},
            {"id": 2, "name": "Gadget Max",  "revenue": 31_500, "units": 630,  "quarter": "Q4 2024", "category": "hardware"},
            {"id": 3, "name": "Device Lite", "revenue": 18_750, "units": 1_250, "quarter": "Q4 2024", "category": "software"},
            {"id": 4, "name": "Cloud Suite", "revenue": 95_000, "units": 190,  "quarter": "Q4 2024", "category": "software"},
            {"id": 5, "name": "Analytics+",  "revenue": 67_200, "units": 448,  "quarter": "Q4 2024", "category": "software"},
        ],
        "users": [
            {"id": 1, "name": "Alice Chen",   "plan": "enterprise", "mrr": 2_400, "joined": "2023-03"},
            {"id": 2, "name": "Bob Martinez", "plan": "pro",        "mrr":   149, "joined": "2023-09"},
            {"id": 3, "name": "Carol Smith",  "plan": "enterprise", "mrr": 1_800, "joined": "2024-01"},
        ],
        "metrics": [
            {"metric": "total_mrr",      "value": 284_000, "change_pct": 12.3},
            {"metric": "churn_rate",     "value":    2.1,  "change_pct": -0.4},
            {"metric": "nps_score",      "value":   67,    "change_pct":  3.2},
            {"metric": "active_users",   "value": 14_820,  "change_pct":  8.7},
        ],
    }

    sql_lower = sql.lower()
    if "user" in sql_lower:
        return {"query": sql, "table": "users", "row_count": 3, "rows": all_data["users"]}
    elif "metric" in sql_lower or "kpi" in sql_lower or "mrr" in sql_lower:
        return {"query": sql, "table": "metrics", "row_count": 4, "rows": all_data["metrics"]}
    else:
        return {"query": sql, "table": "products", "row_count": 5, "rows": all_data["products"]}


@tool
def write_database(table: str, operation: str, data: dict) -> dict:
    """Write, update, or delete records in the database. ⚠️ This operation modifies data.

    Args:
        table: Target table name (e.g. 'products', 'users', 'metrics')
        operation: One of 'insert', 'update', 'delete'
        data: The record data for insert/update, or filter criteria for delete
    """
    # In reality this would modify the DB. Here we simulate success.
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
    """Search the knowledge base using semantic similarity and return the most relevant documents.

    Args:
        query:  Natural language search query
        top_k:  Number of documents to retrieve (default 3, max 5)
    """
    all_docs = [
        {
            "id": "doc_001",
            "title": "Q4 2024 Business Performance Report",
            "content": "Revenue exceeded targets by 12%. Enterprise segment grew 24% YoY. APAC region launched successfully with 340 new customers. Cloud Suite became the top-selling product.",
            "score": 0.96,
            "source": "reports/q4-2024-performance.pdf",
            "tags": ["revenue", "growth", "enterprise"],
        },
        {
            "id": "doc_002",
            "title": "Competitive Landscape Analysis",
            "content": "Market share grew from 19.1% to 23.4%. Three main competitors: Acme Corp (31%), TechCo (18%), NovaSoft (12%). Differentiation through AI-first approach and superior UX.",
            "score": 0.89,
            "source": "research/competitive-analysis-2024.pdf",
            "tags": ["market", "competition", "strategy"],
        },
        {
            "id": "doc_003",
            "title": "Product Roadmap 2025",
            "content": "Q1: AI assistant integration. Q2: API-first redesign and GraphQL support. Q3: Mobile apps launch. Q4: Enterprise SSO and advanced analytics dashboard.",
            "score": 0.83,
            "source": "product/roadmap-2025.md",
            "tags": ["roadmap", "features", "AI"],
        },
        {
            "id": "doc_004",
            "title": "Customer Onboarding Playbook",
            "content": "Best practices for 60-day onboarding. Key milestones: data import (day 1), team training (day 7), first report (day 14), automation setup (day 30), ROI review (day 60).",
            "score": 0.78,
            "source": "success/onboarding-playbook.pdf",
            "tags": ["onboarding", "customers", "success"],
        },
        {
            "id": "doc_005",
            "title": "Security & Compliance Framework",
            "content": "SOC 2 Type II certified. GDPR and CCPA compliant. Data encrypted at rest (AES-256) and in transit (TLS 1.3). Annual penetration testing. ISO 27001 certification in progress.",
            "score": 0.71,
            "source": "legal/security-compliance.pdf",
            "tags": ["security", "compliance", "GDPR"],
        },
    ]
    top_k = min(int(top_k), 5)
    return {"query": query, "total_retrieved": top_k, "documents": all_docs[:top_k]}


@tool
def web_search(query: str, num_results: int = 4) -> dict:
    """Search the web for current information, news, and external data.

    Args:
        query:       Search query string
        num_results: Number of results to return (default 4)
    """
    # Simulated web search results
    results = [
        {
            "url": "https://techcrunch.com/2025/02/ai-market-growth",
            "title": "AI Market Expected to Reach $1.8T by 2030",
            "snippet": f"Analysts project the global AI market will grow at 38% CAGR. Enterprise adoption is the primary driver, with SaaS and analytics platforms leading deployment.",
            "published": "2025-02-18",
        },
        {
            "url": "https://gartner.com/insights/2025-tech-predictions",
            "title": "Gartner's Top 10 Tech Trends for 2025",
            "snippet": "AI agents, autonomous systems, and edge computing top the list. 80% of enterprises will have deployed at least one AI agent by end of 2025.",
            "published": "2025-01-15",
        },
        {
            "url": "https://bloomberg.com/news/saas-consolidation-2025",
            "title": "SaaS Consolidation Wave Accelerates",
            "snippet": f"Related to '{query}': Major SaaS players are acquiring AI startups to strengthen their offering. M&A activity up 67% compared to 2024.",
            "published": "2025-02-10",
        },
        {
            "url": "https://hbr.org/2025/strategy/data-driven-decisions",
            "title": "How Data-Driven Companies Outperform Peers",
            "snippet": "Companies that use analytics tools consistently outperform peers by 2.3x on key financial metrics. Real-time data access is the biggest differentiator.",
            "published": "2025-02-05",
        },
    ]
    return {"query": query, "num_results": num_results, "results": results[:num_results]}


@tool
def calculate(expression: str) -> dict:
    """Evaluate mathematical expressions and perform calculations.

    Args:
        expression: A mathematical expression (e.g., '42000 * 1.12', 'sqrt(2500)', '(95000 + 67200) / 2')
    """
    try:
        # Safe eval with only math functions
        allowed_names = {k: v for k, v in math.__dict__.items() if not k.startswith("_")}
        allowed_names.update({"abs": abs, "round": round, "min": min, "max": max, "sum": sum})
        result = eval(expression, {"__builtins__": {}}, allowed_names)  # noqa: S307
        return {
            "expression": expression,
            "result": result,
            "formatted": f"{result:,.2f}" if isinstance(result, float) else f"{result:,}",
        }
    except Exception as e:
        return {"expression": expression, "error": str(e)}


# ---------------------------------------------------------------------------
# Tool registry
# ---------------------------------------------------------------------------

TOOLS = [query_database, write_database, retrieve_documents, web_search, calculate]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}
APPROVAL_REQUIRED_TOOLS = {"write_database"}

_llm_with_tools = _llm.bind_tools(TOOLS)


# ---------------------------------------------------------------------------
# Graph state
# ---------------------------------------------------------------------------

class AgentState(TypedDict):
    messages:    list       # LangChain message objects from user
    tool_calls:  list       # [{id, name, args}] chosen by planner
    tool_results: list      # [{id, name, result}] from executor
    final_text:  str        # Final response text
    _llm_content: str       # Direct LLM content for no-tool path
    approvals:   dict       # {tool_call_id: "approved"|"denied"|"skipped"}
    _thread_id:  str        # Stored so interrupt payload includes it


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def planner_node(state: AgentState) -> AgentState:
    """Call the LLM with all tools bound. Streaming handled by astream_events."""
    response = _llm_with_tools.invoke(state["messages"])
    tool_calls = [
        {"id": tc["id"], "name": tc["name"], "args": tc["args"]}
        for tc in (response.tool_calls or [])
    ]
    return {**state, "tool_calls": tool_calls, "_llm_content": response.content}


def route_after_planner(state: AgentState) -> str:
    """Decide next node based on planner output."""
    if not state.get("tool_calls"):
        return "end"  # LLM answered directly; graph stops after planner
    needs_approval = any(
        tc["name"] in APPROVAL_REQUIRED_TOOLS for tc in state["tool_calls"]
    )
    return "interrupt" if needs_approval else "executor"


def interrupt_node(state: AgentState) -> AgentState:
    """Human-in-the-loop gate: pauses graph and requests user approval.

    On first pass: calls interrupt() → graph suspends → client gets tool_interrupt event.
    On resume:     interrupt() returns the user's action → stores in approvals.
    """
    approval_calls = [
        tc for tc in state["tool_calls"] if tc["name"] in APPROVAL_REQUIRED_TOOLS
    ]
    if not approval_calls:
        return state

    call = approval_calls[0]

    interrupt_payload = {
        "toolCallId": call["id"],
        "toolName":   call["name"],
        "prompt":     (
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

    # ── SUSPEND ── graph pauses here; resumes when client calls /v1/agent/resume
    action: str = interrupt(interrupt_payload)

    # ── RESUMED ── action is "approved", "denied", or "skipped"
    approvals = dict(state.get("approvals") or {})
    approvals[call["id"]] = action
    return {**state, "approvals": approvals}


async def executor_node(state: AgentState) -> AgentState:
    """Execute each planned tool call."""
    results = []
    approvals = state.get("approvals") or {}

    for call in state["tool_calls"]:
        tool_name = call["name"]
        call_id   = call["id"]

        # Check approval for protected tools
        if tool_name in APPROVAL_REQUIRED_TOOLS:
            action = approvals.get(call_id, "denied")
            if action != "approved":
                results.append({
                    "id": call_id, "name": tool_name,
                    "result": {"status": f"Operation {action} by user", "success": False},
                })
                continue

        fn = TOOLS_BY_NAME.get(tool_name)
        if fn:
            try:
                result = fn.invoke(call["args"])
            except Exception as exc:
                result = {"error": str(exc)}
        else:
            result = {"error": f"Unknown tool: {tool_name}"}

        results.append({"id": call_id, "name": tool_name, "result": result})
        await asyncio.sleep(0.4)  # Small delay so the "Running" badge is visible

    return {**state, "tool_results": results}


def synthesizer_node(state: AgentState) -> AgentState:
    """Call the LLM to produce a natural language response from the tool results.

    The streaming tokens appear via on_chat_model_stream (node='synthesizer').
    """
    if not state.get("tool_results"):
        # No tools ran — the planner already produced the answer
        return {**state, "final_text": state.get("_llm_content", "")}

    # Build a message history that includes the tool results
    messages = list(state["messages"])

    # Add the AI message that contained tool calls
    lc_tool_calls = [
        {"id": tc["id"], "name": tc["name"], "args": tc["args"]}
        for tc in state["tool_calls"]
    ]
    messages.append(AIMessage(content="", tool_calls=lc_tool_calls))

    # Add each tool result
    for tr in state["tool_results"]:
        messages.append(ToolMessage(
            content=json.dumps(tr["result"]),
            tool_call_id=tr["id"],
            name=tr["name"],
        ))

    # Let the LLM synthesize a natural, markdown-formatted response
    response = _llm.invoke(messages)
    return {**state, "final_text": response.content}


# ---------------------------------------------------------------------------
# Build graph with MemorySaver checkpointer
# ---------------------------------------------------------------------------

_memory = MemorySaver()


def _build_graph():
    wf = StateGraph(AgentState)

    wf.add_node("planner",       planner_node)
    wf.add_node("interrupt_node", interrupt_node)
    wf.add_node("executor",      executor_node)
    wf.add_node("synthesizer",   synthesizer_node)

    wf.set_entry_point("planner")

    wf.add_conditional_edges(
        "planner",
        route_after_planner,
        {"end": END, "interrupt": "interrupt_node", "executor": "executor"},
    )
    wf.add_edge("interrupt_node", "executor")
    wf.add_edge("executor",       "synthesizer")
    wf.add_edge("synthesizer",    END)

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
# Shared event processing
# ---------------------------------------------------------------------------

async def _process_events(
    event_stream: AsyncGenerator,
    chunk_fn,
    planner_id_by_tool: dict[str, str],
) -> AsyncGenerator[str, None]:
    """
    Async generator that processes astream_events and yields SSE strings.

    Progress events are inferred from standard LangGraph events:
      on_chain_start (planner)    → "planning" phase
      on_tool_start               → "executing" phase per tool
      on_chat_model_start (syn.)  → "synthesizing" phase
    """
    had_natural_finish = False
    tool_count: dict[str, int] = {}   # track how many tools have started

    async for event in event_stream:
        kind = event.get("event", "")
        name = event.get("name", "")
        node = event.get("metadata", {}).get("langgraph_node", "")

        # ── Infer progress from standard events ───────────────────────────────
        # on_chat_model_start fires once per LLM call inside a node (more precise)
        if kind == "on_chat_model_start" and node == "planner":
            yield sse({"agent_progress": {
                "phase": "planning", "message": "Analyzing your request and selecting tools...",
            }})
            continue

        if kind == "on_tool_start":
            tool_count[name] = tool_count.get(name, 0) + 1
            yield sse({"agent_progress": {
                "phase": "executing", "message": f"Running {name}...",
            }})
            continue

        if kind == "on_chain_start" and node == "synthesizer":
            yield sse({"agent_progress": {
                "phase": "synthesizing", "message": "Synthesizing response from tool results...",
            }})
            continue

        # ── Planner LLM: live token / tool-call streaming ─────────────────────
        if kind == "on_chat_model_stream" and node == "planner":
            ai_chunk = event["data"]["chunk"]
            delta: dict = {}

            # Reasoning tokens (deepseek-r1, o1, etc.)
            reasoning = (
                ai_chunk.additional_kwargs.get("reasoning_content")
                or ai_chunk.additional_kwargs.get("reasoning")
            )
            if reasoning:
                delta["reasoning_content"] = reasoning

            # Text content — stream when LLM answers directly (no tool calls)
            if ai_chunk.content and not ai_chunk.tool_call_chunks:
                delta["content"] = ai_chunk.content

            # Tool-call argument chunks
            if ai_chunk.tool_call_chunks:
                tc_deltas = []
                for tcc in ai_chunk.tool_call_chunks:
                    td: dict = {"index": tcc.get("index", 0)}
                    if tcc.get("id"):
                        td["id"]   = tcc["id"]
                        td["type"] = "function"
                        td["function"] = {"name": tcc.get("name", ""), "arguments": ""}
                    if tcc.get("args"):
                        td.setdefault("function", {})["arguments"] = tcc["args"]
                    tc_deltas.append(td)
                if tc_deltas:
                    delta["tool_calls"] = tc_deltas

            if delta:
                yield chunk_fn(delta)

        # ── Planner LLM: finished ─────────────────────────────────────────────
        elif kind == "on_chat_model_end" and node == "planner":
            output = event["data"]["output"]
            if output.tool_calls:
                planner_id_by_tool.update({tc["name"]: tc["id"] for tc in output.tool_calls})
                yield chunk_fn({}, finish_reason="tool_calls")
            else:
                # Direct answer — mark finish; stop emitted after loop
                had_natural_finish = True

        # ── Synthesizer LLM: stream the final answer ──────────────────────────
        elif kind == "on_chat_model_stream" and node == "synthesizer":
            ai_chunk = event["data"]["chunk"]
            if ai_chunk.content and not ai_chunk.tool_call_chunks:
                yield chunk_fn({"content": ai_chunk.content})

        # ── Synthesizer LLM: finished ─────────────────────────────────────────
        elif kind == "on_chat_model_end" and node == "synthesizer":
            had_natural_finish = True

        # ── Tool completed ────────────────────────────────────────────────────
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

            await asyncio.sleep(0.5)  # Let "Running" badge be visible briefly
            yield sse({"tool_result": {"toolCallId": tc_id, "toolName": name, "result": result}})

    # Signal whether it ended naturally (vs interrupt)
    # We abuse the return mechanism of generators — callers must drain fully
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
        "messages":    lc_messages,
        "tool_calls":  [],
        "tool_results": [],
        "final_text":  "",
        "_llm_content": "",
        "approvals":   {},
        "_thread_id":  thread_id,
    }

    thread_config = {"configurable": {"thread_id": thread_id}}
    planner_id_by_tool: dict[str, str] = {}
    had_natural_finish = False

    event_gen = GRAPH.astream_events(initial_state, config=thread_config, version="v2")

    async for part in _process_events(event_gen, chunk, planner_id_by_tool):
        if part == "__HAD_NATURAL_FINISH__":
            had_natural_finish = True
        else:
            yield part

    # ── Check for pending interrupt (graph suspended) ─────────────────────────
    if not had_natural_finish:
        try:
            state = await GRAPH.aget_state(thread_config)
            if state.interrupts:
                interrupt_value = state.interrupts[0].value
                yield sse({"tool_interrupt": interrupt_value})
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

    # Read the pending state to recover tool call IDs (needed to correlate tool_end events)
    planner_id_by_tool: dict[str, str] = {}
    pending_tool_calls: list[dict] = []
    try:
        state = await GRAPH.aget_state(thread_config)
        tc_list = state.values.get("tool_calls", [])
        planner_id_by_tool = {tc["name"]: tc["id"] for tc in tc_list}
        pending_tool_calls  = [tc for tc in tc_list if tc["name"] in APPROVAL_REQUIRED_TOOLS]
    except Exception as exc:
        print(f"[resume] Failed to read state: {exc}")

    # Emit synthetic tool-call announcement so the UI shows "Running → Completed" cards
    if action == "approved" and pending_tool_calls:
        tc_deltas = []
        for i, tc in enumerate(pending_tool_calls):
            tc_deltas.append({
                "index":    i,
                "id":       tc["id"],
                "type":     "function",
                "function": {"name": tc["name"], "arguments": json.dumps(tc["args"])},
            })
        yield chunk({"tool_calls": tc_deltas})
        yield chunk({}, finish_reason="tool_calls")

    had_natural_finish = False

    event_gen = GRAPH.astream_events(Command(resume=action), config=thread_config, version="v2")

    async for part in _process_events(event_gen, chunk, planner_id_by_tool):
        if part == "__HAD_NATURAL_FINISH__":
            had_natural_finish = True
        else:
            yield part

    if not had_natural_finish:
        # Unexpected — guard against another interrupt loop in demo
        pass

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
    body = await request.json()
    messages   = body.get("messages", [])
    # thread_id is passed by Zola's route.ts so interrupts can be resumed
    thread_id  = body.get("thread_id", f"anon-{uuid.uuid4().hex[:12]}")

    return StreamingResponse(
        run_agent_stream(messages, thread_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/v1/agent/resume")
async def agent_resume(request: Request):
    body      = await request.json()
    thread_id = body.get("thread_id", "")
    action    = body.get("action", "denied")  # "approved" | "denied" | "skipped"

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
            "description": f"LangGraph multi-tool agent via {_LLM_MODEL}",
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
