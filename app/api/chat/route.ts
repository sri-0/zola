import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import { getAIModel } from "@/lib/ai/provider"
import { prisma } from "@/lib/db"
import { sanitizeUserInput } from "@/lib/sanitize"
import { Message as MessageAISDK, streamText, ToolSet } from "ai"
import { convertAgentStream } from "./agent-stream"
import { saveFinalAssistantMessage } from "./db"
import { createErrorResponse, extractErrorMessage } from "./utils"

export const maxDuration = 60

type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  userId: string
  model: string
  isAuthenticated: boolean
  systemPrompt: string
  enableSearch: boolean
  message_group_id?: string
  editCutoffTimestamp?: string
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      chatId,
      model,
      systemPrompt,
      message_group_id,
      editCutoffTimestamp,
    } = (await req.json()) as ChatRequest

    if (!messages || !chatId || !model) {
      return new Response(
        JSON.stringify({ error: "Error, missing information" }),
        { status: 400 }
      )
    }

    const userMessage = messages[messages.length - 1]

    // If editing, delete messages from cutoff BEFORE saving the new user message
    if (editCutoffTimestamp) {
      try {
        await prisma.message.deleteMany({
          where: {
            chatId,
            createdAt: { gte: new Date(editCutoffTimestamp) },
          },
        })
      } catch (err) {
        console.error("Failed to delete messages from cutoff:", err)
      }
    }

    // Save user message
    if (userMessage?.role === "user") {
      const content =
        typeof userMessage.content === "string" ? userMessage.content : ""
      await prisma.message.create({
        data: {
          chatId,
          role: "user",
          content: sanitizeUserInput(content),
          messageGroupId: message_group_id || null,
        },
      })
    }

    // ---------------------------------------------------------------------------
    // Agent proxy path — for models whose server handles the full agentic loop
    // and streams back in Vercel AI SDK data stream format directly.
    // The stream is passed through as-is; no streamText processing needed.
    // ---------------------------------------------------------------------------
    if (model === "test-agent") {
      const baseUrl = process.env.AI_BASE_URL ?? "http://localhost:8000/v1"
      const agentResp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AI_API_KEY ?? "test"}`,
        },
        body: JSON.stringify({ model, messages, stream: true }),
      })

      if (!agentResp.ok || !agentResp.body) {
        const text = await agentResp.text().catch(() => "unknown error")
        console.error("Agent server error:", text)
        return new Response(JSON.stringify({ error: text }), { status: 502 })
      }

      const converted = convertAgentStream(agentResp.body)
      const [clientStream, saveStream] = converted.tee()

      // Asynchronously consume the save copy — reconstruct the full parts
      // structure (text + tool invocations) and persist it the same way
      // saveFinalAssistantMessage does for normal models.
      ;(async () => {
        const decoder = new TextDecoder()
        const reader = saveStream.getReader()
        let buf = ""
        let textContent = ""
        const toolCalls = new Map<string, { toolName: string; args: unknown; result?: unknown }>()

        const parseLine = (line: string) => {
          const sep = line.indexOf(":")
          if (sep === -1) return
          const type = line.slice(0, sep)
          try {
            const val = JSON.parse(line.slice(sep + 1))
            if (type === "0") textContent += val
            else if (type === "9") toolCalls.set(val.toolCallId, { toolName: val.toolName, args: val.args })
            else if (type === "a") { const tc = toolCalls.get(val.toolCallId); if (tc) tc.result = val.result }
          } catch {}
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split("\n")
            buf = lines.pop() ?? ""
            for (const line of lines) parseLine(line)
          }
          if (buf) parseLine(buf)

          if (!textContent && toolCalls.size === 0) return

          const parts: unknown[] = [{ type: "step-start" }]
          for (const [toolCallId, tc] of toolCalls) {
            parts.push({
              type: "tool-invocation",
              toolInvocation: { state: "result", step: 0, toolCallId, toolName: tc.toolName, args: tc.args, result: tc.result },
            })
          }
          if (textContent) parts.push({ type: "text", text: textContent })

          await prisma.message.create({
            data: {
              chatId,
              role: "assistant",
              content: textContent,
              parts: JSON.stringify(parts),
              model,
              messageGroupId: message_group_id || null,
            },
          })
        } catch (err) {
          console.error("Failed to save agent assistant message:", err)
        }
      })()

      return new Response(clientStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Vercel-AI-Data-Stream": "v1",
          "Cache-Control": "no-cache",
        },
      })
    }

    // ---------------------------------------------------------------------------
    // Standard path — streamText with the configured AI provider
    // ---------------------------------------------------------------------------
    const aiModel = getAIModel(model)
    const effectiveSystemPrompt = systemPrompt || SYSTEM_PROMPT_DEFAULT

    const result = streamText({
      model: aiModel,
      system: effectiveSystemPrompt,
      messages,
      tools: {} as ToolSet,
      maxSteps: 10,
      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
      },
      onFinish: async ({ response }) => {
        try {
          await saveFinalAssistantMessage(
            chatId,
            response.messages as unknown as import("@/app/types/api.types").Message[],
            message_group_id,
            model
          )
        } catch (err) {
          console.error("Failed to save assistant messages:", err)
        }
      },
    })

    return result.toDataStreamResponse({
      sendReasoning: true,
      sendSources: true,
      getErrorMessage: (error: unknown) => {
        console.error("Error forwarded to client:", error)
        return extractErrorMessage(error)
      },
    })
  } catch (err: unknown) {
    console.error("Error in /api/chat:", err)
    const error = err as {
      code?: string
      message?: string
      statusCode?: number
    }

    return createErrorResponse(error)
  }
}
