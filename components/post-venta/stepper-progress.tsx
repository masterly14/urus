"use client";

import { cn } from "@/lib/utils";
import { Check, Clock, ArrowRight } from "lucide-react";
import type { EtapaPostVenta } from "@/lib/mock-data/types";

interface StepperProgressProps {
    currentStep: EtapaPostVenta;
    className?: string;
    compact?: boolean;
}

const steps = [
    { id: 1 as EtapaPostVenta, label: "Cierre Inmediato", description: "Agradecimiento + Email resumen", emoji: "🤝" },
    { id: 2 as EtapaPostVenta, label: "Soporte Temprano", description: "Validación + Mini guía", emoji: "📋" },
    { id: 3 as EtapaPostVenta, label: "Reputación", description: "Petición de reseña", emoji: "⭐" },
    { id: 4 as EtapaPostVenta, label: "Referidos", description: "Invitación + Enlace", emoji: "🔗" },
    { id: 5 as EtapaPostVenta, label: "Recaptación", description: "Segmentación", emoji: "🔄" },
];

export function StepperProgress({ currentStep, className, compact = false }: StepperProgressProps) {
    return (
        <div className={cn("flex items-center w-full", className)}>
            {steps.map((step, index) => {
                const isCompleted = step.id < currentStep;
                const isCurrent = step.id === currentStep;
                const isFuture = step.id > currentStep;

                return (
                    <div key={step.id} className="flex items-center flex-1 last:flex-initial">
                        {/* Step circle + label */}
                        <div className="flex flex-col items-center gap-1.5 relative group">
                            <div
                                className={cn(
                                    "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 shrink-0 relative",
                                    isCompleted &&
                                    "bg-[var(--urus-success)] text-white shadow-md shadow-[var(--urus-success)]/20",
                                    isCurrent &&
                                    "bg-gradient-to-br from-secondary to-secondary/70 text-secondary-foreground shadow-lg shadow-secondary/20 ring-4 ring-secondary/10",
                                    isFuture && "bg-accent/40 text-muted-foreground border border-border/50"
                                )}
                            >
                                {isCompleted ? (
                                    <Check className="h-4 w-4" />
                                ) : isCurrent ? (
                                    <span className="text-xs">{step.emoji}</span>
                                ) : (
                                    <span className="text-xs font-mono">{step.id}</span>
                                )}
                                {isCurrent && (
                                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[var(--urus-success)] border-2 border-card animate-pulse" />
                                )}
                            </div>
                            {!compact && (
                                <div className="text-center max-w-[90px]">
                                    <p
                                        className={cn(
                                            "text-[10px] font-semibold leading-tight",
                                            isCurrent ? "text-secondary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                                        )}
                                    >
                                        {step.label}
                                    </p>
                                    <p className="text-[9px] text-muted-foreground/60 leading-tight mt-0.5 hidden xl:block">
                                        {step.description}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Connector line */}
                        {index < steps.length - 1 && (
                            <div className="flex-1 mx-2">
                                <div className="h-0.5 w-full rounded-full relative overflow-hidden bg-accent/40">
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                            width: isCompleted ? "100%" : isCurrent ? "50%" : "0%",
                                            background: isCompleted
                                                ? "var(--urus-success)"
                                                : "linear-gradient(90deg, var(--urus-gold), transparent)",
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export { steps as PIPELINE_STEPS };
