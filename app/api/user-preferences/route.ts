import { prisma } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/local-user"
import { NextRequest, NextResponse } from "next/server"

const DEFAULTS = {
  layout: "sidebar",
  prompt_suggestions: true,
  show_tool_invocations: true,
  show_conversation_previews: true,
  multi_model_enabled: false,
  hidden_models: [] as string[],
}

export async function GET() {
  try {
    const prefs = await prisma.userPreference.findUnique({
      where: { userId: LOCAL_USER_ID },
    })

    if (!prefs) {
      return NextResponse.json(DEFAULTS)
    }

    return NextResponse.json({
      layout: prefs.layout,
      prompt_suggestions: prefs.promptSuggestions,
      show_tool_invocations: prefs.showToolInvocations,
      show_conversation_previews: prefs.showConversationPreviews,
      multi_model_enabled: prefs.multiModelEnabled,
      hidden_models: JSON.parse(prefs.hiddenModels || "[]"),
    })
  } catch (error) {
    console.error("Error in user-preferences GET API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      layout,
      prompt_suggestions,
      show_tool_invocations,
      show_conversation_previews,
      multi_model_enabled,
      hidden_models,
    } = body

    const updateData: Record<string, unknown> = {}
    if (layout !== undefined) updateData.layout = layout
    if (prompt_suggestions !== undefined)
      updateData.promptSuggestions = prompt_suggestions
    if (show_tool_invocations !== undefined)
      updateData.showToolInvocations = show_tool_invocations
    if (show_conversation_previews !== undefined)
      updateData.showConversationPreviews = show_conversation_previews
    if (multi_model_enabled !== undefined)
      updateData.multiModelEnabled = multi_model_enabled
    if (hidden_models !== undefined)
      updateData.hiddenModels = JSON.stringify(hidden_models)

    const prefs = await prisma.userPreference.upsert({
      where: { userId: LOCAL_USER_ID },
      create: {
        userId: LOCAL_USER_ID,
        ...updateData,
      },
      update: updateData,
    })

    return NextResponse.json({
      success: true,
      layout: prefs.layout,
      prompt_suggestions: prefs.promptSuggestions,
      show_tool_invocations: prefs.showToolInvocations,
      show_conversation_previews: prefs.showConversationPreviews,
      multi_model_enabled: prefs.multiModelEnabled,
      hidden_models: JSON.parse(prefs.hiddenModels || "[]"),
    })
  } catch (error) {
    console.error("Error in user-preferences PUT API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
