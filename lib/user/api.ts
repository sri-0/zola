import { LOCAL_USER_ID } from "@/lib/local-user"
import { defaultPreferences } from "@/lib/user-preference-store/utils"
import type { UserProfile } from "./types"

export async function getSupabaseUser() {
  return { supabase: null, user: null }
}

export async function getUserProfile(): Promise<UserProfile | null> {
  return {
    id: LOCAL_USER_ID,
    email: "local@localhost",
    display_name: "Local User",
    profile_image: "",
    anonymous: false,
    premium: true,
    message_count: 0,
    daily_message_count: 0,
    daily_reset: null,
    daily_pro_message_count: 0,
    daily_pro_reset: null,
    favorite_models: [],
    created_at: new Date().toISOString(),
    last_active_at: null,
    system_prompt: null,
    preferences: defaultPreferences,
  } as UserProfile
}
