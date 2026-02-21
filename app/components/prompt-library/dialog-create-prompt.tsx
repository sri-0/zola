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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useState } from "react"
import { toast } from "sonner"

type DialogCreatePromptProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function DialogCreatePrompt({
  open,
  onOpenChange,
  onCreated,
}: DialogCreatePromptProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState<"user-private" | "user-shared">(
    "user-private"
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isValid = title.trim().length > 0 && content.trim().length > 0

  async function handleCreate() {
    if (!isValid || isSubmitting) return
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), category }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to create prompt")
      }

      toast.success("Prompt created")
      onCreated()
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create prompt")
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClose() {
    setTitle("")
    setContent("")
    setCategory("user-private")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Prompt</DialogTitle>
          <DialogDescription>
            Write a reusable system prompt. Supports markdown formatting.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prompt-title">Title</Label>
              <Input
                id="prompt-title"
                placeholder="e.g. Expert Code Reviewer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Visibility</Label>
              <Select
                value={category}
                onValueChange={(v) =>
                  setCategory(v as "user-private" | "user-shared")
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user-private">Private</SelectItem>
                  <SelectItem value="user-shared">Shared</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="prompt-content">
              Prompt{" "}
              <span className="text-muted-foreground font-normal">
                (markdown supported)
              </span>
            </Label>
            <Textarea
              id="prompt-content"
              placeholder={`You are a helpful assistant that...\n\nWhen responding, always:\n- Do X\n- Avoid Y`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[280px] flex-1 resize-none font-mono text-sm leading-relaxed"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!isValid || isSubmitting}>
            {isSubmitting ? "Creating…" : "Create Prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
