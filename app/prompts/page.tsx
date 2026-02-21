"use client"

import { DialogCreatePrompt } from "@/app/components/prompt-library/dialog-create-prompt"
import {
  PromptCard,
  type Prompt,
} from "@/app/components/prompt-library/prompt-card"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { MagnifyingGlass, Plus } from "@phosphor-icons/react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-16 text-sm">
      <span className="text-3xl">📭</span>
      <p>{label}</p>
    </div>
  )
}

function PromptGrid({
  prompts,
  onDelete,
  isLoading,
  emptyLabel,
}: {
  prompts: Prompt[]
  onDelete: ((id: string) => void) | null
  isLoading: boolean
  emptyLabel: string
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-muted animate-pulse rounded-xl"
            style={{ height: 140 }}
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
  const [createOpen, setCreateOpen] = useState(false)
  const [, startTransition] = useTransition()

  const { data: allPrompts = [], isLoading } = useQuery<Prompt[]>({
    queryKey: ["prompts", debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("search", debouncedSearch)
      const res = await fetch(`/api/prompts?${params}`)
      if (!res.ok) throw new Error("Failed to fetch prompts")
      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete prompt")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] })
      toast.success("Prompt deleted")
    },
    onError: () => {
      toast.error("Failed to delete prompt")
    },
  })

  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(() => {
      startTransition(() => setDebouncedSearch(value))
    }, 300)
    setDebounceTimer(timer)
  }

  const systemPrompts = allPrompts.filter((p) => p.category === "system")
  const privatePrompts = allPrompts.filter((p) => p.category === "user-private")
  const sharedPrompts = allPrompts.filter((p) => p.category === "user-shared")

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
              Browse built-in prompts, manage your own, and discover prompts shared by others.
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
        <div className="relative mb-6">
          <MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search prompts by title or content…"
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="system">
          <TabsList className="mb-5">
            <TabsTrigger value="system">
              Built-in
              {!isLoading && (
                <span className="text-muted-foreground ml-1.5 text-xs">
                  {systemPrompts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="private">
              My Prompts
              {!isLoading && (
                <span className="text-muted-foreground ml-1.5 text-xs">
                  {privatePrompts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="shared">
              Shared
              {!isLoading && (
                <span className="text-muted-foreground ml-1.5 text-xs">
                  {sharedPrompts.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="system">
            <PromptGrid
              prompts={systemPrompts}
              onDelete={null}
              isLoading={isLoading}
              emptyLabel={
                debouncedSearch
                  ? "No built-in prompts match your search."
                  : "No built-in prompts."
              }
            />
          </TabsContent>

          <TabsContent value="private">
            <PromptGrid
              prompts={privatePrompts}
              onDelete={(id) => deleteMutation.mutate(id)}
              isLoading={isLoading}
              emptyLabel={
                debouncedSearch
                  ? "No private prompts match your search."
                  : "You haven't created any private prompts yet."
              }
            />
          </TabsContent>

          <TabsContent value="shared">
            <PromptGrid
              prompts={sharedPrompts}
              onDelete={null}
              isLoading={isLoading}
              emptyLabel={
                debouncedSearch
                  ? "No shared prompts match your search."
                  : "No shared prompts yet."
              }
            />
          </TabsContent>
        </Tabs>

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
