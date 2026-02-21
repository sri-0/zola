import { prisma } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/local-user"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const chats = await prisma.chat.findMany({
      where: { userId: LOCAL_USER_ID },
      orderBy: [
        { pinned: "desc" },
        { pinnedAt: "desc" },
        { updatedAt: "desc" },
      ],
    })

    const formatted = chats.map((c) => ({
      id: c.id,
      user_id: c.userId,
      title: c.title,
      model: c.model,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
      pinned: c.pinned,
      pinned_at: c.pinnedAt?.toISOString() || null,
      public: c.public,
      project_id: c.projectId || null,
    }))

    return NextResponse.json(formatted)
  } catch (err) {
    console.error("Error fetching chats:", err)
    return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    await prisma.chat.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error deleting chat:", err)
    return NextResponse.json({ error: "Failed to delete chat" }, { status: 500 })
  }
}
