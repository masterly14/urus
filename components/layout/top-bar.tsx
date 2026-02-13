"use client";

import { Bell, Search, LogOut, Settings, User } from "lucide-react";
import { useRole } from "@/lib/hooks/use-role";
import { useNotifications } from "@/lib/hooks/use-notifications";
import { ModeToggle } from "@/components/mode-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const severityColors: Record<string, string> = {
    critical: "bg-[var(--urus-danger)]",
    warning: "bg-[var(--urus-warning)]",
    info: "bg-[var(--urus-info)]",
};

const sourceLabels: Record<string, string> = {
    "post-venta": "Post-Venta",
    colaboradores: "Colaboradores",
    matching: "Matching",
    pricing: "Pricing",
    legal: "Legal",
    bi: "BI",
    rendimiento: "Rendimiento",
    coach: "Coach",
};

function timeAgo(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    return `hace ${Math.floor(hours / 24)}d`;
}

export function TopBar() {
    const { role, setRole } = useRole();
    const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();

    return (
        <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border/50 bg-card/80 px-4 backdrop-blur-xl">
            {/* Logo */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--urus-gold)] to-[var(--urus-gold)]/70 flex items-center justify-center">
                        <span className="text-sm font-bold text-background">U</span>
                    </div>
                    <span className="text-lg font-semibold tracking-tight">
                        URUS <span className="text-[var(--urus-gold)]">Capital</span>
                    </span>
                </div>
            </div>

            {/* Center: Search */}
            <div className="hidden md:flex items-center max-w-md flex-1 mx-8">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar propiedades, comerciales, operaciones..."
                        className="h-9 w-full rounded-lg border border-border/50 bg-accent/30 pl-9 pr-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-secondary/50 transition-all"
                    />
                </div>
            </div>

            {/* Right section */}
            <div className="flex items-center gap-3">
                {/* Role Selector */}
                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "ceo" | "comercial")}
                    className="h-8 rounded-md border border-border/50 bg-accent/30 px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-secondary/50"
                >
                    <option value="ceo">👔 CEO</option>
                    <option value="comercial">🏠 Comercial</option>
                </select>

                {/* Mode Toggle */}
                <ModeToggle />

                {/* Notifications */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative h-9 w-9">
                            <Bell className="h-5 w-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--urus-danger)] px-1 text-[10px] font-bold text-white animate-pulse">
                                    {unreadCount}
                                </span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-96 p-0">
                        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                            <h3 className="text-sm font-semibold">Notificaciones</h3>
                            <Button
                                onClick={markAllRead}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Marcar todas como leídas
                            </Button>
                        </div>
                        <ScrollArea className="h-80">
                            <div className="divide-y divide-border/30">
                                {notifications.slice(0, 15).map((notif) => (
                                    <Button
                                        key={notif.id}
                                        onClick={() => markAsRead(notif.id)}
                                        className={cn(
                                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40",
                                            !notif.read && "bg-accent/20"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "mt-1 h-2 w-2 shrink-0 rounded-full",
                                                severityColors[notif.severity]
                                            )}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold truncate">{notif.title}</span>
                                                <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0">
                                                    {sourceLabels[notif.source] || notif.source}
                                                </Badge>
                                            </div>
                                            <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                                {notif.description}
                                            </p>
                                            <p className="mt-1 text-[10px] text-muted-foreground/60">
                                                {timeAgo(notif.timestamp)}
                                            </p>
                                        </div>
                                    </Button>
                                ))}
                            </div>
                        </ScrollArea>
                    </PopoverContent>
                </Popover>

                {/* Avatar */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
                            <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-gradient-to-br from-[var(--urus-gold)] to-[var(--urus-gold)]/70 text-background text-xs font-bold">
                                    MC
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <div className="px-3 py-2">
                            <p className="text-sm font-medium">Miguel CEO</p>
                            <p className="text-xs text-muted-foreground">miguel@uruscapital.es</p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <User className="mr-2 h-4 w-4" /> Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Settings className="mr-2 h-4 w-4" /> Configuración
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
