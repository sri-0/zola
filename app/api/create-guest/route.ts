import { LOCAL_USER_ID } from "@/lib/local-user"

export async function POST() {
  return new Response(
    JSON.stringify({ user: { id: LOCAL_USER_ID, anonymous: false } }),
    { status: 200 }
  )
}
