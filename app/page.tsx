import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <LayoutApp>
      <ChatContainer />
    </LayoutApp>
  )
}
