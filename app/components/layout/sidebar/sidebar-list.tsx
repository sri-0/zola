import { Chat } from "@/lib/chat-store/types"
import { ReactNode } from "react"
import { SidebarItem } from "./sidebar-item"

type SidebarListProps = {
  title: string
  icon?: ReactNode
  items: Chat[]
  currentChatId: string
}

export function SidebarList({ items, currentChatId }: SidebarListProps) {
  return (
    <div className="space-y-0.5">
      {items.map((chat) => (
        <SidebarItem key={chat.id} chat={chat} currentChatId={currentChatId} />
      ))}
    </div>
  )
}
