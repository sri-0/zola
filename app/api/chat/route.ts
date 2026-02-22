import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import { getAIModel } from "@/lib/ai/provider"
import { interruptStore } from "@/lib/agent-interrupt-store"
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

// ---------------------------------------------------------------------------
// Shared helper — tee an agent stream, stream to client, and save to DB
// ---------------------------------------------------------------------------

const AGENT_STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Vercel-AI-Data-Stream": "v1",
  "Cache-Control": "no-cache",
}

async function saveAgentStream(
  saveStream: ReadableStream<Uint8Array>,
  chatId: string,
  model: string,
  message_group_id?: string
) {
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
      else if (type === "9")
        toolCalls.set(val.toolCallId, { toolName: val.toolName, args: val.args })
      else if (type === "a") {
        const tc = toolCalls.get(val.toolCallId)
        if (tc) tc.result = val.result
      }
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

    // Only keep tool calls that actually completed (have a result).
    // Interrupted tool calls have no "a:" result event, so tc.result === undefined.
    // Saving them would show a wrong "Completed" badge after DB sync.
    const completedToolCalls = [...toolCalls.entries()].filter(
      ([, tc]) => tc.result !== undefined
    )

    if (!textContent && completedToolCalls.length === 0) return

    const parts: unknown[] = [{ type: "step-start" }]
    for (const [toolCallId, tc] of completedToolCalls) {
      parts.push({
        type: "tool-invocation",
        toolInvocation: {
          state: "result",
          step: 0,
          toolCallId,
          toolName: tc.toolName,
          args: tc.args,
          result: tc.result,
        },
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
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

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
    const userContent =
      typeof userMessage?.content === "string" ? userMessage.content : ""

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

    // ---------------------------------------------------------------------------
    // Agent resume path — user clicked Approve/Deny/Skip on a tool interrupt.
    // Message content is "RESUME:<action>:<thread_id>" — not a real user message.
    // ---------------------------------------------------------------------------
    const resumeMatch = model === "test-agent" &&
      userMessage?.role === "user" &&
      userContent.startsWith("RESUME:")

    if (resumeMatch) {
      // Parse "RESUME:<action>:<thread_id>"
      const parts = userContent.split(":")
      const action   = parts[1] ?? "denied"
      const threadId = parts.slice(2).join(":")  // thread_id may contain colons

      // Clear the stored interrupt for this chat now that the user has acted
      interruptStore.clear(chatId)

      const baseUrl = process.env.AGENT_BASE_URL ?? "http://localhost:8000/v1"
      const resumeResp = await fetch(`${baseUrl}/agent/resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AI_API_KEY ?? "test"}`,
        },
        body: JSON.stringify({ thread_id: threadId, action }),
      })

      if (!resumeResp.ok || !resumeResp.body) {
        const text = await resumeResp.text().catch(() => "unknown error")
        console.error("Agent resume error:", text)
        return new Response(JSON.stringify({ error: text }), { status: 502 })
      }

      const converted = convertAgentStream(resumeResp.body, {
        onInterrupt: (data) => interruptStore.set(chatId, data),
      })
      const [clientStream, saveStream] = converted.tee()
      saveAgentStream(saveStream, chatId, model, message_group_id).catch(console.error)

      return new Response(clientStream, { headers: AGENT_STREAM_HEADERS })
    }

    // Save user message (skip RESUME: messages — they're internal signals)
    if (userMessage?.role === "user" && !userContent.startsWith("RESUME:")) {
      await prisma.message.create({
        data: {
          chatId,
          role: "user",
          content: sanitizeUserInput(userContent),
          messageGroupId: message_group_id || null,
        },
      })
    }

    // ---------------------------------------------------------------------------
    // Agent proxy path — standard new turn for the LangGraph agent.
    // thread_id = chatId so MemorySaver can track state across turns.
    // ---------------------------------------------------------------------------
    if (model === "test-agent") {
      const baseUrl = process.env.AGENT_BASE_URL ?? "http://localhost:8000/v1"
      const agentResp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AI_API_KEY ?? "test"}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          thread_id: chatId,    // used by FastAPI for MemorySaver checkpointing
        }),
      })

      if (!agentResp.ok || !agentResp.body) {
        const text = await agentResp.text().catch(() => "unknown error")
        console.error("Agent server error:", text)
        return new Response(JSON.stringify({ error: text }), { status: 502 })
      }

      const converted = convertAgentStream(agentResp.body, {
        onInterrupt: (data) => interruptStore.set(chatId, data),
      })
      const [clientStream, saveStream] = converted.tee()
      saveAgentStream(saveStream, chatId, model, message_group_id).catch(console.error)

      return new Response(clientStream, { headers: AGENT_STREAM_HEADERS })
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

// ---------------------------------------------------------------------------
// GET /api/chat?interrupt=<chatId>
// Returns any pending tool interrupt for the given chat, then clears it.
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const chatId = new URL(req.url).searchParams.get("interrupt")
  if (!chatId) return Response.json(null)
  const pending = interruptStore.get(chatId)
  return Response.json(pending)
}
