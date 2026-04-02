import { Badge } from "@/components/ui/badge";

interface MockBadgeProps {
  show?: boolean;
}

export function MockBadge({ show = true }: MockBadgeProps) {
  if (!show) return null;

  return (
    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
      Modo demo (mock=1)
    </Badge>
  );
}
