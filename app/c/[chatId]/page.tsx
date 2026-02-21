import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"

export default async function Page() {
  return (
    <LayoutApp>
      <ChatContainer />
    </LayoutApp>
  )
}
