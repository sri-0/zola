"use client"

import { Badge } from "@/components/ui/badge"
import { ModelConfig } from "@/lib/models/types"
import { PROVIDERS } from "@/lib/providers"
import { Brain, Eye, SpeakerHigh, Wrench } from "@phosphor-icons/react"

type ModelCardProps = {
  model: ModelConfig
  onClick: () => void
}

export function ModelCard({ model, onClick }: ModelCardProps) {
  const provider = PROVIDERS.find((p) => p.id === model.icon)

  return (
    <div
      className="bg-card border-border group flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-shadow hover:shadow-sm"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {provider?.icon ? (
          <provider.icon className="mt-0.5 size-5 shrink-0" />
        ) : (
          <div className="bg-muted mt-0.5 size-5 shrink-0 rounded" />
        )}
        <div className="min-w-0">
          <h3 className="text-foreground truncate font-medium leading-snug">
            {model.name}
          </h3>
          <p className="text-muted-foreground text-xs">{model.provider}</p>
        </div>
        {model.speed && (
          <Badge
            variant="outline"
            className="ml-auto shrink-0 px-1.5 py-0 text-xs"
          >
            {model.speed}
          </Badge>
        )}
      </div>

      {/* Description */}
      {model.description && (
        <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">
          {model.description}
        </p>
      )}

      {/* Capability badges */}
      <div className="flex flex-wrap gap-1.5">
        {model.reasoning && (
          <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-xs">
            <Brain className="size-2.5" />
            Reasoning
          </Badge>
        )}
        {model.vision && (
          <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-xs">
            <Eye className="size-2.5" />
            Vision
          </Badge>
        )}
        {model.tools && (
          <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-xs">
            <Wrench className="size-2.5" />
            Tools
          </Badge>
        )}
        {model.audio && (
          <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-xs">
            <SpeakerHigh className="size-2.5" />
            Audio
          </Badge>
        )}
        {model.openSource && (
          <Badge variant="secondary" className="px-1.5 py-0 text-xs">
            OSS
          </Badge>
        )}
      </div>
    </div>
  )
}
