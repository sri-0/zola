"use client"

import { Header } from "@/app/components/layout/header"
import { AppSidebar } from "@/app/components/layout/sidebar/app-sidebar"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"

export function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    <MessagesProvider>
      <div className="bg-background flex h-dvh w-full overflow-hidden">
        <AppSidebar />
        <main className="@container relative h-dvh w-0 flex-shrink flex-grow overflow-y-auto">
          <Header hasSidebar={true} />
          {children}
        </main>
      </div>
    </MessagesProvider>
  )
}
