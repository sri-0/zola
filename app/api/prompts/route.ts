import { NextRequest, NextResponse } from "next/server"
import { MOCK_USER_ID, promptStore } from "./_store"

export type Prompt = {
  id: string
  title: string
  content: string
  promptType: "system" | "user"
  isPublic: boolean
  userCreated: string | null
  userCreatedDate: string | null
  userId: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const search = searchParams.get("search")?.toLowerCase().trim() ?? ""
  const type = searchParams.get("type") // "system" | "user"
  const publicParam = searchParams.get("public") // "true" | "false"

  let results = [...promptStore]

  if (type === "system") {
    results = results.filter((p) => p.promptType === "system")
  } else if (type === "user") {
    results = results.filter((p) => p.promptType === "user")
  }

  if (publicParam === "true") {
    results = results.filter((p) => p.isPublic)
  } else if (publicParam === "false") {
    results = results.filter((p) => !p.isPublic)
  }

  if (search) {
    results = results.filter(
      (p) =>
        p.title.toLowerCase().includes(search) ||
        p.content.toLowerCase().includes(search)
    )
  }

  return NextResponse.json(results)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { title, content, isPublic } = body

  if (!title || !content) {
    return NextResponse.json(
      { error: "title and content are required" },
      { status: 400 }
    )
  }

  const newPrompt: Prompt = {
    id: crypto.randomUUID(),
    title,
    content,
    promptType: "user",
    isPublic: Boolean(isPublic),
    userCreated: "You",
    userCreatedDate: new Date().toISOString(),
    userId: MOCK_USER_ID,
  }

  promptStore.unshift(newPrompt)

  return NextResponse.json(newPrompt, { status: 201 })
}
