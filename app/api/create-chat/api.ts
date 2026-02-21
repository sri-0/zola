import { prisma } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/local-user"

type CreateChatInput = {
  userId?: string
  title?: string
  model: string
  isAuthenticated?: boolean
  projectId?: string
}

export async function createChatInDb({
  title,
  model,
  projectId,
}: CreateChatInput) {
  const data = await prisma.chat.create({
    data: {
      userId: LOCAL_USER_ID,
      title: title || "New Chat",
      model,
      projectId: projectId || null,
    },
  })

  return {
    id: data.id,
    user_id: data.userId,
    title: data.title,
    model: data.model,
    created_at: data.createdAt.toISOString(),
    updated_at: data.updatedAt.toISOString(),
    pinned: data.pinned,
    pinned_at: data.pinnedAt?.toISOString() || null,
    public: data.public,
    project_id: data.projectId || null,
  }
}
