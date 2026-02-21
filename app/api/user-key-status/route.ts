import { prisma } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/local-user"
import { PROVIDERS } from "@/lib/providers"
import { NextResponse } from "next/server"

const SUPPORTED_PROVIDERS = PROVIDERS.map((p) => p.id)

export async function GET() {
  try {
    const keys = await prisma.userKey.findMany({
      where: { userId: LOCAL_USER_ID },
      select: { provider: true },
    })

    const userProviders = keys.map((k) => k.provider)
    const providerStatus = SUPPORTED_PROVIDERS.reduce(
      (acc, provider) => {
        acc[provider] = userProviders.includes(provider)
        return acc
      },
      {} as Record<string, boolean>
    )

    return NextResponse.json(providerStatus)
  } catch (err) {
    console.error("Key status error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
