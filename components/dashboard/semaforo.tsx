import { cn } from "@/lib/utils";

interface SemaforoProps {
    status: "verde" | "amarillo" | "rojo";
    size?: "sm" | "md" | "lg";
    pulse?: boolean;
    label?: string;
}

const statusColors = {
    verde: "bg-[var(--urus-success)]",
    amarillo: "bg-[var(--urus-warning)]",
    rojo: "bg-[var(--urus-danger)]",
};

const statusLabels = {
    verde: "Bien",
    amarillo: "Riesgo",
    rojo: "Crítico",
};

const sizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-6 w-6",
};

export function Semaforo({ status, size = "md", pulse = false, label }: SemaforoProps) {
    return (
        <div className="flex items-center gap-2">
            <span
                className={cn(
                    "rounded-full inline-block",
                    statusColors[status],
                    sizes[size],
                    pulse && status === "rojo" && "animate-pulse"
                )}
            />
            {label !== undefined ? (
                <span className="text-sm">{label}</span>
            ) : (
                <span className="text-xs text-muted-foreground">{statusLabels[status]}</span>
            )}
        </div>
    );
}
