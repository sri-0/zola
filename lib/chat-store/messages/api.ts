import type { Message as MessageAISDK } from "ai"
import { readFromIndexedDB, writeToIndexedDB } from "../persist"

export interface ExtendedMessageAISDK extends MessageAISDK {
  message_group_id?: string
  model?: string
}

export async function getMessagesFromDb(
  chatId: string
): Promise<MessageAISDK[]> {
  // Try fetching from the API first
  try {
    const res = await fetch(`/api/messages?chatId=${chatId}`)
    if (res.ok) {
      const data = await res.json()
      const messages = (data as Array<{
        id: string
        role: string
        content: string
        parts?: MessageAISDK["parts"]
        model?: string
        message_group_id?: string
        created_at?: string
      }>).map((m) => ({
        id: m.id,
        role: m.role as MessageAISDK["role"],
        content: m.content ?? "",
        createdAt: m.created_at ? new Date(m.created_at) : undefined,
        parts: m.parts || undefined,
        message_group_id: m.message_group_id,
        model: m.model,
      }))

      // Cache results
      await writeToIndexedDB("messages", { id: chatId, messages })
      return messages
    }
  } catch (err) {
    console.warn("Failed to fetch messages from API, falling back to cache:", err)
  }

  return getCachedMessages(chatId)
}

export async function getLastMessagesFromDb(
  chatId: string,
  limit: number = 2
): Promise<MessageAISDK[]> {
  const all = await getMessagesFromDb(chatId)
  return all.slice(-limit)
}

type ChatMessageEntry = {
  id: string
  messages: MessageAISDK[]
}

export async function getCachedMessages(
  chatId: string
): Promise<MessageAISDK[]> {
  const entry = await readFromIndexedDB<ChatMessageEntry>("messages", chatId)

  if (!entry || Array.isArray(entry)) return []

  return (entry.messages || []).sort(
    (a, b) => +new Date(a.createdAt || 0) - +new Date(b.createdAt || 0)
  )
}

export async function cacheMessages(
  chatId: string,
  messages: MessageAISDK[]
): Promise<void> {
  await writeToIndexedDB("messages", { id: chatId, messages })
}

export async function addMessage(
  chatId: string,
  message: MessageAISDK
): Promise<void> {
  const current = await getCachedMessages(chatId)
  const updated = [...current, message]
  await writeToIndexedDB("messages", { id: chatId, messages: updated })
}

export async function setMessages(
  chatId: string,
  messages: MessageAISDK[]
): Promise<void> {
  await writeToIndexedDB("messages", { id: chatId, messages })
}

export async function clearMessagesCache(chatId: string): Promise<void> {
  await writeToIndexedDB("messages", { id: chatId, messages: [] })
}

export async function clearMessagesForChat(chatId: string): Promise<void> {
  await clearMessagesCache(chatId)
}
