interface SparklineChartProps {
    data: number[];
    color?: string;
    width?: number;
    height?: number;
    className?: string;
}

export function SparklineChart({
    data,
    color = "var(--urus-gold)",
    width = 120,
    height = 32,
    className,
}: SparklineChartProps) {
    if (!data.length) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;

    const points = data.map((value, index) => {
        const x = padding + (index / (data.length - 1)) * (width - padding * 2);
        const y = height - padding - ((value - min) / range) * (height - padding * 2);
        return `${x},${y}`;
    });

    const pathD = `M ${points.join(" L ")}`;

    // Area fill
    const areaD = `${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

    return (
        <svg
            width={width}
            height={height}
            className={className}
            viewBox={`0 0 ${width} ${height}`}
        >
            <defs>
                <linearGradient id={`sparkGrad-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path
                d={areaD}
                fill={`url(#sparkGrad-${color.replace(/[^a-z0-9]/gi, "")})`}
            />
            <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Last point dot */}
            <circle
                cx={parseFloat(points[points.length - 1].split(",")[0])}
                cy={parseFloat(points[points.length - 1].split(",")[1])}
                r="2.5"
                fill={color}
            />
        </svg>
    );
}
