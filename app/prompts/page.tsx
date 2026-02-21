"use client"

import { DialogCreatePrompt } from "@/app/components/prompt-library/dialog-create-prompt"
import {
  PromptCard,
  type Prompt,
} from "@/app/components/prompt-library/prompt-card"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { MagnifyingGlass, Plus } from "@phosphor-icons/react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

type FilterKey = "all" | "system" | "mine" | "shared"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "system", label: "Built-in" },
  { key: "mine", label: "My Prompts" },
  { key: "shared", label: "Shared" },
]

function filterToParams(filter: FilterKey): URLSearchParams {
  const p = new URLSearchParams()
  if (filter === "system") {
    p.set("type", "system")
  } else if (filter === "mine") {
    p.set("type", "user")
    p.set("public", "false")
  } else if (filter === "shared") {
    p.set("type", "user")
    p.set("public", "true")
  }
  return p
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-20 text-sm">
      <span className="text-4xl">📭</span>
      <p>{label}</p>
    </div>
  )
}

function PromptGrid({
  prompts,
  onDelete,
  onEdited,
  isLoading,
  emptyLabel,
}: {
  prompts: Prompt[]
  onDelete: ((id: string) => void) | null
  onEdited: () => void
  isLoading: boolean
  emptyLabel: string
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-muted animate-pulse rounded-xl"
            style={{ height: 148 }}
          />
        ))}
      </div>
    )
  }

  if (prompts.length === 0) {
    return <EmptyState label={emptyLabel} />
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {prompts.map((prompt) => (
        <PromptCard
          key={prompt.id}
          prompt={prompt}
          onDelete={onDelete ?? undefined}
          onEdited={onEdited}
        />
      ))}
    </div>
  )
}

export default function PromptsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [, startTransition] = useTransition()

  const { data: prompts = [], isLoading } = useQuery<Prompt[]>({
    queryKey: ["prompts", activeFilter, debouncedSearch],
    queryFn: async () => {
      const params = filterToParams(activeFilter)
      if (debouncedSearch) params.set("search", debouncedSearch)
      const res = await fetch(`/api/prompts?${params}`)
      if (!res.ok) throw new Error("Failed to fetch prompts")
      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] })
      toast.success("Prompt deleted")
    },
    onError: () => toast.error("Failed to delete prompt"),
  })

  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(() => {
      startTransition(() => setDebouncedSearch(value))
    }, 300)
    setDebounceTimer(timer)
  }

  // only user-owned prompts can be deleted; system prompts cannot
  function canDelete(prompt: Prompt) {
    return prompt.promptType === "user" && prompt.userId === "mock-user-123"
  }

  const emptyLabel = debouncedSearch
    ? `No prompts match "${debouncedSearch}".`
    : activeFilter === "mine"
    ? "You haven't created any prompts yet."
    : "No prompts here yet."

  return (
    <LayoutApp>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Page header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Prompt Library
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Browse built-in prompts, manage your own, and discover prompts
              shared by the community.
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <Plus className="size-4" />
            New Prompt
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <MagnifyingGlass className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search prompts by title or content…"
            className="pl-9"
          />
        </div>

        {/* Filter tags */}
        <div className="mb-6 flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={cn(
                "rounded-full border px-3.5 py-1 text-sm font-medium transition-colors",
                activeFilter === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-transparent"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <PromptGrid
          prompts={prompts}
          onDelete={(id) => {
            const prompt = prompts.find((p) => p.id === id)
            if (prompt && canDelete(prompt)) deleteMutation.mutate(id)
          }}
          onEdited={() => queryClient.invalidateQueries({ queryKey: ["prompts"] })}
          isLoading={isLoading}
          emptyLabel={emptyLabel}
        />

        <DialogCreatePrompt
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: ["prompts"] })
          }
        />
      </div>
    </LayoutApp>
  )
}
