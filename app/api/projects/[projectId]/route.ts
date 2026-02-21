import { prisma } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/local-user"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: LOCAL_USER_ID },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: project.id,
      name: project.name,
      user_id: project.userId,
      created_at: project.createdAt.toISOString(),
    })
  } catch (err: unknown) {
    console.error("Error in project endpoint:", err)
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const { name } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      )
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: { name: name.trim() },
    })

    return NextResponse.json({
      id: project.id,
      name: project.name,
      user_id: project.userId,
      created_at: project.createdAt.toISOString(),
    })
  } catch (err: unknown) {
    console.error("Error updating project:", err)
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: LOCAL_USER_ID },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    await prisma.project.delete({ where: { id: projectId } })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error("Error deleting project:", err)
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    )
  }
}
