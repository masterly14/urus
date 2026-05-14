"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/hooks/use-session";
import {
    LayoutDashboard,
    Brain,
    BarChart3,
    Users,
    Trophy,
    Shuffle,
    MessageSquare,
    DollarSign,
    TrendingUp,
    ShoppingBag,
    FileText,
    FileSignature,
    PieChart,
    Wallet,
    UserCheck,
    Target,
    Rocket,
    Banknote,
    Award,
    UsersRound,
    AlertTriangle,
    Settings,
    ChevronDown,
    Users2,
    Folder,
    FlaskConical,
    CalendarCheck,
    Sparkles,
    MessagesSquare,
    ClipboardList,
    PanelLeftClose,
    PanelLeftOpen,
    LayoutTemplate,
    Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Button } from "@base-ui/react";

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    badge?: string;
    ceoOnly?: boolean;
    children?: {
        label: string;
        href: string;
        icon: React.ElementType;
        ceoOnly?: boolean;
    }[];
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

const navGroups: NavGroup[] = [
    {
        label: "Navegación",
        items: [
            { label: "Panel", href: "/platform", icon: LayoutDashboard },
            { label: "Demandas", href: "/platform/demandas", icon: Users2 },
            { label: "Visitas", href: "/platform/visitas", icon: CalendarCheck },
            { label: "Operaciones", href: "/platform/operaciones", icon: Briefcase },
            { label: "Conversaciones", href: "/platform/conversaciones", icon: MessageSquare },
        ],
    },
    {
        label: "Procesos IA",
        items: [
            {
                label: "Captación",
                href: "/platform/captacion",
                icon: ClipboardList,
                children: [
                    {
                        label: "Oportunidades de mercado",
                        href: "/platform/captacion/oportunidades",
                        icon: Target,
                    },
                ],
            },
            {
                label: "Cruces Automáticos",
                href: "/platform/matching/cruces",
                icon: Shuffle,
                badge: "IA",
            },
            {
                label: "Análisis de mercado",
                href: "/platform/pricing",
                icon: DollarSign,
                badge: "IA",
                children: [
                    { label: "Semáforo General", href: "/platform/pricing", icon: TrendingUp },
                    { label: "Mercado", href: "/platform/pricing/mercado", icon: ShoppingBag },
                ],
            },
            {
                label: "Coach Emocional",
                href: "/platform/coach",
                icon: Brain,
                badge: "IA",
                children: [
                    { label: "Panel", href: "/platform/coach", icon: BarChart3 },
                    { label: "Métricas", href: "/platform/coach/metricas", icon: BarChart3 },
                ],
            },
        ],
    },
    {
        label: "Herramientas",
        items: [
            {
                label: "Colaboradores",
                href: "/platform/colaboradores",
                icon: Users,
                children: [
                    { label: "Vista General", href: "/platform/colaboradores", icon: Users },
                    { label: "Clasificación", href: "/platform/colaboradores/ranking", icon: Trophy },
                ],
            },
            {
                label: "Legal",
                href: "/platform/legal",
                icon: FileText,
                children: [
                    { label: "Contratos", href: "/platform/legal/contratos", icon: FileSignature },
                    { label: "Plantillas", href: "/platform/legal/plantillas", icon: LayoutTemplate, ceoOnly: true },
                    { label: "Documentos", href: "/platform/legal/documentos", icon: Folder },
                ],
            },
        ],
    },
    {
        label: "Análisis",
        items: [
            {
                label: "Inteligencia de Negocio",
                href: "/platform/bi",
                icon: PieChart,
                ceoOnly: true,
                children: [
                    { label: "Financiero", href: "/platform/bi/reinversion", icon: Wallet },
                    { label: "Operativo", href: "/platform/bi/operativo", icon: UserCheck },
                    { label: "Capital Humano", href: "/platform/bi/capital-humano", icon: Users },
                    { label: "Diagnóstico Estratégico", href: "/platform/bi/prescriptivo", icon: Target },
                    { label: "Expansión", href: "/platform/bi/expansion", icon: Rocket },
                    { label: "Reinversión", href: "/platform/bi/reinversion", icon: Banknote },
                ],
            },
            {
                label: "Rendimiento",
                href: "/platform/rendimiento",
                icon: Award,
                children: [
                    { label: "Equipo", href: "/platform/rendimiento/equipo", icon: UsersRound },
                    { label: "Comerciales", href: "/platform/rendimiento/comerciales", icon: TrendingUp },
                    { label: "Alertas", href: "/platform/rendimiento/alertas", icon: AlertTriangle, ceoOnly: true },
                ],
            },
        ],
    },
    {
        label: "Admin",
        items: [
            {
                label: "Banco de Pruebas",
                href: "/platform/test-nlu-microsite",
                icon: FlaskConical,
                ceoOnly: true,
                children: [
                    { label: "Prueba de Asistente", href: "/platform/test-nlu-microsite", icon: Sparkles },
                    { label: "Chat con Agente", href: "/platform/chat-agente", icon: MessagesSquare },
                    { label: "Visita Agendada", href: "/platform/test-visit", icon: CalendarCheck },
                ],
            },
            { label: "Configuración", href: "/platform/configuracion", icon: Settings },
        ],
    },
];

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const { isCeoOrAdmin } = useSession();
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    const toggleSection = (label: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    const isActive = (href: string) => {
        if (href === "/platform") {
            return pathname === "/platform" || pathname === "/platform/";
        }
        return pathname === href || pathname.startsWith(`${href}/`);
    };

    const filterItem = (item: NavItem) => !item.ceoOnly || isCeoOrAdmin;

    return (
        <aside
            className={cn(
                "fixed left-0 top-12 bottom-0 z-40 flex flex-col border-r border-border bg-white dark:bg-card transition-all duration-300",
                collapsed ? "w-16" : "w-64"
            )}
        >
            <div className="-mt-px border-b border-border p-2">
                <Button
                    onClick={onToggle}
                    className={cn(
                        "flex w-full items-center rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                        collapsed ? "justify-center" : "justify-between"
                    )}
                    aria-label={collapsed ? "Expandir sidebar" : "Contraer sidebar"}
                >
                    {collapsed ? (
                        <PanelLeftOpen className="h-4 w-4" />
                    ) : (
                        <>
                            <span className="text-xs font-medium">Contraer menú</span>
                            <PanelLeftClose className="h-4 w-4" />
                        </>
                    )}
                </Button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2.5 pb-3 pt-0">
                {navGroups.map((group) => {
                    const visibleItems = group.items.filter(filterItem);
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={group.label} className="mb-5">
                            {!collapsed && (
                                <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    {group.label}
                                </p>
                            )}
                            <div className="space-y-1.5">
                                {visibleItems.map((item) => {
                                    const Icon = item.icon;
                                    const active = isActive(item.href);
                                    const hasChildren = item.children && item.children.length > 0;
                                    const isExpanded = expandedSections.has(item.label);
                                    const filteredChildren = item.children?.filter(
                                        (c) => !("ceoOnly" in c) || isCeoOrAdmin
                                    );

                                    if (collapsed) {
                                        return (
                                            <Tooltip key={item.label}>
                                                <TooltipTrigger asChild>
                                                    <Link
                                                        href={item.href}
                                                        className={cn(
                                                            "flex items-center justify-center rounded-md p-2 transition-colors duration-150 hover:bg-muted/60 relative",
                                                            active && "bg-primary/10 text-primary dark:bg-accent dark:text-secondary"
                                                        )}
                                                    >
                                                        <Icon className="h-4 w-4" />
                                                    </Link>
                                                </TooltipTrigger>
                                                <TooltipContent side="right">{item.label}</TooltipContent>
                                            </Tooltip>
                                        );
                                    }

                                    return (
                                        <div key={item.label}>
                                            {hasChildren ? (
                                                <Button
                                                    onClick={() => toggleSection(item.label)}
                                                    className={cn(
                                                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 hover:bg-muted/60",
                                                        active && "bg-primary/10 text-primary dark:bg-accent/60 dark:text-secondary"
                                                    )}
                                                >
                                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="flex-1 text-left truncate">{item.label}</span>
                                                    {item.badge && (
                                                        <Badge variant="ai" className="ml-auto text-[10px] h-4 px-1.5">
                                                            {item.badge}
                                                        </Badge>
                                                    )}
                                                    <ChevronDown
                                                        className={cn(
                                                            "h-3 w-3 shrink-0 transition-transform duration-200",
                                                            isExpanded && "rotate-180"
                                                        )}
                                                    />
                                                </Button>
                                            ) : (
                                                <Link
                                                    href={item.href}
                                                    className={cn(
                                                        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 hover:bg-muted/60",
                                                        active && "bg-primary/10 text-primary dark:bg-accent dark:text-secondary"
                                                    )}
                                                >
                                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{item.label}</span>
                                                    {item.badge && (
                                                        <Badge variant="ai" className="ml-auto text-[10px] h-4 px-1.5">
                                                            {item.badge}
                                                        </Badge>
                                                    )}
                                                </Link>
                                            )}

                                            {hasChildren && isExpanded && (
                                                <div className="ml-3 mt-1.5 space-y-1 border-l border-border/40 pl-2.5">
                                                    {filteredChildren?.map((child) => {
                                                        const ChildIcon = child.icon;
                                                        const childActive = pathname === child.href;
                                                        return (
                                                            <Link
                                                                key={child.href}
                                                                href={child.href}
                                                                className={cn(
                                                                    "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors duration-150 hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                                                                    childActive && "bg-primary/10 text-primary font-medium dark:bg-accent/40 dark:text-secondary"
                                                                )}
                                                            >
                                                                <ChildIcon className="h-3 w-3 shrink-0" />
                                                                <span className="truncate">{child.label}</span>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>
        </aside>
    );
}
