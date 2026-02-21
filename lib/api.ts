import type { UserProfile } from "@/lib/user/types"
import { LOCAL_USER_ID } from "@/lib/local-user"
import { fetchClient } from "./fetch"
import { API_ROUTE_CREATE_GUEST, API_ROUTE_UPDATE_CHAT_MODEL } from "./routes"

export async function createGuestUser(_guestId: string) {
  return { user: { id: LOCAL_USER_ID, anonymous: false } }
}

export class UsageLimitError extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.code = "DAILY_LIMIT_REACHED"
  }
}

export async function checkRateLimits(
  _userId: string,
  _isAuthenticated: boolean
) {
  return null
}

export async function updateChatModel(chatId: string, model: string) {
  try {
    const res = await fetchClient(API_ROUTE_UPDATE_CHAT_MODEL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, model }),
    })
    const responseData = await res.json()

    if (!res.ok) {
      throw new Error(
        responseData.error ||
          `Failed to update chat model: ${res.status} ${res.statusText}`
      )
    }

    return responseData
  } catch (error) {
    console.error("Error updating chat model:", error)
    throw error
  }
}

export async function signInWithGoogle(_supabase: null) {
  throw new Error("Auth is handled externally")
}

export const getOrCreateGuestUserId = async (
  user: UserProfile | null
): Promise<string | null> => {
  return user?.id ?? LOCAL_USER_ID
}
