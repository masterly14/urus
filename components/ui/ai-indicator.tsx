import { Sparkles } from "lucide-react";
import { Badge } from "./badge";
import { cn } from "@/lib/utils";

export function AiIndicator({
  label = "IA",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Badge variant="ai" className={cn("gap-1", className)}>
      <Sparkles className="h-3 w-3" />
      {label}
    </Badge>
  );
}
