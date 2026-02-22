/**
 * agent-stream.ts
 * ---------------
 * Converts the OpenAI-compatible SSE stream from the LangGraph agent server
 * into a Vercel AI SDK data stream that useChat can parse on the client.
 *
 * FastAPI emits standard OpenAI SSE fields:
 *   choices[0].delta.reasoning_content  — thinking / chain-of-thought tokens
 *   choices[0].delta.tool_calls         — streamed tool call arguments
 *   choices[0].delta.content            — text response tokens
 *   finish_reason: "tool_calls"         — all tool args delivered; results follow
 *   finish_reason: "stop"               — stream finished
 *
 * Plus one custom extension line (after finish_reason:"tool_calls"):
 *   data: {"tool_result":{"toolCallId":"...","toolName":"...","result":{...}}}
 *
 * Vercel AI SDK data stream parts emitted (protocol v1):
 *
 *   Step 1 — reasoning + tool call requests:
 *     f:{messageId}
 *     g:"token"                               reasoning  → Reasoning component
 *     9:{toolCallId,toolName,args}            tool call  → "Running" card
 *     e:{finishReason:"tool-calls",isContinued:true}
 *
 *   Step 2 — tool results + text (only opened when tools ran):
 *     f:{messageId}
 *     a:{toolCallId,result}                   result     → card flips to "Completed"
 *     0:"token"                               text chunk
 *     e:{finishReason:"stop",isContinued:false}
 *     d:{finishReason:"stop"}
 *
 *   No-tool path (single step):
 *     f:{messageId}  →  g: (optional)  →  0: text  →  e:{stop}  →  d:{stop}
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
  sseStream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let buffer = ""
  const toolCallMap = new Map<number, ToolCallAcc>()
  let hadToolCalls = false
  let step2Started = false
  const step1Id = randomMsgId()
  const step2Id = randomMsgId()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (part: string) =>
        controller.enqueue(encoder.encode(part))

      // Always open step 1 immediately
      emit(vai("f", { messageId: step1Id }))

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

        // ── Custom extension: tool_result ────────────────────────────────────
        if (parsed.tool_result) {
          const tr = parsed.tool_result as { toolCallId: string; result: unknown }
          if (!step2Started) {
            step2Started = true
            emit(vai("f", { messageId: step2Id }))
          }
          emit(vai("a", { toolCallId: tr.toolCallId, result: tr.result }))
          return
        }

        // ── Standard OpenAI SSE ──────────────────────────────────────────────
        const choices = parsed.choices as
          | Array<{ delta: Record<string, unknown>; finish_reason: string | null }>
          | undefined
        if (!choices?.length) return
        const { delta, finish_reason } = choices[0]

        // Reasoning tokens → g:
        if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
          emit(vai("g", delta.reasoning_content))
        }

        // Tool call argument chunks — accumulate per index, emit as 9: later
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

        // Text content → 0: (if tools ran, open step 2 first)
        if (typeof delta.content === "string" && delta.content) {
          if (hadToolCalls && !step2Started) {
            step2Started = true
            emit(vai("f", { messageId: step2Id }))
          }
          emit(vai("0", delta.content))
        }

        // finish_reason: tool_calls
        // Emit each accumulated tool call as a complete 9: part, then close step 1
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
          emit(
            vai("e", {
              finishReason: "tool-calls",
              usage: ZERO_USAGE,
              isContinued: true,
            })
          )
        }

        // finish_reason: stop — close current step + finish message
        if (finish_reason === "stop") {
          emit(
            vai("e", {
              finishReason: "stop",
              usage: ZERO_USAGE,
              isContinued: false,
            })
          )
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
