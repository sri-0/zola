import { encryptKey } from "@/lib/encryption"
import { prisma } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/local-user"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { provider, apiKey } = await request.json()

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "Provider and API key are required" },
        { status: 400 }
      )
    }

    const { encrypted, iv } = encryptKey(apiKey)

    const existing = await prisma.userKey.findUnique({
      where: { userId_provider: { userId: LOCAL_USER_ID, provider } },
    })

    const isNewKey = !existing

    await prisma.userKey.upsert({
      where: { userId_provider: { userId: LOCAL_USER_ID, provider } },
      create: {
        userId: LOCAL_USER_ID,
        provider,
        encryptedKey: encrypted,
        iv,
      },
      update: {
        encryptedKey: encrypted,
        iv,
      },
    })

    return NextResponse.json({
      success: true,
      isNewKey,
      message: isNewKey ? "API key saved" : "API key updated",
    })
  } catch (error) {
    console.error("Error in POST /api/user-keys:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { provider } = await request.json()

    if (!provider) {
      return NextResponse.json(
        { error: "Provider is required" },
        { status: 400 }
      )
    }

    await prisma.userKey.delete({
      where: { userId_provider: { userId: LOCAL_USER_ID, provider } },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/user-keys:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
