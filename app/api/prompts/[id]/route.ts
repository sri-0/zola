import { NextRequest, NextResponse } from "next/server"
import { MOCK_USER_ID, promptStore } from "../_store"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const index = promptStore.findIndex((p) => p.id === id)

  if (index === -1) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 })
  }

  if (promptStore[index].userId !== MOCK_USER_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { title, content, isPublic } = body

  if (title !== undefined) promptStore[index].title = title
  if (content !== undefined) promptStore[index].content = content
  if (isPublic !== undefined) promptStore[index].isPublic = Boolean(isPublic)

  return NextResponse.json(promptStore[index])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const index = promptStore.findIndex((p) => p.id === id)

  if (index === -1) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 })
  }

  if (promptStore[index].userId !== MOCK_USER_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  promptStore.splice(index, 1)

  return NextResponse.json({ success: true })
}
