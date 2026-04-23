"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceTabs } from "@/lib/stores/workspace-tabs";
import { useKeepAlive } from "./keep-alive";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const QUICK_LINKS = [
    { label: "Operaciones", href: "/platform/operaciones" },
    { label: "Demandas", href: "/platform/demandas" },
    { label: "Cruces", href: "/platform/matching/cruces" },
    { label: "Colaboradores", href: "/platform/colaboradores" },
    { label: "Legal", href: "/platform/legal/contratos" },
    { label: "Smart Pricing", href: "/platform/pricing" },
] as const;

function labelFromPathname(pathname: string): string {
    const segment = pathname.split("/").filter(Boolean).pop() ?? "Inicio";
    const labels: Record<string, string> = {
        platform: "Inicio",
        operaciones: "Operaciones",
        demandas: "Demandas",
        matching: "Cruces",
        cruces: "Cruces",
        feedback: "Ciclo de Mejora",
        colaboradores: "Colaboradores",
        ranking: "Clasificación",
        pricing: "Smart Pricing",
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
    const { tabs, activeTabId, openTab, closeTab, setActive } = useWorkspaceTabs();
    const { evict } = useKeepAlive();

    useEffect(() => {
        if (!pathname.startsWith("/platform")) return;

        const label = labelFromPathname(pathname);
        const isHome = pathname === "/platform" || pathname === "/platform/";

        if (isHome) {
            setActive("home");
        } else {
            openTab({ label, href: pathname, closable: true });
        }
    }, [pathname, openTab, setActive]);

    const handleTabClick = (tabId: string, href: string) => {
        setActive(tabId);
        router.push(href);
    };

    const handleClose = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        const tab = tabs.find((t) => t.id === tabId);
        if (tab) evict(tab.href);
        closeTab(tabId);
        if (activeTabId === tabId) {
            router.push("/platform");
        }
    };

    const handleQuickLink = (href: string) => {
        router.push(href);
    };

    return (
        <div
            className={cn(
                "fixed top-12 left-0 right-0 z-45 flex h-8 items-center border-b border-border bg-white dark:bg-card transition-all duration-300",
                sidebarCollapsed ? "pl-16" : "pl-64"
            )}
        >
            <div className="flex h-full flex-1 items-center overflow-x-auto px-1">
                {tabs.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => handleTabClick(tab.id, tab.href)}
                            className={cn(
                                "group relative flex h-full shrink-0 items-center gap-1.5 border-r border-border/40 px-3 text-xs font-medium transition-colors duration-150",
                                isActive
                                    ? "bg-background text-foreground"
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
                            className="flex h-full shrink-0 items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
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
        </div>
    );
}
