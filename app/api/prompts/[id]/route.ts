import { NextRequest, NextResponse } from "next/server"
import { MOCK_USER_ID, promptStore } from "../_store"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const index = promptStore.findIndex((p) => p.id === id)

  if (index === -1) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 })
  }

  const prompt = promptStore[index]

  // Only allow deleting user's own prompts (not system prompts)
  if (prompt.userId !== MOCK_USER_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  promptStore.splice(index, 1)

  return NextResponse.json({ success: true })
}
