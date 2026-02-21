import { decryptKey } from "./encryption"
import { prisma } from "./db"
import { LOCAL_USER_ID } from "./local-user"

export type { Provider } from "./openproviders/types"
export type ProviderWithoutOllama = Exclude<import("./openproviders/types").Provider, "ollama">

export async function getUserKey(
  _userId: string,
  provider: import("./openproviders/types").Provider
): Promise<string | null> {
  try {
    const key = await prisma.userKey.findUnique({
      where: { userId_provider: { userId: LOCAL_USER_ID, provider } },
    })

    if (!key) return null

    return decryptKey(key.encryptedKey, key.iv)
  } catch (error) {
    console.error("Error retrieving user key:", error)
    return null
  }
}

export async function getEffectiveApiKey(
  _userId: string | null,
  _provider: ProviderWithoutOllama
): Promise<string | null> {
  // In local mode, AI keys are configured via AI_API_KEY env var
  return process.env.AI_API_KEY || null
}
