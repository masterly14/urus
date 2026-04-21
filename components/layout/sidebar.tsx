"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/hooks/use-session";
import {
    LayoutDashboard,
    Brain,
    MessageCircle,
    BarChart3,
    Package,
    GitBranch,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { Button } from "@base-ui/react";

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    ceoOnly?: boolean;
    children?: {
        label: string;
        href: string;
        icon: React.ElementType;
        ceoOnly?: boolean;
    }[];
}

const navItems: NavItem[] = [
    { label: "Panel", href: "/platform", icon: LayoutDashboard },
    {
        label: "Captación",
        href: "/platform/captacion",
        icon: ClipboardList,
    },
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
        label: "Demandas",
        href: "/platform/demandas",
        icon: Users2,
    },
    {
        label: "Cruces",
        href: "/platform/matching",
        icon: Shuffle,
        children: [
            { label: "Cruces Automáticos", href: "/platform/matching/cruces", icon: Shuffle },
            { label: "Ciclo de Mejora", href: "/platform/matching/feedback", icon: MessageSquare },
        ],
    },
    {
        label: "Post-Venta",
        href: "/platform/post-venta",
        icon: Package,
        children: [
            { label: "Seguimiento", href: "/platform/post-venta/pipeline", icon: GitBranch },
        ],
    },
    {
        label: "Coach Emocional",
        href: "/platform/coach",
        icon: Brain,
        children: [
            { label: "Panel", href: "/platform/coach", icon: BarChart3 },
            { label: "Métricas", href: "/platform/coach/metricas", icon: BarChart3 },
        ],
    },
    {
        label: "Smart Pricing",
        href: "/platform/pricing",
        icon: DollarSign,
        children: [
            { label: "Semáforo General", href: "/platform/pricing", icon: TrendingUp },
            { label: "Mercado", href: "/platform/pricing/mercado", icon: ShoppingBag },
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
];

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const { isCeo, isCeoOrAdmin } = useSession();
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

    const filteredItems = navItems.filter((item) => !item.ceoOnly || isCeoOrAdmin);

    return (
        <aside
            className={cn(
                "fixed left-0 top-16 bottom-0 z-40 flex flex-col border-r border-border/50 bg-card/80 backdrop-blur-xl transition-all duration-300",
                collapsed ? "w-16" : "w-64"
            )}
        >
            <div className="border-b border-border/50 p-2">
                <Button
                    onClick={onToggle}
                    className={cn(
                        "flex w-full items-center rounded-lg px-3 py-2.5 text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground",
                        collapsed ? "justify-center" : "justify-between"
                    )}
                    aria-label={collapsed ? "Expandir sidebar" : "Contraer sidebar"}
                >
                    {collapsed ? (
                        <PanelLeftOpen className="h-5 w-5" />
                    ) : (
                        <>
                            <span className="text-sm font-medium">Contraer menú</span>
                            <PanelLeftClose className="h-5 w-5" />
                        </>
                    )}
                </Button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                {filteredItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    const hasChildren = item.children && item.children.length > 0;
                    const isExpanded = expandedSections.has(item.label);
                    const filteredChildren = item.children?.filter((c) => !("ceoOnly" in c) || isCeoOrAdmin);

                    if (collapsed) {
                        return (
                            <Tooltip key={item.label}>
                                <TooltipTrigger asChild>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex items-center justify-center rounded-lg p-3 transition-all duration-200 hover:bg-accent/80 relative group",
                                            active && "bg-primary/10 text-primary dark:bg-accent dark:text-secondary"
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
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
                                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-accent/80",
                                        active && "bg-primary/10 text-primary dark:bg-accent/60 dark:text-secondary"
                                    )}
                                >
                                    <Icon className="h-5 w-5 shrink-0" />
                                    <span className="flex-1 text-left truncate">{item.label}</span>
                                    <ChevronDown
                                        className={cn(
                                            "h-4 w-4 shrink-0 transition-transform duration-200",
                                            isExpanded && "rotate-180"
                                        )}
                                    />
                                </Button>
                            ) : (
                                <Link
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-accent/80",
                                        active && "bg-primary/10 text-primary dark:bg-accent dark:text-secondary"
                                    )}
                                >
                                    <Icon className="h-5 w-5 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </Link>
                            )}

                            {/* Children */}
                            {hasChildren && isExpanded && (
                                <div className="ml-4 mt-1 space-y-0.5 border-l border-border/30 pl-3">
                                    {filteredChildren?.map((child) => {
                                        const ChildIcon = child.icon;
                                        const childActive = pathname === child.href;
                                        return (
                                            <Link
                                                key={child.href}
                                                href={child.href}
                                                className={cn(
                                                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-all duration-200 hover:bg-accent/60 text-muted-foreground hover:text-foreground",
                                                    childActive && "bg-primary/10 text-primary font-medium dark:bg-accent/40 dark:text-secondary"
                                                )}
                                            >
                                                <ChildIcon className="h-4 w-4 shrink-0" />
                                                <span className="truncate">{child.label}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

        </aside>
    );
}
