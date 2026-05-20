import * as React from "react"
import { Search, Funnel } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface FilterBarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters?: React.ReactNode
  badges?: React.ReactNode
  className?: string
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters,
  badges,
  className,
}: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 bg-card p-4 rounded-lg border border-border/50 shadow-sm", className)}>
      <Funnel className="h-4 w-4 text-muted-foreground" />
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-8 h-9"
        />
      </div>
      {filters && (
        <div className="flex flex-wrap items-center gap-2">
          {filters}
        </div>
      )}
      {badges && (
        <div className="ml-auto flex items-center gap-2">
          {badges}
        </div>
      )}
    </div>
  )
}
