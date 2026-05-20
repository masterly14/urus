import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

export interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: { label: string; href?: string }[]
  actions?: React.ReactNode
}

export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="breadcrumb" className="mb-2">
            <ol className="flex items-center space-x-1.5 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1
                return (
                  <li key={index} className="flex items-center">
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className={isLast ? "font-medium text-foreground" : ""}>
                        {crumb.label}
                      </span>
                    )}
                    {!isLast && <ChevronRight className="ml-1.5 h-3.5 w-3.5" />}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  )
}
