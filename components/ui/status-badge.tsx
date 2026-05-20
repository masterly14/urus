import * as React from "react"
import { cn } from "@/lib/utils"

export type StatusBadgeVariant = "success" | "warning" | "danger" | "info" | "neutral"

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: StatusBadgeVariant
}

export function StatusBadge({
  className,
  variant = "neutral",
  ...props
}: StatusBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "bg-[var(--urus-success-bg)] text-[var(--urus-success)] border-[var(--urus-success)]/20":
            variant === "success",
          "bg-[var(--urus-warning-bg)] text-[var(--urus-warning)] border-[var(--urus-warning)]/20":
            variant === "warning",
          "bg-[var(--urus-danger-bg)] text-[var(--urus-danger)] border-[var(--urus-danger)]/20":
            variant === "danger",
          "bg-[var(--urus-info-bg)] text-[var(--urus-info)] border-[var(--urus-info)]/20":
            variant === "info",
          "bg-muted/50 text-muted-foreground border-border/50":
            variant === "neutral",
        },
        className
      )}
      {...props}
    />
  )
}
