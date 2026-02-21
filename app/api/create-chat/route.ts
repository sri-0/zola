import { createChatInDb } from "./api"

export async function POST(request: Request) {
  try {
    const { title, model, projectId } = await request.json()

    const chat = await createChatInDb({
      title,
      model: model || "gpt-4o-mini",
      projectId,
    })

    return new Response(JSON.stringify({ chat }), { status: 200 })
  } catch (err: unknown) {
    console.error("Error in create-chat endpoint:", err)
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      { status: 500 }
    )
  }
}
