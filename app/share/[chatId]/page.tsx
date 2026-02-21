import { notFound } from "next/navigation"

export const dynamic = "force-static"

export async function generateMetadata() {
  return notFound()
}

export default async function ShareChat() {
  return notFound()
}
