"use client";

import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

interface ChatBubbleProps {
    message: string;
    sender: "user" | "bot";
    timestamp: string;
    isNew?: boolean;
}

export function ChatBubble({ message, sender, timestamp, isNew = false }: ChatBubbleProps) {
    const isBot = sender === "bot";

    return (
        <div
            className={cn(
                "flex gap-2.5 max-w-[85%]",
                isBot ? "self-start" : "self-end flex-row-reverse",
                isNew && "animate-slide-in-right"
            )}
        >
            {/* Avatar */}
            <div
                className={cn(
                    "shrink-0 rounded-full h-8 w-8 flex items-center justify-center",
                    isBot
                        ? "bg-gradient-to-br from-[var(--urus-info)]/30 to-[var(--urus-info)]/10 text-[var(--urus-info)]"
                        : "bg-gradient-to-br from-secondary/30 to-secondary/10 text-secondary"
                )}
            >
                {isBot ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>

            {/* Bubble */}
            <div
                className={cn(
                    "rounded-2xl px-4 py-2.5 space-y-1 relative",
                    isBot
                        ? "bg-accent/40 border border-border/50 rounded-tl-sm"
                        : "bg-gradient-to-br from-primary/80 to-primary/60 text-primary-foreground rounded-tr-sm"
                )}
            >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
                <p
                    className={cn(
                        "text-[10px]",
                        isBot ? "text-muted-foreground" : "text-primary-foreground/60"
                    )}
                >
                    {timestamp}
                </p>
            </div>
        </div>
    );
}

// Typing indicator (animated dots)
export function TypingIndicator() {
    return (
        <div className="flex gap-2.5 self-start max-w-[85%] animate-fade-in">
            <div className="shrink-0 rounded-full h-8 w-8 flex items-center justify-center bg-gradient-to-br from-[var(--urus-info)]/30 to-[var(--urus-info)]/10 text-[var(--urus-info)]">
                <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-5 py-3.5 bg-accent/40 border border-border/50 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
        </div>
    );
}
