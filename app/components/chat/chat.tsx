"use client"

import { ChatInput } from "@/app/components/chat-input/chat-input"
import { Conversation } from "@/app/components/chat/conversation"
import { useModel } from "@/app/components/chat/use-model"
import { useChatDraft } from "@/app/hooks/use-chat-draft"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useMessages } from "@/lib/chat-store/messages/provider"
import { useChatSession } from "@/lib/chat-store/session/provider"
import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "motion/react"
import { redirect } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ToolInterrupt, type ToolInterruptAnnotation } from "./tool-interrupt"
import { useChatCore } from "./use-chat-core"
import { useChatOperations } from "./use-chat-operations"
import { useFileUpload } from "./use-file-upload"

export function Chat() {
  const { chatId } = useChatSession()
  const {
    createNewChat,
    getChatById,
    updateChatModel,
    bumpChat,
    isLoading: isChatsLoading,
  } = useChats()

  const currentChat = useMemo(
    () => (chatId ? getChatById(chatId) : null),
    [chatId, getChatById]
  )

  const { messages: initialMessages, cacheAndAddMessage } = useMessages()
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const { draftValue, clearDraft } = useChatDraft(chatId)

  // File upload functionality
  const {
    files,
    setFiles,
    handleFileUploads,
    createOptimisticAttachments,
    cleanupOptimisticAttachments,
    handleFileUpload,
    handleFileRemove,
  } = useFileUpload()

  // Model selection
  const { selectedModel, handleModelChange } = useModel({
    currentChat: currentChat || null,
    user,
    updateChatModel,
    chatId,
  })

  const isAuthenticated = useMemo(() => !!user?.id, [user?.id])
  const systemPrompt = useMemo(
    () => user?.system_prompt || SYSTEM_PROMPT_DEFAULT,
    [user?.system_prompt]
  )

  // New state for quoted text
  const [quotedText, setQuotedText] = useState<{
    text: string
    messageId: string
  }>()
  const handleQuotedSelected = useCallback(
    (text: string, messageId: string) => {
      setQuotedText({ text, messageId })
    },
    []
  )

  // Chat operations (utils + handlers) - created first
  const { checkLimitsAndNotify, ensureChatExists, handleDelete } =
    useChatOperations({
      isAuthenticated,
      chatId,
      messages: initialMessages,
      selectedModel,
      systemPrompt,
      createNewChat,
      setMessages: () => {},
      setInput: () => {},
    })

  // Core chat functionality (initialization + state + actions)
  const {
    messages,
    input,
    status,
    stop,
    hasSentFirstMessageRef,
    isSubmitting,
    enableSearch,
    setEnableSearch,
    submit,
    handleSuggestion,
    handleReload,
    handleInputChange,
    submitEdit,
    append,
  } = useChatCore({
    initialMessages,
    draftValue,
    cacheAndAddMessage,
    chatId,
    user,
    files,
    createOptimisticAttachments,
    setFiles,
    checkLimitsAndNotify,
    cleanupOptimisticAttachments,
    ensureChatExists,
    handleFileUploads,
    selectedModel,
    clearDraft,
    bumpChat,
  })

  // Memoize the conversation props to prevent unnecessary rerenders
  const conversationProps = useMemo(
    () => ({
      messages,
      status,
      onDelete: handleDelete,
      onEdit: submitEdit,
      onReload: handleReload,
      onQuote: handleQuotedSelected,
      isUserAuthenticated: isAuthenticated,
    }),
    [
      messages,
      status,
      handleDelete,
      submitEdit,
      handleReload,
      handleQuotedSelected,
      isAuthenticated,
    ]
  )

  // Memoize the chat input props
  const chatInputProps = useMemo(
    () => ({
      value: input,
      onSuggestion: handleSuggestion,
      onValueChange: handleInputChange,
      onSend: submit,
      isSubmitting,
      files,
      onFileUpload: handleFileUpload,
      onFileRemove: handleFileRemove,
      hasSuggestions:
        preferences.promptSuggestions && !chatId && messages.length === 0,
      onSelectModel: handleModelChange,
      selectedModel,
      isUserAuthenticated: isAuthenticated,
      stop,
      status,
      setEnableSearch,
      enableSearch,
      quotedText,
    }),
    [
      input,
      handleSuggestion,
      handleInputChange,
      submit,
      isSubmitting,
      files,
      handleFileUpload,
      handleFileRemove,
      preferences.promptSuggestions,
      chatId,
      messages.length,
      handleModelChange,
      selectedModel,
      isAuthenticated,
      stop,
      status,
      setEnableSearch,
      enableSearch,
      quotedText,
    ]
  )

  // Interrupt card state — held in component state so it survives message reconciliation
  // (message.annotations gets wiped when onFinish calls syncRecentMessages from DB).
  const [pendingInterrupt, setPendingInterrupt] = useState<ToolInterruptAnnotation | null>(null)
  // Track handled toolCallIds (unique per interrupt) to prevent re-showing the same one.
  // thread_id == chatId so cannot be used for dedup across multiple interrupts in one chat.
  const handledToolCallIdsRef = useRef<Set<string>>(new Set())

  // Clear interrupt when navigating to a different chat
  useEffect(() => {
    setPendingInterrupt(null)
    handledToolCallIdsRef.current = new Set()
  }, [chatId])

  // When the stream ends, check the server for a pending tool interrupt.
  // The route stores it synchronously as bytes flow through; by the time
  // status === "ready" the store is guaranteed to have been written.
  useEffect(() => {
    if (status !== "ready" || !chatId) return
    fetch(`/api/chat?interrupt=${encodeURIComponent(chatId)}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as Record<string, unknown> | null
        if (
          d?.type === "tool_interrupt" &&
          typeof d.toolCallId === "string" &&
          !handledToolCallIdsRef.current.has(d.toolCallId)
        ) {
          setPendingInterrupt(d as unknown as ToolInterruptAnnotation)
        }
      })
      .catch(() => {})
  }, [status, chatId])

  // When the user approves/denies/skips an interrupt, send the resume signal.
  // We send a special "RESUME:<action>:<thread_id>" user message that route.ts
  // intercepts and forwards to the FastAPI resume endpoint.
  // The message is filtered from the conversation UI in conversation.tsx.
  const handleInterruptResume = useCallback(
    async (action: "approved" | "denied" | "skipped", threadId: string) => {
      const uid = await import("@/lib/api").then((m) => m.getOrCreateGuestUserId(user))
      if (!uid || !chatId) return

      // Mark this specific interrupt as handled so it won't re-appear
      if (pendingInterrupt?.toolCallId) {
        handledToolCallIdsRef.current.add(pendingInterrupt.toolCallId)
      }
      setPendingInterrupt(null)

      const currentChatId = chatId
      append(
        { role: "user", content: `RESUME:${action}:${threadId}` },
        {
          body: {
            chatId: currentChatId,
            userId: uid,
            model: selectedModel,
            isAuthenticated,
            systemPrompt: systemPrompt || SYSTEM_PROMPT_DEFAULT,
            enableSearch,
          },
        }
      )
    },
    [append, chatId, user, selectedModel, isAuthenticated, systemPrompt, enableSearch, pendingInterrupt]
  )

  // Handle redirect for invalid chatId - only redirect if we're certain the chat doesn't exist
  // and we're not in a transient state during chat creation
  if (
    chatId &&
    !isChatsLoading &&
    !currentChat &&
    !isSubmitting &&
    status === "ready" &&
    messages.length === 0 &&
    !hasSentFirstMessageRef.current // Don't redirect if we've already sent a message in this session
  ) {
    return redirect("/")
  }

  const showOnboarding = !chatId && messages.length === 0

  return (
    <div
      className={cn(
        "@container/main relative flex h-full flex-col items-center justify-end md:justify-center"
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {showOnboarding ? (
          <motion.div
            key="onboarding"
            className="absolute bottom-[60%] mx-auto max-w-[50rem] md:relative md:bottom-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            layout="position"
            layoutId="onboarding"
            transition={{
              layout: {
                duration: 0,
              },
            }}
          >
            <h1 className="mb-6 text-3xl font-medium tracking-tight">
              What&apos;s on your mind?
            </h1>
          </motion.div>
        ) : (
          <Conversation key="conversation" {...conversationProps} />
        )}
      </AnimatePresence>

      <motion.div
        className={cn(
          "relative inset-x-0 bottom-0 z-50 mx-auto w-full max-w-3xl"
        )}
        layout="position"
        layoutId="chat-input-container"
        transition={{
          layout: {
            duration: messages.length === 1 ? 0.3 : 0,
          },
        }}
      >
        {/* Tool interrupt approval card — shown above chat input when agent needs approval */}
        {pendingInterrupt && (
          <div className="px-2 pb-3">
            <ToolInterrupt
              interrupt={pendingInterrupt}
              onApprove={handleInterruptResume}
            />
          </div>
        )}
        <ChatInput {...chatInputProps} />
      </motion.div>

    </div>
  )
}
