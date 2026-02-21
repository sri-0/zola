import { prisma } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/local-user"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { name } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      )
    }

    const project = await prisma.project.create({
      data: { name: name.trim(), userId: LOCAL_USER_ID },
    })

    return NextResponse.json({
      id: project.id,
      name: project.name,
      user_id: project.userId,
      created_at: project.createdAt.toISOString(),
    })
  } catch (err: unknown) {
    console.error("Error in projects endpoint:", err)
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: LOCAL_USER_ID },
      orderBy: { createdAt: "asc" },
    })

    const formatted = projects.map((p) => ({
      id: p.id,
      name: p.name,
      user_id: p.userId,
      created_at: p.createdAt.toISOString(),
    }))

    return NextResponse.json(formatted)
  } catch (err: unknown) {
    console.error("Error in projects GET:", err)
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    )
  }
}
