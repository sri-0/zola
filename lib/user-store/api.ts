import type { UserProfile } from "@/lib/user/types"
import { LOCAL_USER_ID } from "@/lib/local-user"

export const LOCAL_USER: UserProfile = {
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
}

export async function fetchUserProfile(_id: string): Promise<UserProfile | null> {
  return LOCAL_USER
}

export async function updateUserProfile(
  _id: string,
  _updates: Partial<UserProfile>
): Promise<boolean> {
  return true
}

export async function signOutUser(): Promise<boolean> {
  return false
}

export function subscribeToUserUpdates(
  _userId: string,
  _onUpdate: (newData: Partial<UserProfile>) => void
) {
  return () => {}
}
