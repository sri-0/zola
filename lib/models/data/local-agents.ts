import { ModelConfig } from "../types"

export const localAgentModels: ModelConfig[] = [
  {
    id: "test-agent",
    name: "Test Agent",
    provider: "Local",
    providerId: "local",
    baseProviderId: "local",
    description: "LangGraph agent with tool calling via local FastAPI server.",
    tags: ["agent", "tools", "local"],
    tools: true,
    speed: "Medium",
    intelligence: "High",
    icon: "local",
  },
]
