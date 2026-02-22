"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  CheckCircleIcon,
  ProhibitIcon,
  SkipForwardIcon,
  WarningIcon,
  DatabaseIcon,
} from "@phosphor-icons/react"
import { useState } from "react"

export type ToolInterruptAnnotation = {
  type: "tool_interrupt"
  toolCallId: string
  toolName: string
  prompt: string
  details: Record<string, unknown>
  thread_id: string
}

type ToolInterruptProps = {
  interrupt: ToolInterruptAnnotation
  onApprove: (action: "approved" | "denied" | "skipped", threadId: string) => void
  className?: string
}

export function ToolInterrupt({ interrupt, onApprove, className }: ToolInterruptProps) {
  const [decided, setDecided] = useState<"approved" | "denied" | "skipped" | null>(null)

  const handle = (action: "approved" | "denied" | "skipped") => {
    if (decided) return
    setDecided(action)
    onApprove(action, interrupt.thread_id)
  }

  return (
    <div
      className={cn(
        "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30",
        "rounded-lg border p-4 max-w-xl",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <WarningIcon className="size-4 text-amber-600 dark:text-amber-400 shrink-0" weight="fill" />
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Approval Required
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400 font-mono">
          <DatabaseIcon className="size-3" />
          {interrupt.toolName}
        </span>
      </div>

      {/* Prompt */}
      <p className="text-sm text-amber-900 dark:text-amber-200 mb-3">
        {interrupt.prompt}
      </p>

      {/* Details */}
      {Object.keys(interrupt.details).length > 0 && (
        <div className="bg-amber-100 dark:bg-amber-900/40 rounded-md p-3 mb-4 text-xs font-mono space-y-1">
          {Object.entries(interrupt.details).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-amber-600 dark:text-amber-400 shrink-0">{key}:</span>
              <span className="text-amber-900 dark:text-amber-200 break-all">
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {decided ? (
        <div className={cn(
          "flex items-center gap-2 text-sm font-medium",
          decided === "approved"
            ? "text-green-700 dark:text-green-400"
            : decided === "denied"
            ? "text-red-700 dark:text-red-400"
            : "text-gray-600 dark:text-gray-400"
        )}>
          {decided === "approved" && <CheckCircleIcon className="size-4" weight="fill" />}
          {decided === "denied"   && <ProhibitIcon   className="size-4" weight="fill" />}
          {decided === "skipped"  && <SkipForwardIcon className="size-4" weight="fill" />}
          {decided === "approved" ? "Approved — continuing..." :
           decided === "denied"   ? "Denied — operation cancelled." :
                                    "Skipped."}
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="default"
            className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
            onClick={() => handle("approved")}
          >
            <CheckCircleIcon className="size-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/40 gap-1.5"
            onClick={() => handle("denied")}
          >
            <ProhibitIcon className="size-4" />
            Deny
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground gap-1.5"
            onClick={() => handle("skipped")}
          >
            <SkipForwardIcon className="size-4" />
            Skip
          </Button>
        </div>
      )}
    </div>
  )
}
