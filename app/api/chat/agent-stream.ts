/**
 * agent-stream.ts
 * ---------------
 * Converts the OpenAI-compatible SSE stream from the LangGraph ReAct agent
 * into a Vercel AI SDK data stream that useChat can parse on the client.
 *
 * The agent runs a ReAct loop: planner → executor → planner → ...
 * So the stream may contain N rounds of tool calls before the final answer.
 *
 * FastAPI SSE events:
 *   Standard OpenAI chunks (tool call deltas, content, finish_reason)
 *   {"agent_progress": {"phase":"...","message":"..."}}
 *   {"tool_result":    {"toolCallId":"...","toolName":"...","result":{...}}}
 *   {"tool_interrupt": {"toolCallId":"...","toolName":"...","prompt":"...",
 *                        "details":{...},"thread_id":"..."}}
 *
 * AI SDK data stream emitted per ReAct round:
 *
 *   Round with tool calls (step N, isContinued:true):
 *     f:{stepId}  →  2:[progress]  →  9:{tool}...  →  e:{tool-calls,isContinued:true}
 *
 *   Round with tool results + possibly more tool calls (step N+1):
 *     f:{stepId}  →  a:{result}...  →  [next tool call chunks]  →  e:{tool-calls,isContinued:true}
 *     ...or...
 *     f:{stepId}  →  a:{result}...  →  0:{final text}  →  e:{stop}  →  d:{stop}
 *
 *   Interrupt path (no tool results, graph suspended):
 *     f:{stepId}  →  2:[{tool_interrupt}]  →  e:{stop}  →  d:{stop}
 */

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0 }

function vai(type: string, value: unknown): string {
  return `${type}:${JSON.stringify(value)}\n`
}

function randomMsgId(): string {
  return `msg-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
}

type ToolCallAcc = { id: string; name: string; args: string }

export function convertAgentStream(
  sseStream: ReadableStream<Uint8Array>,
  { onInterrupt }: { onInterrupt?: (data: Record<string, unknown>) => void } = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let buffer = ""

  // Dynamic step management for N-round ReAct
  let currentStepId    = randomMsgId()
  let needNewStep      = false   // true after finish_reason:"tool_calls", cleared on next content
  let currentToolCallMap = new Map<number, ToolCallAcc>()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (part: string) => controller.enqueue(encoder.encode(part))

      // Always open the first step immediately
      emit(vai("f", { messageId: currentStepId }))

      // Open a new step if flagged (called before any content in the next round)
      const ensureCurrentStep = () => {
        if (needNewStep) {
          needNewStep   = false
          currentStepId = randomMsgId()
          emit(vai("f", { messageId: currentStepId }))
        }
      }

      const reader = sseStream.getReader()

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return
        const raw = line.slice(6).trim()
        if (raw === "[DONE]") return

        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw)
        } catch {
          return
        }

        // ── Custom: agent_progress ──────────────────────────────────────
        if (parsed.agent_progress) {
          const ap = parsed.agent_progress as {
            phase: string; message: string; step?: number; total?: number
          }
          ensureCurrentStep()   // progress may arrive right after a step close
          emit(vai("2", [{
            type:    "agent_progress",
            phase:   ap.phase,
            message: ap.message,
            ...(ap.step  !== undefined && { step:  ap.step }),
            ...(ap.total !== undefined && { total: ap.total }),
          }]))
          return
        }

        // ── Custom: tool_result ─────────────────────────────────────────
        if (parsed.tool_result) {
          const tr = parsed.tool_result as { toolCallId: string; result: unknown }
          ensureCurrentStep()   // open new step after tool_calls round
          emit(vai("a", { toolCallId: tr.toolCallId, result: tr.result }))
          return
        }

        // ── Custom: tool_interrupt ──────────────────────────────────────
        if (parsed.tool_interrupt) {
          const ti = parsed.tool_interrupt as Record<string, unknown>
          ensureCurrentStep()
          emit(vai("2", [{ type: "tool_interrupt", ...ti }]))
          onInterrupt?.({ type: "tool_interrupt", ...ti })
          return
        }

        // ── Standard OpenAI SSE ─────────────────────────────────────────
        const choices = parsed.choices as
          | Array<{ delta: Record<string, unknown>; finish_reason: string | null }>
          | undefined
        if (!choices?.length) return
        const { delta, finish_reason } = choices[0]

        // Reasoning tokens → g:
        if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
          emit(vai("g", delta.reasoning_content))
        }

        // Tool call argument chunks — accumulate per index
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls as Array<{
            index: number
            id?: string
            function?: { name?: string; arguments?: string }
          }>) {
            const idx = tc.index ?? 0
            if (!currentToolCallMap.has(idx)) {
              currentToolCallMap.set(idx, { id: "", name: "", args: "" })
            }
            const acc = currentToolCallMap.get(idx)!
            if (tc.id)              acc.id   = tc.id
            if (tc.function?.name)  acc.name = tc.function.name
            if (tc.function?.arguments) acc.args += tc.function.arguments
          }
        }

        // Text content → 0:
        if (typeof delta.content === "string" && delta.content) {
          ensureCurrentStep()   // open new step if coming after a tool round
          emit(vai("0", delta.content))
        }

        // finish_reason: "tool_calls" → flush accumulated calls, close step, flag new step
        if (finish_reason === "tool_calls") {
          for (const [, tc] of currentToolCallMap) {
            let args: unknown = tc.args
            try { args = JSON.parse(tc.args) } catch { /* keep raw */ }
            emit(vai("9", { toolCallId: tc.id, toolName: tc.name, args }))
          }
          emit(vai("e", { finishReason: "tool-calls", usage: ZERO_USAGE, isContinued: true }))
          currentToolCallMap = new Map()   // reset for next round
          needNewStep        = true
        }

        // finish_reason: "stop" → close current step and finish the message
        if (finish_reason === "stop") {
          emit(vai("e", { finishReason: "stop", usage: ZERO_USAGE, isContinued: false }))
          emit(vai("d", { finishReason: "stop", usage: ZERO_USAGE }))
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) processLine(line.trimEnd())
        }
        if (buffer.trim()) processLine(buffer.trimEnd())
      } catch (err) {
        console.error("Agent stream conversion error:", err)
      } finally {
        controller.close()
      }
    },
  })
}
