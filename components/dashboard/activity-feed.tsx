"use client";

import { useEffect, useRef, useState } from "react";
import type { ActivityEvent } from "@/lib/mock-data/types";
import { cn } from "@/lib/utils";
import {
    CheckCircle2,
    AlertTriangle,
    Info,
    XCircle,
    Shuffle,
    FileText,
    DollarSign,
    Users,
    MessageCircle,
    Award,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
    check: CheckCircle2,
    alert: AlertTriangle,
    info: Info,
    error: XCircle,
    match: Shuffle,
    contract: FileText,
    price: DollarSign,
    team: Users,
    chat: MessageCircle,
    award: Award,
};

const typeColors = {
    success: "text-[var(--urus-success)]",
    info: "text-[var(--urus-info)]",
    warning: "text-[var(--urus-warning)]",
    danger: "text-[var(--urus-danger)]",
};

function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

interface ActivityFeedProps {
    events: ActivityEvent[];
    maxItems?: number;
}

export function ActivityFeed({ events, maxItems = 8 }: ActivityFeedProps) {
    const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
    const prevIdsRef = useRef<Set<string>>(new Set(events.map((e) => e.id)));

    useEffect(() => {
        const prevIds = prevIdsRef.current;
        const newIds = events.filter((e) => !prevIds.has(e.id)).map((e) => e.id);
        if (newIds.length > 0) {
            setAnimatingIds(new Set(newIds));
            const timer = setTimeout(() => setAnimatingIds(new Set()), 600);
            return () => clearTimeout(timer);
        }
        prevIdsRef.current = new Set(events.map((e) => e.id));
    }, [events]);

    return (
        <div className="space-y-1">
            {events.slice(0, maxItems).map((event) => {
                const Icon = iconMap[event.icon] || Info;
                const isNew = animatingIds.has(event.id);

                return (
                    <div
                        key={event.id}
                        className={cn(
                            "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-all duration-300",
                            isNew && "animate-[slideInRight_0.4s_ease-out] bg-accent/30"
                        )}
                    >
                        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", typeColors[event.type])} />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm leading-snug truncate">{event.text}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                            {timeAgo(event.timestamp)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
