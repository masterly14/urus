import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <Icon className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">{description}</p>
      )}
    </div>
  );
}
