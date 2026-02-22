/**
 * agent-stream.ts
 * ---------------
 * Converts the OpenAI-compatible SSE stream from the LangGraph agent server
 * into a Vercel AI SDK data stream that useChat can parse on the client.
 *
 * FastAPI emits standard OpenAI SSE fields plus four custom extension events:
 *
 *   Standard:
 *     choices[0].delta.reasoning_content  — thinking tokens (e.g. deepseek)
 *     choices[0].delta.tool_calls         — streamed tool call arguments
 *     choices[0].delta.content            — response text tokens
 *     finish_reason: "tool_calls"         — tool args complete; tools will run
 *     finish_reason: "stop"               — stream finished
 *
 *   Custom extensions (from get_stream_writer / after interrupt check):
 *     data: {"agent_progress": {"phase":"...","message":"...","step":N,"total":N}}
 *     data: {"tool_result": {"toolCallId":"...","toolName":"...","result":{...}}}
 *     data: {"tool_interrupt": {"toolCallId":"...","toolName":"...","prompt":"...",
 *                               "details":{...},"thread_id":"..."}}
 *
 * Vercel AI SDK data stream parts emitted:
 *
 *   No-tool path (single step):
 *     f:{messageId}  →  g: (optional reasoning)  →  0: text  →  e:{stop}  →  d:{stop}
 *
 *   Tool path (two steps):
 *     Step 1: f:{messageId}  →  g: (reasoning)  →  9:{tool}  →  e:{tool-calls,isContinued:true}
 *     Step 2: f:{messageId}  →  2:[annotations]  →  a:{result}  →  0: text  →  e:{stop}  →  d:{stop}
 *
 *   Interrupt path (two steps, no tool results):
 *     Step 1: f:{messageId}  →  9:{tool}  →  e:{tool-calls,isContinued:true}
 *     Step 2: f:{messageId}  →  2:[{type:"tool_interrupt",...}]  →  e:{stop}  →  d:{stop}
 *
 *   Resume path (synthetic tool_calls from server + results + text):
 *     Step 1: f:{messageId}  →  9:{tool}  →  e:{tool-calls,isContinued:true}
 *     Step 2: f:{messageId}  →  2:[progress]  →  a:{result}  →  0: text  →  e:{stop}  →  d:{stop}
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
  const toolCallMap = new Map<number, ToolCallAcc>()
  let hadToolCalls = false
  let step2Started = false
  const step1Id = randomMsgId()
  const step2Id = randomMsgId()

  // Accumulate agent_progress annotations for step 2
  const progressAnnotations: unknown[] = []

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (part: string) =>
        controller.enqueue(encoder.encode(part))

      // Always open step 1 immediately
      emit(vai("f", { messageId: step1Id }))

      const reader = sseStream.getReader()

      const ensureStep2Open = () => {
        if (!step2Started) {
          step2Started = true
          emit(vai("f", { messageId: step2Id }))
          // Flush any buffered progress annotations into step 2
          if (progressAnnotations.length > 0) {
            emit(vai("2", progressAnnotations))
            progressAnnotations.length = 0
          }
        }
      }

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

        // ── Custom: agent_progress ────────────────────────────────────────────
        if (parsed.agent_progress) {
          const ap = parsed.agent_progress as {
            phase: string
            message: string
            step?: number
            total?: number
          }
          const annotation = {
            type:    "agent_progress",
            phase:   ap.phase,
            message: ap.message,
            ...(ap.step  !== undefined && { step:  ap.step }),
            ...(ap.total !== undefined && { total: ap.total }),
          }

          if (step2Started) {
            // Step 2 already open — emit immediately
            emit(vai("2", [annotation]))
          } else {
            // Buffer until step 2 opens (progress before tool results)
            progressAnnotations.push(annotation)
          }
          return
        }

        // ── Custom: tool_result ───────────────────────────────────────────────
        if (parsed.tool_result) {
          const tr = parsed.tool_result as { toolCallId: string; result: unknown }
          ensureStep2Open()
          emit(vai("a", { toolCallId: tr.toolCallId, result: tr.result }))
          return
        }

        // ── Custom: tool_interrupt ────────────────────────────────────────────
        if (parsed.tool_interrupt) {
          const ti = parsed.tool_interrupt as Record<string, unknown>
          ensureStep2Open()
          emit(vai("2", [{ type: "tool_interrupt", ...ti }]))
          onInterrupt?.({ type: "tool_interrupt", ...ti })
          return
        }

        // ── Standard OpenAI SSE ───────────────────────────────────────────────
        const choices = parsed.choices as
          | Array<{ delta: Record<string, unknown>; finish_reason: string | null }>
          | undefined
        if (!choices?.length) return
        const { delta, finish_reason } = choices[0]

        // Reasoning tokens → g:
        if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
          emit(vai("g", delta.reasoning_content))
        }

        // Tool call argument chunks — accumulate per index, emit as 9: on finish_reason
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls as Array<{
            index: number
            id?: string
            function?: { name?: string; arguments?: string }
          }>) {
            const idx = tc.index ?? 0
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, { id: "", name: "", args: "" })
            }
            const acc = toolCallMap.get(idx)!
            if (tc.id) acc.id = tc.id
            if (tc.function?.name) acc.name = tc.function.name
            if (tc.function?.arguments) acc.args += tc.function.arguments
          }
        }

        // Text content → 0:
        if (typeof delta.content === "string" && delta.content) {
          if (hadToolCalls && !step2Started) {
            ensureStep2Open()
          }
          emit(vai("0", delta.content))
        }

        // finish_reason: tool_calls → emit 9: parts + close step 1
        if (finish_reason === "tool_calls") {
          hadToolCalls = true
          for (const [, tc] of toolCallMap) {
            let args: unknown = tc.args
            try {
              args = JSON.parse(tc.args)
            } catch {
              /* keep as raw string */
            }
            emit(vai("9", { toolCallId: tc.id, toolName: tc.name, args }))
          }
          emit(vai("e", {
            finishReason: "tool-calls",
            usage: ZERO_USAGE,
            isContinued: true,
          }))
        }

        // finish_reason: stop → close current step + finish message
        if (finish_reason === "stop") {
          // Make sure step 2 is open if tools ran (even with no tool results, e.g. interrupt)
          if (hadToolCalls && !step2Started) {
            ensureStep2Open()
          }
          emit(vai("e", {
            finishReason: "stop",
            usage: ZERO_USAGE,
            isContinued: false,
          }))
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
          for (const line of lines) {
            processLine(line.trimEnd())
          }
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
