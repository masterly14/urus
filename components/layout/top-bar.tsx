"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronLeft, ChevronRight, ExternalLink, LogOut, Settings, User } from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";
import { signOut } from "@/lib/auth/client";
import { useNotifications } from "@/lib/hooks/use-notifications";
import type { AppNotification } from "@/lib/mock-data/types";
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
import { useGlobalLoader } from "@/lib/hooks/use-global-loader";
import { TopBarBranding } from "@/components/layout/top-bar-branding";
import { normalizePlatformHref, useWorkspaceTabs } from "@/lib/stores/workspace-tabs";

const severityColors: Record<string, string> = {
    critical: "bg-[var(--urus-danger)]",
    warning: "bg-[var(--urus-warning)]",
    info: "bg-[var(--urus-info)]",
};

const sourceLabels: Record<string, string> = {
    "post-venta": "Operaciones",
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

const NOTIFICATIONS_PER_PAGE = 8;

function extractFromDescription(description: string, pattern: RegExp): string | null {
    const match = description.match(pattern);
    if (!match?.[1]) return null;
    return match[1].trim();
}

function getNotificationHref(notification: AppNotification): string | null {
    const operationId = extractFromDescription(notification.description, /Operaci[oó]n\s+([A-Za-z0-9_-]+)/i);
    const propertyCode = extractFromDescription(notification.description, /Propiedad\s+([A-Za-z0-9_-]+)/i);

    switch (notification.eventType) {
        case "PRICING_ANALISIS_GENERADO":
        case "PRICING_ANALISIS_FALLIDO":
            return propertyCode
                ? `/platform/pricing/informe/${encodeURIComponent(propertyCode)}`
                : "/platform/pricing";
        case "CONTRATO_BORRADOR_GENERADO":
        case "CONTRATO_APROBADO":
        case "CONTRATO_VERSIONADO":
        case "FIRMA_ENVIADA":
        case "FIRMA_COMPLETADA":
        case "FIRMA_RECHAZADA":
        case "FIRMA_SLA_ESCALADO":
            return operationId
                ? `/platform/legal/contratos/${encodeURIComponent(operationId)}`
                : "/platform/legal/contratos";
        case "OPERACION_CERRADA":
        case "INCIDENCIA_POSTVENTA_ABIERTA":
            return operationId
                ? `/platform/operaciones?search=${encodeURIComponent(operationId)}`
                : "/platform/operaciones";
        case "COLABORADOR_SLA_BREACH":
            return "/platform/colaboradores";
        case "CEO_DIAGNOSTICO_GENERADO":
            return "/platform/bi/prescriptivo";
        case "CEO_FINANZAS_GENERADA":
            return "/platform/bi/reinversion";
    }

    if (notification.source === "consumer:whatsapp") {
        return "/platform/demandas";
    }

    if (/whatsapp/i.test(`${notification.title} ${notification.description}`)) {
        return "/platform/demandas";
    }

    const sourceFallbackMap: Record<string, string> = {
        "post-venta": "/platform/operaciones",
        colaboradores: "/platform/colaboradores",
        matching: "/platform/matching/cruces",
        pricing: "/platform/pricing",
        legal: "/platform/legal/contratos",
        bi: "/platform/bi",
        rendimiento: "/platform/rendimiento/alertas",
        coach: "/platform/coach",
    };

    return sourceFallbackMap[notification.source] ?? null;
}

function shouldShowNavigationLoader(
    pathname: string,
    href: string,
    isHrefAlreadyOpened: (href: string) => boolean,
): boolean {
    if (!href.startsWith("/platform")) return false;
    if (normalizePlatformHref(pathname) === normalizePlatformHref(href)) return false;
    return !isHrefAlreadyOpened(href);
}

export function TopBar() {
    const router = useRouter();
    const pathname = usePathname();
    const { startNavigation } = useGlobalLoader();
    const { isHrefAlreadyOpened } = useWorkspaceTabs();
    const { session, isCeoOrAdmin } = useSession();
    const { notifications, unreadCount, markAsRead, markAllRead, connected } = useNotifications();
    const [currentPage, setCurrentPage] = useState(1);

    const totalPages = Math.max(1, Math.ceil(notifications.length / NOTIFICATIONS_PER_PAGE));

    const paginatedNotifications = useMemo(() => {
        const start = (currentPage - 1) * NOTIFICATIONS_PER_PAGE;
        const end = start + NOTIFICATIONS_PER_PAGE;
        return notifications.slice(start, end);
    }, [currentPage, notifications]);

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const handleLogout = async () => {
        await signOut();
        router.push("/login");
    };

    const handleNotificationClick = (notification: AppNotification) => {
        void markAsRead(notification.id);
        const href = getNotificationHref(notification);
        if (href) {
            if (shouldShowNavigationLoader(pathname, href, isHrefAlreadyOpened)) {
                startNavigation(href);
            }
            router.push(href);
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center justify-between border-b border-border bg-white dark:bg-card px-4">
            <TopBarBranding />

            {/* Right section */}
            <div className="flex items-center gap-3">
                {/* Role badge */}
                <Badge variant="outline" className="text-xs font-medium px-2 py-0.5">
                    {ROLE_LABELS[session.role] ?? session.role}
                </Badge>

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
                                    paginatedNotifications.map((notif) => (
                                        <Button
                                            key={notif.id}
                                            type="button"
                                            variant="ghost"
                                            onClick={() => handleNotificationClick(notif)}
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
                                                {getNotificationHref(notif) && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                                                        <ExternalLink className="h-3 w-3" />
                                                        Abrir detalle
                                                    </span>
                                                )}
                                                <p className="text-[11px] tabular-nums text-muted-foreground">
                                                    {timeAgo(notif.timestamp)}
                                                </p>
                                            </div>
                                        </Button>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                        {notifications.length > 0 && (
                            <div className="flex items-center justify-between border-t border-border/50 px-4 py-2.5">
                                <p className="text-[11px] text-muted-foreground">
                                    Página {currentPage} de {totalPages}
                                </p>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="h-7 px-2"
                                        aria-label="Página anterior"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="h-7 px-2"
                                        aria-label="Página siguiente"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
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
                            <DropdownMenuItem
                                onClick={() => {
                                    const href = "/platform/configuracion";
                                    if (shouldShowNavigationLoader(pathname, href, isHrefAlreadyOpened)) {
                                        startNavigation(href);
                                    }
                                    router.push(href);
                                }}
                            >
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
