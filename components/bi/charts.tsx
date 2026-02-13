"use client";

import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

// Theme colors
const COLORS = [
    "#10b981", // Success green
    "#3b82f6", // Blue
    "#f59e0b", // Warning yellow
    "#ef4444", // Danger red
    "#8b5cf6", // Purple
    "#ec4899", // Pink
];

interface BaseChartProps {
    data: any[];
    height?: number;
    className?: string;
}

interface AreaChartProps extends BaseChartProps {
    categories: string[];
    index: string;
    colors?: string[];
    showLegend?: boolean;
}

export function SimpleAreaChart({
    data,
    categories,
    index,
    colors = COLORS,
    height = 300,
    showLegend = true,
    className,
}: AreaChartProps) {
    return (
        <div className={cn("w-full", className)} style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        {categories.map((category, i) => (
                            <linearGradient
                                key={category}
                                id={`color-${category}`}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis
                        dataKey={index}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                        tickFormatter={(value) =>
                            new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short" }).format(value)
                        }
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--background)",
                            borderColor: "var(--border)",
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                        itemStyle={{ color: "var(--foreground)" }}
                        labelStyle={{ color: "var(--muted-foreground)", marginBottom: "4px" }}
                    />
                    {showLegend && <Legend verticalAlign="top" height={36} iconType="circle" />}
                    {categories.map((category, i) => (
                        <Area
                            key={category}
                            type="monotone"
                            dataKey={category}
                            stroke={colors[i % colors.length]}
                            fillOpacity={1}
                            fill={`url(#color-${category})`}
                            strokeWidth={2}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

interface BarChartProps extends BaseChartProps {
    categories: string[];
    index: string;
    colors?: string[];
    layout?: "vertical" | "horizontal";
    stack?: boolean;
}

export function SimpleBarChart({
    data,
    categories,
    index,
    colors = COLORS,
    height = 300,
    layout = "horizontal",
    stack = false,
    className,
}: BarChartProps) {
    return (
        <div className={cn("w-full", className)} style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    layout={layout}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                    <XAxis
                        dataKey={layout === "horizontal" ? index : undefined}
                        type={layout === "horizontal" ? "category" : "number"}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                        dy={10}
                        hide={layout === "vertical"}
                    />
                    <YAxis
                        dataKey={layout === "vertical" ? index : undefined}
                        type={layout === "vertical" ? "category" : "number"}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                        width={layout === "vertical" ? 100 : 40}
                        tickFormatter={(value) =>
                            typeof value === "number"
                                ? new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short" }).format(value)
                                : value
                        }
                    />
                    <Tooltip
                        cursor={{ fill: "var(--accent)", opacity: 0.2 }}
                        contentStyle={{
                            backgroundColor: "var(--background)",
                            borderColor: "var(--border)",
                            borderRadius: "8px",
                        }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {categories.map((category, i) => (
                        <Bar
                            key={category}
                            dataKey={category}
                            fill={colors[i % colors.length]}
                            radius={[4, 4, 0, 0]}
                            stackId={stack ? "a" : undefined}
                            barSize={layout === "vertical" ? 20 : undefined}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
