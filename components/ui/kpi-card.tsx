import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface KpiCardProps {
  label: string
  value: number | string
  delta?: { value: number; direction: "up" | "down" | "stable" }
  hint?: string
  icon?: React.ReactNode
  state?: "default" | "warning" | "danger"
  href?: string
  className?: string
}

export function KpiCard({
  label,
  value,
  delta,
  hint,
  icon,
  state = "default",
  href,
  className,
}: KpiCardProps) {
  const content = (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-150",
        href && "cursor-pointer hover:bg-accent/40 hover:shadow-[var(--shadow-elevated)]",
        state === "warning" && value !== 0 && value !== "0" && "border-l-4 border-l-[var(--urus-warning)]",
        state === "danger" && value !== 0 && value !== "0" && "border-l-4 border-l-[var(--urus-danger)]",
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">
              {value}
            </p>
            {(delta || hint) && (
              <div className="flex items-center gap-1.5 text-xs">
                {delta && delta.value !== 0 && (
                  <span
                    className={cn(
                      "font-semibold",
                      delta.direction === "up" && "text-[var(--urus-success)]",
                      delta.direction === "down" && "text-[var(--urus-danger)]",
                      delta.direction === "stable" && "text-muted-foreground"
                    )}
                  >
                    {delta.direction === "up" ? "+" : ""}
                    {delta.direction === "down" ? "-" : ""}
                    {delta.value}%
                  </span>
                )}
                {hint && <span className="text-muted-foreground">{hint}</span>}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {icon && (
              <div className="rounded-lg bg-muted p-2.5 text-muted-foreground">
                {icon}
              </div>
            )}
            {href && (
              <ChevronRight className="h-5 w-5 text-muted-foreground mt-auto" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block outline-none">
        {content}
      </Link>
    )
  }

  return content
}
