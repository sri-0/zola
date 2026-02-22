def _vai(type_char: str, value: Any) -> str:
    return f"{type_char}:{json.dumps(value)}\n"

def vai_start_step(msg_id: str)                         -> str: return _vai("f", {"messageId": msg_id})
def vai_tool_call(tc_id, name, args)                    -> str: return _vai("9", {"toolCallId": tc_id, "toolName": name, "args": args})
def vai_tool_result(tc_id, result)                      -> str: return _vai("a", {"toolCallId": tc_id, "result": result})
def vai_text(token: str)                                -> str: return _vai("0", token)
def vai_finish_step(reason: str, continued: bool)       -> str: return _vai("e", {"finishReason": reason, "usage": _ZERO_USAGE, "isContinued": continued})
def vai_finish_message(reason: str = "stop")            -> str: return _vai("d", {"finishReason": reason, "usage": _ZERO_USAGE})

# ---------------------------------------------------------------------------
# Stream: use LangGraph astream_events — no manual sequencing needed
# ---------------------------------------------------------------------------

async def run_agent_stream(messages: list[dict]) -> AsyncGenerator[str, None]:
    """
    LangGraph's astream_events() fires events natively as the graph executes.
    We map each event type onto the Vercel AI data stream format.

    Event types we handle:
      on_chain_start  (node entry)  — emit start_step
      on_tool_start                 — emit tool_call
      on_tool_end                   — emit tool_result + simulated latency
      on_chain_end   (responder)    — stream final text word-by-word
    """
    lc_messages = []
    for m in messages:
        role = m.get("role", "")
        content = m.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))

    initial_state: AgentState = {
        "messages": lc_messages,
        "tool_calls": [],
        "tool_results": [],
        "final_text": "",
    }

    step_msg_id = f"msg-{uuid.uuid4().hex[:16]}"
    yield vai_start_step(step_msg_id)

    # astream_events streams native LangGraph events as they happen
    async for event in GRAPH.astream_events(initial_state, version="v2"):
        kind = event.get("event")
        name = event.get("name", "")

        # ── tool about to run ────────────────────────────────────────────────
        if kind == "on_tool_start":
            tool_input = event["data"].get("input", {})
            run_id    = event.get("run_id", uuid.uuid4().hex)
            tool_name = name  # snake_case from @tool decorator

            # Convert to camelCase so the UI shows "queryDatabase" / "retrieveDocuments"
            camel = "".join(w.capitalize() if i else w for i, w in enumerate(tool_name.split("_")))
            yield vai_tool_call(run_id, camel, tool_input)

        # ── tool finished ────────────────────────────────────────────────────
        elif kind == "on_tool_end":
            run_id = event.get("run_id", uuid.uuid4().hex)
            output = event["data"].get("output")
            # output may be a ToolMessage or a raw dict
            result = output.content if isinstance(output, ToolMessage) else output
            if isinstance(result, str):
                try:
                    result = json.loads(result)
                except (json.JSONDecodeError, TypeError):
                    pass
            # Small delay to make the "Running → Completed" transition visible
            await asyncio.sleep(0.4)
            yield vai_tool_result(run_id, result)

        # ── responder node finished — stream text word-by-word ───────────────
        elif kind == "on_chain_end" and name == "responder":
            output_state = event["data"].get("output", {})
            final_text: str = output_state.get("final_text", "")

            if final_text:
                # Close the tool-calling step, open a new text step
                yield vai_finish_step("tool-calls", continued=True)

                text_msg_id = f"msg-{uuid.uuid4().hex[:16]}"
                yield vai_start_step(text_msg_id)

                for word in final_text.split(" "):
                    yield vai_text(word + " ")
                    await asyncio.sleep(0.02)

    yield vai_finish_step("stop", continued=False)
    yield vai_finish_message("stop")