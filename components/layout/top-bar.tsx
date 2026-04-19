"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bell, Search, LogOut, Settings, User } from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";
import { signOut } from "@/lib/auth/client";
import { MAX_NOTIFICATIONS, useNotifications } from "@/lib/hooks/use-notifications";
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

function getInitials(name: string): string {
    return name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
    ceo: "CEO",
    admin: "Administrador",
    comercial: "Comercial",
};

export function TopBar({ logoSrc }: { logoSrc?: string }) {
    const router = useRouter();
    const { session, isCeo, isCeoOrAdmin } = useSession();
    const { notifications, unreadCount, markAsRead, markAllRead, connected } = useNotifications();

    const handleLogout = async () => {
        await signOut();
        router.push("/login");
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border/50 bg-card/80 px-4 backdrop-blur-xl">
            {/* Logo */}
            <div className="flex min-w-0 shrink-0 items-center gap-3">
                {logoSrc ? (
                    <Image
                        src={logoSrc}
                        alt="Urus Capital Group"
                        width={140}
                        height={48}
                        priority
                        className="h-11 w-auto max-w-[min(40vw,180px)] object-contain object-left"
                    />
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--urus-gold)] to-[var(--urus-gold)]/70">
                            <span className="text-sm font-bold text-background">U</span>
                        </div>
                        <span className="text-lg font-semibold tracking-tight">
                            URUS <span className="text-[var(--urus-gold)]">Capital</span>
                        </span>
                    </div>
                )}
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
                {/* Role badge */}
                <Badge variant="outline" className="text-xs font-medium px-2 py-0.5">
                    {ROLE_LABELS[session.role] ?? session.role}
                </Badge>

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
                            <span
                                className={cn(
                                    "absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-card",
                                    connected ? "bg-emerald-500" : "bg-muted-foreground/40",
                                )}
                                title={connected ? "Conectado en tiempo real" : "Desconectado"}
                            />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-96 p-0">
                        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                            <h3 className="text-sm font-semibold">Notificaciones</h3>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={markAllRead}
                                className="h-auto shrink-0 px-2 py-1 text-xs font-medium text-foreground/90 hover:bg-accent hover:text-foreground"
                            >
                                Marcar todas como leídas
                            </Button>
                        </div>
                        <ScrollArea className="h-80">
                            <div className="divide-y divide-border/40">
                                {notifications.length === 0 ? (
                                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                                        No hay notificaciones recientes
                                    </p>
                                ) : (
                                    notifications.slice(0, MAX_NOTIFICATIONS).map((notif) => (
                                        <Button
                                            key={notif.id}
                                            type="button"
                                            variant="ghost"
                                            onClick={() => markAsRead(notif.id)}
                                            className={cn(
                                                "flex h-auto min-h-0 w-full shrink-0 items-start justify-start gap-3 rounded-none px-4 py-3.5 text-left font-normal whitespace-normal transition-colors",
                                                "hover:bg-accent/50 focus-visible:bg-accent/50",
                                                !notif.read && "bg-accent/25"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                                                    severityColors[notif.severity]
                                                )}
                                                aria-hidden
                                            />
                                            <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
                                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                    <span className="text-sm font-semibold leading-snug text-foreground">
                                                        {notif.title}
                                                    </span>
                                                    <Badge
                                                        variant="secondary"
                                                        className="h-5 shrink-0 border border-border/60 px-2 text-[10px] font-medium"
                                                    >
                                                        {sourceLabels[notif.source] || notif.source}
                                                    </Badge>
                                                </div>
                                                <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
                                                    {notif.description}
                                                </p>
                                                <p className="text-[11px] tabular-nums text-muted-foreground">
                                                    {timeAgo(notif.timestamp)}
                                                </p>
                                            </div>
                                        </Button>
                                    ))
                                )}
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
                                    {getInitials(session.nombre || "U")}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <div className="px-3 py-2">
                            <p className="text-sm font-medium">{session.nombre}</p>
                            <p className="text-xs text-muted-foreground">{ROLE_LABELS[session.role] ?? session.role}</p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <User className="mr-2 h-4 w-4" /> Perfil
                        </DropdownMenuItem>
                        {isCeoOrAdmin && (
                            <DropdownMenuItem onClick={() => router.push("/platform/configuracion")}>
                                <Settings className="mr-2 h-4 w-4" /> Configuración
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
