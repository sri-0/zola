import { LOCAL_USER_ID } from "@/lib/local-user"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

// Seed the local user on startup
async function seedLocalUser() {
  try {
    await prisma.user.upsert({
      where: { id: LOCAL_USER_ID },
      create: { id: LOCAL_USER_ID, displayName: "Local User" },
      update: {},
    })
  } catch (err) {
    console.error("Failed to seed local user:", err)
  }
}

seedLocalUser()
