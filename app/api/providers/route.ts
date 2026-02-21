import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json({ hasUserKey: false, provider: null })
}
