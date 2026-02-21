import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const chatId = searchParams.get("chatId")

    if (!chatId) {
      return NextResponse.json({ error: "Missing chatId" }, { status: 400 })
    }

    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    })

    const formatted = messages.map((m) => ({
      id: String(m.id),
      chat_id: m.chatId,
      role: m.role,
      content: m.content ?? "",
      parts: m.parts ? JSON.parse(m.parts) : undefined,
      model: m.model,
      message_group_id: m.messageGroupId,
      created_at: m.createdAt.toISOString(),
    }))

    return NextResponse.json(formatted)
  } catch (err) {
    console.error("Error fetching messages:", err)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}
