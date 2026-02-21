// Stub - all usage tracking removed
export async function validateAndTrackUsage(_params: {
  userId: string
  model: string
  isAuthenticated: boolean
}) {
  return null
}

export async function incrementMessageCount(_params: {
  supabase: null
  userId: string
}) {}

export async function logUserMessage(_params: {
  supabase: null
  userId: string
  chatId: string
  content: string
  attachments?: unknown[]
  model: string
  isAuthenticated: boolean
  message_group_id?: string
}) {}

export async function storeAssistantMessage(_params: {
  supabase: null
  chatId: string
  messages: unknown[]
  message_group_id?: string
  model?: string
}) {}
