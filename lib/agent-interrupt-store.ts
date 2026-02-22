/**
 * Simple in-process store for pending agent interrupts.
 * Written to by the chat route when it sees a tool_interrupt in the stream;
 * read + cleared by the client after status becomes "ready".
 *
 * Works fine for a single-user / single-process setup.
 * Keyed by chatId so each conversation has its own pending interrupt.
 */
const store = new Map<string, Record<string, unknown>>()

export const interruptStore = {
  set:   (chatId: string, data: Record<string, unknown>) => store.set(chatId, data),
  get:   (chatId: string) => store.get(chatId) ?? null,
  clear: (chatId: string) => store.delete(chatId),
}
