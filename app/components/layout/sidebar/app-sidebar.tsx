"use client"

import { groupChatsByDate } from "@/app/components/history/utils"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { HeaderSidebarTrigger } from "@/app/components/layout/header-sidebar-trigger"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useUser } from "@/lib/user-store/provider"
import {
  ChatTeardropText,
  GithubLogo,
  MagnifyingGlass,
  NotePencilIcon,
  X,
} from "@phosphor-icons/react"
import { Pin, Sparkles } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMemo } from "react"
import { HistoryTrigger } from "../../history/history-trigger"
import { SidebarList } from "./sidebar-list"
import { SidebarProject } from "./sidebar-project"

export function AppSidebar() {
  const isMobile = useBreakpoint(768)
  const { setOpenMobile } = useSidebar()
  const { chats, pinnedChats, isLoading } = useChats()
  const { user } = useUser()
  const params = useParams<{ chatId: string }>()
  const currentChatId = params.chatId

  const isLoggedIn = !!user

  const groupedChats = useMemo(() => {
    const result = groupChatsByDate(chats, "")
    return result
  }, [chats])
  const hasChats = chats.length > 0
  const router = useRouter()

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="border-r border-border/40 bg-sidebar"
    >
      <SidebarHeader className="h-14 pl-2">
        <div className="flex items-center">
          {isMobile ? (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-md bg-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <X size={24} />
            </button>
          ) : (
            <HeaderSidebarTrigger />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="border-t border-border/40">
        <ScrollArea className="flex h-full px-2 [&>div>div]:!block">
          {isLoggedIn ? (
            <>
              <div className="mt-3 mb-5 flex w-full flex-col items-start gap-0">
                <button
                  className="hover:bg-accent/80 hover:text-foreground text-primary group/new-chat relative inline-flex w-full items-center rounded-md bg-transparent px-2 py-2 text-sm transition-colors"
                  type="button"
                  onClick={() => router.push("/")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <NotePencilIcon size={20} className="shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">New Chat</span>
                  </div>
                  <div className="text-muted-foreground ml-auto text-xs opacity-0 duration-150 group-hover/new-chat:opacity-100 group-data-[collapsible=icon]:hidden">
                    ⌘⇧U
                  </div>
                </button>
                <HistoryTrigger
                  hasSidebar={false}
                  classNameTrigger="bg-transparent hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors group/search"
                  icon={<MagnifyingGlass size={20} className="shrink-0" />}
                  label={
                    <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:hidden">
                      <span>Search</span>
                      <div className="text-muted-foreground ml-auto text-xs opacity-0 duration-150 group-hover/search:opacity-100">
                        ⌘+K
                      </div>
                    </div>
                  }
                  hasPopover={false}
                />
              </div>
              <div className="group-data-[collapsible=icon]:hidden">
                <SidebarProject />
              </div>
              {isLoading ? (
                <div className="h-full" />
              ) : hasChats ? (
                <div className="space-y-5 group-data-[collapsible=icon]:hidden">
                  {pinnedChats.length > 0 && (
                    <div className="space-y-5">
                      <SidebarList
                        key="pinned"
                        title="Pinned"
                        icon={<Pin className="size-3" />}
                        items={pinnedChats}
                        currentChatId={currentChatId}
                      />
                    </div>
                  )}
                  {groupedChats?.map((group) => (
                    <SidebarList
                      key={group.name}
                      title={group.name}
                      items={group.chats}
                      currentChatId={currentChatId}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-[calc(100vh-160px)] flex-col items-center justify-center group-data-[collapsible=icon]:hidden">
                  <ChatTeardropText
                    size={24}
                    className="text-muted-foreground mb-1 opacity-40"
                  />
                  <div className="text-muted-foreground text-center">
                    <p className="mb-1 text-base font-medium">No chats yet</p>
                    <p className="text-sm opacity-70">Start a new conversation</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-[calc(100vh-160px)] flex-col items-center justify-center gap-4 px-2 group-data-[collapsible=icon]:hidden">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex size-10 items-center justify-center rounded-full gradient-primary">
                  <Sparkles className="size-5 text-white" />
                </div>
                <p className="text-sm font-medium text-foreground">Sign in to save chats</p>
                <p className="text-xs text-muted-foreground">
                  Your conversations will appear here
                </p>
              </div>
              <Link
                href="/auth"
                className="gradient-primary inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Sign in
              </Link>
            </div>
          )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 mb-2 p-2">
        <a
          href="https://github.com/ibelick/zola"
          className="hover:bg-muted flex items-center gap-2 rounded-md p-2"
          target="_blank"
          aria-label="Star the repo on GitHub"
        >
          <div className="rounded-full border p-1 shrink-0">
            <GithubLogo className="size-4" />
          </div>
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <div className="text-sidebar-foreground text-sm font-medium truncate">
              Zola is open source
            </div>
            <div className="text-sidebar-foreground/70 text-xs truncate">
              Star on GitHub!
            </div>
          </div>
        </a>
      </SidebarFooter>
    </Sidebar>
  )
}
