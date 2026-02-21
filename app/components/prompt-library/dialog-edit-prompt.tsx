"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Prompt } from "./prompt-card"

type DialogEditPromptProps = {
  prompt: Prompt | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function DialogEditPrompt({
  prompt,
  open,
  onOpenChange,
  onSaved,
}: DialogEditPromptProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (prompt) {
      setTitle(prompt.title)
      setContent(prompt.content)
      setIsPublic(prompt.isPublic)
    }
  }, [prompt])

  const isValid = title.trim().length > 0 && content.trim().length > 0

  async function handleSave() {
    if (!isValid || isSubmitting || !prompt) return
    setIsSubmitting(true)

    try {
      const res = await fetch(`/api/prompts/${prompt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          isPublic,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to save prompt")
      }

      toast.success("Prompt saved")
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save prompt")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Prompt</DialogTitle>
          <DialogDescription>
            Update your prompt. Changes are saved immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-prompt-title">Title</Label>
            <Input
              id="edit-prompt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="edit-prompt-content">
              Prompt{" "}
              <span className="text-muted-foreground font-normal">
                (markdown supported)
              </span>
            </Label>
            <Textarea
              id="edit-prompt-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[280px] flex-1 resize-none font-mono text-sm leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Share with community</p>
              <p className="text-muted-foreground text-xs">
                Others will be able to see and use this prompt
              </p>
            </div>
            <Switch
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSubmitting}>
            {isSubmitting ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
