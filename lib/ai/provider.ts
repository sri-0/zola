import { createOpenAI } from "@ai-sdk/openai"

export function getAIModel(modelId: string) {
  const provider = createOpenAI({
    baseURL: process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKey: process.env.AI_API_KEY ?? "",
    compatibility: "compatible",
  })
  return provider(modelId)
}
