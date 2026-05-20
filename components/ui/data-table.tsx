import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface ColumnDef<T> {
  header: React.ReactNode
  accessorKey?: keyof T
  cell?: (item: T) => React.ReactNode
  className?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  isLoading?: boolean
  emptyState?: React.ReactNode
  onRowClick?: (item: T) => void
  keyExtractor: (item: T) => string
}

export function DataTable<T>({
  data,
  columns,
  isLoading,
  emptyState,
  onRowClick,
  keyExtractor,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    )
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div className="rounded-md border border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col, i) => (
              <TableHead
                key={i}
                className={cn("text-xs uppercase tracking-wider text-muted-foreground", col.className)}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={cn(
                "transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/40"
              )}
            >
              {columns.map((col, i) => (
                <TableCell key={i} className={col.className}>
                  {col.cell ? col.cell(item) : col.accessorKey ? String(item[col.accessorKey]) : null}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
