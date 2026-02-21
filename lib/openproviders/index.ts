import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModelV1 } from "@ai-sdk/provider"

export type OpenProvidersOptions<_T = unknown> = Record<string, unknown>

export function openproviders(
  modelId: string,
  _settings?: Record<string, unknown>,
  _apiKey?: string
): LanguageModelV1 {
  const provider = createOpenAI({
    baseURL: process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKey: process.env.AI_API_KEY ?? "",
    compatibility: "compatible",
  })
  return provider(modelId)
}
