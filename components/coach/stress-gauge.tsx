"use client";

import { cn } from "@/lib/utils";

interface StressGaugeProps {
    level: number; // 0-100
    label?: string;
    size?: number;
    className?: string;
}

function getStressInfo(level: number) {
    if (level <= 33) return { color: "var(--urus-success)", text: "Bajo", emoji: "😌" };
    if (level <= 66) return { color: "var(--urus-warning)", text: "Medio", emoji: "😐" };
    return { color: "var(--urus-danger)", text: "Alto", emoji: "😰" };
}

export function StressGauge({ level, label = "Estrés del Equipo", size = 180, className }: StressGaugeProps) {
    const info = getStressInfo(level);
    const radius = (size - 20) / 2;
    const circumference = Math.PI * radius; // semicircle
    const strokeDashoffset = circumference - (level / 100) * circumference;
    const cx = size / 2;
    const cy = size / 2 + 10;

    return (
        <div className={cn("flex flex-col items-center", className)}>
            <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
                <defs>
                    <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--urus-success)" />
                        <stop offset="50%" stopColor="var(--urus-warning)" />
                        <stop offset="100%" stopColor="var(--urus-danger)" />
                    </linearGradient>
                </defs>
                {/* Background arc */}
                <path
                    d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                    fill="none"
                    stroke="oklch(0.3 0 0 / 30%)"
                    strokeWidth="12"
                    strokeLinecap="round"
                />
                {/* Filled arc */}
                <path
                    d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                    fill="none"
                    stroke="url(#gaugeGrad)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    style={{
                        transition: "stroke-dashoffset 1s ease-in-out",
                    }}
                />
                {/* Center text */}
                <text
                    x={cx}
                    y={cy - radius * 0.3}
                    textAnchor="middle"
                    className="text-3xl"
                    style={{ fontSize: size * 0.18 }}
                >
                    {info.emoji}
                </text>
                <text
                    x={cx}
                    y={cy - 4}
                    textAnchor="middle"
                    fill="currentColor"
                    style={{ fontSize: size * 0.16, fontWeight: 700 }}
                >
                    {level}%
                </text>
            </svg>
            <div className="flex flex-col items-center gap-1 -mt-1">
                <span
                    className="text-sm font-semibold px-3 py-0.5 rounded-full"
                    style={{
                        backgroundColor: `color-mix(in oklch, ${info.color} 15%, transparent)`,
                        color: info.color,
                    }}
                >
                    {info.text}
                </span>
                <span className="text-xs text-muted-foreground">{label}</span>
            </div>
        </div>
    );
}
