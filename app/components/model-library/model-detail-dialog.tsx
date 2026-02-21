"use client"

import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { ModelConfig } from "@/lib/models/types"
import { PROVIDERS } from "@/lib/providers"
import { cn } from "@/lib/utils"
import {
  ArrowSquareOut,
  Brain,
  Code,
  Eye,
  Globe,
  SpeakerHigh,
  Wrench,
} from "@phosphor-icons/react"

type ModelDetailDialogProps = {
  model: ModelConfig | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function IntelligenceDots({ level }: { level: string }) {
  const filled = level === "Low" ? 1 : level === "Medium" ? 2 : 3
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "size-2.5 rounded-full",
            i <= filled ? "bg-foreground" : "bg-muted-foreground/20"
          )}
        />
      ))}
    </div>
  )
}

function SpeedBolts({ speed }: { speed: string }) {
  const count = speed === "Fast" ? 4 : speed === "Medium" ? 2 : 1
  return (
    <div className="flex">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "text-sm",
            i <= count ? "text-foreground" : "text-muted-foreground/20"
          )}
        >
          ⚡
        </span>
      ))}
    </div>
  )
}

function CapabilityItem({
  label,
  description,
  supported,
  icon,
}: {
  label: string
  description: string
  supported: boolean
  icon: React.ReactNode
}) {
  return (
    <div className={cn("flex items-center gap-3", !supported && "opacity-35")}>
      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="text-muted-foreground text-xs">
          {supported ? description : "Not supported"}
        </p>
      </div>
    </div>
  )
}

function StatCell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-card flex flex-col items-center gap-1.5 p-4">
      <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
        {label}
      </p>
      {children}
    </div>
  )
}

function formatCost(cost?: number) {
  if (cost === undefined) return "—"
  return `$${cost % 1 === 0 ? cost.toFixed(0) : cost}`
}

function formatContext(n?: number) {
  if (!n) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return n.toString()
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground mb-4 text-[11px] font-medium uppercase tracking-wider">
      {children}
    </p>
  )
}

export function ModelDetailDialog({
  model,
  open,
  onOpenChange,
}: ModelDetailDialogProps) {
  if (!model) return null

  const provider = PROVIDERS.find((p) => p.id === model.icon)
  const hasPricing =
    model.inputCost !== undefined || model.outputCost !== undefined
  const hasStats =
    model.intelligence || model.speed || hasPricing || model.contextWindow

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* ── Header ─────────────────────────────── */}
        <div className="flex items-start gap-4 border-b px-6 py-5">
          <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-xl">
            {provider?.icon ? (
              <provider.icon className="size-7" />
            ) : (
              <div className="bg-foreground/20 size-7 rounded" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-semibold leading-tight">{model.name}</DialogTitle>
            <p className="text-muted-foreground text-sm">{model.provider}</p>
            {model.modelFamily && (
              <p className="text-muted-foreground text-xs">{model.modelFamily}</p>
            )}
          </div>

          {/* External links */}
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {model.website && (
              <a
                href={model.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                Website
                <ArrowSquareOut className="size-3" />
              </a>
            )}
            {model.apiDocs && (
              <a
                href={model.apiDocs}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                API Docs
                <ArrowSquareOut className="size-3" />
              </a>
            )}
          </div>
        </div>

        {/* ── Scrollable body ────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Stats row */}
          {hasStats && (
            <div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4">
              {model.intelligence && (
                <StatCell label="Intelligence">
                  <IntelligenceDots level={model.intelligence} />
                  <p className="text-sm">{model.intelligence}</p>
                </StatCell>
              )}
              {model.speed && (
                <StatCell label="Speed">
                  <SpeedBolts speed={model.speed} />
                  <p className="text-sm">{model.speed}</p>
                </StatCell>
              )}
              {hasPricing && (
                <StatCell label="Price / 1M tokens">
                  <p className="text-sm font-medium">
                    {formatCost(model.inputCost)} · {formatCost(model.outputCost)}
                  </p>
                  <p className="text-muted-foreground text-xs">In · Out</p>
                </StatCell>
              )}
              {model.contextWindow && (
                <StatCell label="Context Window">
                  <p className="text-sm font-medium">
                    {formatContext(model.contextWindow)}
                  </p>
                  <p className="text-muted-foreground text-xs">tokens</p>
                </StatCell>
              )}
            </div>
          )}

          {/* Description */}
          {model.description && (
            <div className="border-b px-6 py-5">
              <p className="text-sm leading-relaxed">{model.description}</p>
            </div>
          )}

          {/* Capabilities */}
          <div className="border-b px-6 py-5">
            <SectionHeading>Capabilities</SectionHeading>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <CapabilityItem
                label="Vision"
                description="Image understanding"
                supported={!!model.vision}
                icon={<Eye className="size-4" />}
              />
              <CapabilityItem
                label="Tool Calling"
                description="Function use"
                supported={!!model.tools}
                icon={<Wrench className="size-4" />}
              />
              <CapabilityItem
                label="Reasoning"
                description="Extended thinking"
                supported={!!model.reasoning}
                icon={<Brain className="size-4" />}
              />
              <CapabilityItem
                label="Audio"
                description="Audio input/output"
                supported={!!model.audio}
                icon={<SpeakerHigh className="size-4" />}
              />
              <CapabilityItem
                label="Web Search"
                description="Live search"
                supported={!!model.webSearch}
                icon={<Globe className="size-4" />}
              />
              <CapabilityItem
                label="Open Source"
                description="Publicly available"
                supported={!!model.openSource}
                icon={<Code className="size-4" />}
              />
            </div>
          </div>

          {/* Pricing */}
          {hasPricing && (
            <div className="border-b px-6 py-5">
              <SectionHeading>Pricing</SectionHeading>
              <p className="text-muted-foreground mb-3 text-xs">
                {model.priceUnit ?? "Per 1M tokens"}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Input</p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatCost(model.inputCost)}
                  </p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Output</p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatCost(model.outputCost)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tags & release date */}
          {(model.tags?.length || model.releasedAt) && (
            <div className="px-6 py-5">
              {model.tags && model.tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {model.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="px-2 py-0 text-xs capitalize"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {model.releasedAt && (
                <p className="text-muted-foreground text-xs">
                  Released{" "}
                  {new Date(model.releasedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
