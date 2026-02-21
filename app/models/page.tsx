"use client"

import { ModelCard } from "@/app/components/model-library/model-card"
import { ModelDetailDialog } from "@/app/components/model-library/model-detail-dialog"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { Input } from "@/components/ui/input"
import { useModel } from "@/lib/model-store/provider"
import { ModelConfig } from "@/lib/models/types"
import { cn } from "@/lib/utils"
import { MagnifyingGlass } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

type FilterKey =
  | "all"
  | "reasoning"
  | "vision"
  | "tools"
  | "audio"
  | "open-source"
  | "fast"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reasoning", label: "Reasoning" },
  { key: "vision", label: "Vision" },
  { key: "tools", label: "Tool Calling" },
  { key: "audio", label: "Audio" },
  { key: "open-source", label: "Open Source" },
  { key: "fast", label: "Fast" },
]

function applyFilter(
  models: ModelConfig[],
  filter: FilterKey,
  search: string
): ModelConfig[] {
  let result = models

  if (filter === "reasoning") result = result.filter((m) => m.reasoning)
  else if (filter === "vision") result = result.filter((m) => m.vision)
  else if (filter === "tools") result = result.filter((m) => m.tools)
  else if (filter === "audio") result = result.filter((m) => m.audio)
  else if (filter === "open-source") result = result.filter((m) => m.openSource)
  else if (filter === "fast") result = result.filter((m) => m.speed === "Fast")

  if (search.trim()) {
    const q = search.toLowerCase()
    result = result.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q)
    )
  }

  return result
}

export default function ModelsPage() {
  const { models, isLoading } = useModel()
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null)

  const filteredModels = useMemo(
    () => applyFilter(models, activeFilter, search),
    [models, activeFilter, search]
  )

  return (
    <LayoutApp>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Browse all available AI models and their capabilities.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <MagnifyingGlass className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, provider, or description…"
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
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="bg-muted animate-pulse rounded-xl"
                style={{ height: 148 }}
              />
            ))}
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-20 text-sm">
            <span className="text-4xl">🤖</span>
            <p>No models match your search.</p>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground mb-3 text-xs">
              {filteredModels.length} model
              {filteredModels.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  onClick={() => setSelectedModel(model)}
                />
              ))}
            </div>
          </>
        )}

        <ModelDetailDialog
          model={selectedModel}
          open={!!selectedModel}
          onOpenChange={(open) => {
            if (!open) setSelectedModel(null)
          }}
        />
      </div>
    </LayoutApp>
  )
}
