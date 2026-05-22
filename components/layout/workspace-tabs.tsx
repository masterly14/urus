"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizePlatformHref, useWorkspaceTabs } from "@/lib/stores/workspace-tabs";
import { useGlobalLoader } from "@/lib/hooks/use-global-loader";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const QUICK_LINKS = [
    { label: "Operaciones", href: "/platform/operaciones" },
    { label: "Demandas", href: "/platform/demandas" },
    { label: "Visitas", href: "/platform/visitas" },
    { label: "Conversaciones", href: "/platform/conversaciones" },
    { label: "Cruces", href: "/platform/matching/cruces" },
    { label: "Colaboradores", href: "/platform/colaboradores" },
    { label: "Legal", href: "/platform/legal/contratos" },
    { label: "Cartera interna", href: "/platform/pricing" },
] as const;

function labelFromPathname(pathname: string): string {
    const parts = pathname.split("/").filter(Boolean);
    const segment = parts.pop() ?? "Inicio";
    
    if (parts.length > 0 && parts[parts.length - 1] === "operaciones" && segment.length > 10) {
        return `Op. ${segment.slice(0, 6)}...`;
    }

    const labels: Record<string, string> = {
        platform: "Inicio",
        operaciones: "Operaciones",
        demandas: "Demandas",
        visitas: "Visitas",
        conversaciones: "Conversaciones",
        matching: "Cruces",
        cruces: "Cruces",
        feedback: "Ciclo de Mejora",
        colaboradores: "Colaboradores",
        ranking: "Clasificación",
        pricing: "Cartera interna",
        mercado: "Mercado",
        captacion: "Captación",
        coach: "Coach",
        metricas: "Métricas",
        legal: "Legal",
        contratos: "Contratos",
        plantillas: "Plantillas",
        documentos: "Documentos",
        bi: "BI",
        rendimiento: "Rendimiento",
        configuracion: "Configuración",
    };
    return labels[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function WorkspaceTabsBar({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const { startNavigation } = useGlobalLoader();
    const { tabs, activeTabId, openTab, closeTab, clearTabsKeepCurrent, setActive, isHrefAlreadyOpened } =
        useWorkspaceTabs();
    const scrollPositions = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        if (!pathname.startsWith("/platform")) return;

        const label = labelFromPathname(pathname);
        const isHome = pathname === "/platform" || pathname === "/platform/";

        if (isHome) {
            setActive("home");
        } else {
            openTab({ label, href: pathname, closable: true });
        }

        const saved = scrollPositions.current.get(pathname);
        if (saved != null) {
            requestAnimationFrame(() => window.scrollTo(0, saved));
        }
    }, [pathname, openTab, setActive]);

    const handleTabClick = (tabId: string, href: string) => {
        scrollPositions.current.set(pathname, window.scrollY);
        setActive(tabId);
        if (normalizePlatformHref(pathname) === normalizePlatformHref(href)) return;
        // La pestaña ya fue abierta: no mostrar loader global al volver.
        router.push(href);
    };

    const handleClose = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        closeTab(tabId);
        if (activeTabId === tabId) {
            router.push("/platform");
        }
    };

    const handleQuickLink = (href: string) => {
        const isSamePage = normalizePlatformHref(pathname) === normalizePlatformHref(href);
        if (!isSamePage && !isHrefAlreadyOpened(href)) {
            startNavigation(href);
        }
        router.push(href);
    };

    const handleClearTabs = () => {
        clearTabsKeepCurrent(pathname, labelFromPathname(pathname));
    };

    return (
        <div
            className={cn(
                "fixed top-12 right-0 z-45 flex h-8 items-center border-y border-l border-border bg-white dark:bg-card transition-all duration-300 rounded-tl-2xl",
                sidebarCollapsed ? "left-16" : "left-60"
            )}
        >
            <div className="flex h-full flex-1 items-center overflow-x-auto px-1.5">
                {tabs.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => handleTabClick(tab.id, tab.href)}
                            className={cn(
                                "group relative mx-0.5 flex h-full shrink-0 items-center gap-1.5 rounded-t-md px-4 text-xs font-medium transition-colors duration-150",
                                isActive
                                    ? "border border-border/70 border-b-background bg-background text-foreground"
                                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                            )}
                        >
                            <span className="max-w-[120px] truncate">{tab.label}</span>
                            {tab.closable && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => handleClose(e, tab.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleClose(e as unknown as React.MouseEvent, tab.id);
                                    }}
                                    className="ml-0.5 rounded-sm p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                                >
                                    <X className="h-3 w-3" />
                                </span>
                            )}
                            {isActive && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                            )}
                        </button>
                    );
                })}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="ml-1 flex h-full shrink-0 items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        {QUICK_LINKS.map((link) => (
                            <DropdownMenuItem
                                key={link.href}
                                onClick={() => handleQuickLink(link.href)}
                                className="text-xs"
                            >
                                {link.label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <button
                type="button"
                onClick={handleClearTabs}
                className="flex h-full shrink-0 items-center border-l border-border/60 bg-background/95 px-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                aria-label="Limpiar pestañas"
                title="Limpiar pestañas"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
