import { NextRequest, NextResponse } from "next/server"
import { MOCK_USER_ID, promptStore } from "./_store"

export type PromptCategory = "system" | "user-private" | "user-shared"

export type Prompt = {
  id: string
  title: string
  content: string
  category: PromptCategory
  userCreated: string | null
  userCreatedDate: string | null
  userId: string | null
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.toLowerCase().trim() ?? ""

  const results = search
    ? promptStore.filter(
        (p) =>
          p.title.toLowerCase().includes(search) ||
          p.content.toLowerCase().includes(search)
      )
    : promptStore

  return NextResponse.json(results)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { title, content, category } = body

  if (!title || !content || !category) {
    return NextResponse.json(
      { error: "title, content, and category are required" },
      { status: 400 }
    )
  }

  if (!["user-private", "user-shared"].includes(category)) {
    return NextResponse.json(
      { error: "category must be user-private or user-shared" },
      { status: 400 }
    )
  }

  const newPrompt: Prompt = {
    id: crypto.randomUUID(),
    title,
    content,
    category,
    userCreated: "You",
    userCreatedDate: new Date().toISOString(),
    userId: MOCK_USER_ID,
  }

  promptStore.unshift(newPrompt)

  return NextResponse.json(newPrompt, { status: 201 })
}
