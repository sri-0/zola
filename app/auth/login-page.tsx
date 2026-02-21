"use client"

import Link from "next/link"
import { HeaderGoBack } from "../components/header-go-back"

export default function LoginPage() {
  return (
    <div className="bg-background flex h-dvh w-full flex-col">
      <HeaderGoBack href="/" />

      <main className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-foreground text-3xl font-medium tracking-tight sm:text-4xl">
              Welcome to Zola
            </h1>
            <p className="text-muted-foreground mt-3">
              Authentication is handled externally in this deployment.
            </p>
          </div>
        </div>
      </main>

      <footer className="text-muted-foreground py-6 text-center text-sm">
        <p>
          <Link href="/" className="text-foreground hover:underline">
            Back to Home
          </Link>
        </p>
      </footer>
    </div>
  )
}
