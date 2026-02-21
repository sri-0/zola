import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import { getAIModel } from "@/lib/ai/provider"
import { prisma } from "@/lib/db"
import { sanitizeUserInput } from "@/lib/sanitize"
import { Message as MessageAISDK, streamText, ToolSet } from "ai"
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

    // Log user message
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
