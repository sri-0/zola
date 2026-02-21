"use client"

import { groupChatsByDate } from "@/app/components/history/utils"
import { HistoryTrigger } from "@/app/components/history/history-trigger"
import { ZolaIcon } from "@/components/icons/zola"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useChats } from "@/lib/chat-store/chats/provider"
import { APP_NAME } from "@/lib/config"
import { useUser } from "@/lib/user-store/provider"
import {
  Books,
  ChatTeardropText,
  MagnifyingGlass,
  NotePencilIcon,
} from "@phosphor-icons/react"
import { Pin, Sparkles } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMemo } from "react"
import { SidebarList } from "./sidebar-list"
import { SidebarProject } from "./sidebar-project"

export function AppSidebar() {
  const { chats, pinnedChats, isLoading } = useChats()
  const { user } = useUser()
  const params = useParams<{ chatId: string }>()
  const currentChatId = params.chatId
  const isLoggedIn = !!user
  const router = useRouter()

  const groupedChats = useMemo(() => groupChatsByDate(chats, ""), [chats])
  const hasChats = chats.length > 0

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      {/* Header: logo + trigger side by side */}
      <SidebarHeader className="h-14 px-2">
        <div className="flex h-full items-center justify-between group-data-[collapsible=icon]:justify-center">
          {/* Brand — hidden in icon mode */}
          <Link
            href="/"
            className="flex items-center gap-2 group-data-[collapsible=icon]:hidden"
          >
            <ZolaIcon className="size-4 shrink-0" />
            <span className="gradient-text text-sm font-semibold">
              {APP_NAME}
            </span>
          </Link>
          {/* Collapse toggle */}
          <SidebarTrigger className="text-sidebar-foreground/60 hover:text-sidebar-foreground shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Primary actions */}
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New Chat"
                  onClick={() => router.push("/")}
                  className="text-sidebar-foreground/80"
                >
                  <NotePencilIcon className="size-4" />
                  <span>New Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isLoggedIn && (
                <SidebarMenuItem>
                  <HistoryTrigger
                    hasSidebar={false}
                    classNameTrigger="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm text-sidebar-foreground/80 transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>svg]:size-4 [&>svg]:shrink-0"
                    icon={<MagnifyingGlass className="size-4 shrink-0" />}
                    label={<span>Search</span>}
                    hasPopover={false}
                  />
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Prompt Library"
                  onClick={() => router.push("/prompts")}
                  className="text-sidebar-foreground/80"
                >
                  <Books className="size-4" />
                  <span>Prompt Library</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isLoggedIn ? (
          <>
            {/* Projects */}
            <SidebarGroup className="group-data-[collapsible=icon]:hidden py-0">
              <SidebarGroupContent>
                <SidebarProject />
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

            {/* Chat history */}
            {isLoading ? null : hasChats ? (
              <>
                {pinnedChats.length > 0 && (
                  <SidebarGroup className="group-data-[collapsible=icon]:hidden">
                    <SidebarGroupLabel className="flex items-center gap-1">
                      <Pin className="size-3" />
                      Pinned
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarList
                        title="Pinned"
                        items={pinnedChats}
                        currentChatId={currentChatId}
                      />
                    </SidebarGroupContent>
                  </SidebarGroup>
                )}

                {groupedChats?.map((group) => (
                  <SidebarGroup
                    key={group.name}
                    className="group-data-[collapsible=icon]:hidden"
                  >
                    <SidebarGroupLabel>{group.name}</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarList
                        title={group.name}
                        items={group.chats}
                        currentChatId={currentChatId}
                      />
                    </SidebarGroupContent>
                  </SidebarGroup>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 group-data-[collapsible=icon]:hidden">
                <ChatTeardropText
                  size={22}
                  className="text-sidebar-foreground/30"
                />
                <p className="text-sidebar-foreground/50 text-center text-sm">
                  No chats yet
                </p>
              </div>
            )}
          </>
        ) : (
          /* Non-logged-in CTA */
          <div className="flex flex-col items-center gap-3 px-3 py-10 group-data-[collapsible=icon]:hidden">
            <div
              className="flex size-10 items-center justify-center rounded-full"
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              <Sparkles className="size-5 text-white" />
            </div>
            <div className="text-center">
              <p className="text-sidebar-foreground text-sm font-medium">
                Sign in to save chats
              </p>
              <p className="text-sidebar-foreground/50 mt-0.5 text-xs">
                Your conversations will appear here
              </p>
            </div>
            <Link
              href="/auth"
              className="mt-1 inline-flex items-center justify-center rounded-md px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              Sign in
            </Link>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  )
}
