import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { title, model } = await request.json()

    const data: { title?: string; model?: string } = {}
    if (title !== undefined) data.title = title
    if (model !== undefined) data.model = model

    const chat = await prisma.chat.update({
      where: { id },
      data,
    })

    return NextResponse.json({
      id: chat.id,
      title: chat.title,
      model: chat.model,
      updated_at: chat.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error("Error updating chat:", err)
    return NextResponse.json({ error: "Failed to update chat" }, { status: 500 })
  }
}
