"use client"

import { Markdown } from "@/components/prompt-kit/markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Trash, Eye } from "@phosphor-icons/react"
import { useState } from "react"

const MOCK_USER_ID = "mock-user-123"

export type PromptCategory = "system" | "user-private" | "user-shared"

export type Prompt = {
  id: string
  title: string
  content: string
  category: PromptCategory
  userCreated: string | null
  userCreatedDate: string | null
  userId: string | null
}

type PromptCardProps = {
  prompt: Prompt
  onDelete?: (id: string) => void
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function PromptCard({ prompt, onDelete }: PromptCardProps) {
  const [viewOpen, setViewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isOwn = prompt.userId === MOCK_USER_ID
  const canDelete = isOwn && onDelete

  return (
    <>
      <div
        className="bg-card border-border hover:border-border/80 group relative flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-shadow hover:shadow-sm"
        onClick={() => setViewOpen(true)}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-foreground line-clamp-1 font-medium leading-snug">
            {prompt.title}
          </h3>
          {/* Action buttons — visible on hover */}
          <div
            className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setViewOpen(true)}
              aria-label="View prompt"
            >
              <Eye className="size-3.5" />
            </Button>
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive size-7"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete prompt"
              >
                <Trash className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {prompt.userCreated ? (
            <span>{prompt.userCreated}</span>
          ) : (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              Built-in
            </Badge>
          )}
          {prompt.userCreatedDate && (
            <>
              <span>·</span>
              <span>{formatDate(prompt.userCreatedDate)}</span>
            </>
          )}
        </div>

        {/* Content preview */}
        <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
          {prompt.content.replace(/[#*`_>]/g, "").trim()}
        </p>
      </div>

      {/* View dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{prompt.title}</DialogTitle>
            {prompt.userCreated && (
              <p className="text-muted-foreground text-sm">
                {prompt.userCreated}
                {prompt.userCreatedDate && (
                  <> · {formatDate(prompt.userCreatedDate)}</>
                )}
              </p>
            )}
          </DialogHeader>
          <div className="prose dark:prose-invert prose-sm max-w-none flex-1 overflow-y-auto">
            <Markdown>{prompt.content}</Markdown>
          </div>
          {canDelete && (
            <div className="border-border flex justify-end border-t pt-4">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setViewOpen(false)
                  setDeleteOpen(true)
                }}
              >
                <Trash className="mr-1.5 size-3.5" />
                Delete
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{prompt.title}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete?.(prompt.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
