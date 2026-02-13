"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole } from "@/lib/hooks/use-role";
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
    LayoutTemplate,
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
    ChevronLeft,
    ChevronRight,
    ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { Button } from "@base-ui/react";

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    badge?: number;
    ceoOnly?: boolean;
    children?: { label: string; href: string; icon: React.ElementType }[];
}

const navItems: NavItem[] = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    {
        label: "Coach Emocional",
        href: "/coach",
        icon: Brain,
        children: [
            { label: "Dashboard", href: "/coach", icon: BarChart3 },
            { label: "Chat", href: "/coach/chat", icon: MessageCircle },
            { label: "Métricas", href: "/coach/metricas", icon: BarChart3 },
        ],
    },
    {
        label: "Post-Venta",
        href: "/post-venta",
        icon: Package,
        children: [
            { label: "Pipeline", href: "/post-venta/pipeline", icon: GitBranch },
        ],
    },
    {
        label: "Colaboradores",
        href: "/colaboradores",
        icon: Users,
        badge: 2,
        children: [
            { label: "Vista General", href: "/colaboradores", icon: Users },
            { label: "Rankings", href: "/colaboradores/ranking", icon: Trophy },
        ],
    },
    {
        label: "Matching",
        href: "/matching",
        icon: Shuffle,
        children: [
            { label: "Cruces Automáticos", href: "/matching/cruces", icon: Shuffle },
            { label: "Feedback Loop", href: "/matching/feedback", icon: MessageSquare },
        ],
    },
    {
        label: "Smart Pricing",
        href: "/pricing",
        icon: DollarSign,
        badge: 1,
        children: [
            { label: "Semáforo General", href: "/pricing", icon: TrendingUp },
            { label: "Mercado", href: "/pricing/mercado", icon: ShoppingBag },
        ],
    },
    {
        label: "Legal",
        href: "/legal",
        icon: FileText,
        children: [
            { label: "Contratos", href: "/legal/contratos", icon: FileSignature },
            { label: "Plantillas", href: "/legal/plantillas", icon: LayoutTemplate },
        ],
    },
    {
        label: "Business Intelligence",
        href: "/bi",
        icon: PieChart,
        ceoOnly: true,
        children: [
            { label: "Financiero", href: "/bi/financiero", icon: Wallet },
            { label: "Operativo", href: "/bi/operativo", icon: UserCheck },
            { label: "Capital Humano", href: "/bi/capital-humano", icon: Users },
            { label: "Prescriptivo", href: "/bi/prescriptivo", icon: Target },
            { label: "Expansión", href: "/bi/expansion", icon: Rocket },
            { label: "Reinversión", href: "/bi/reinversion", icon: Banknote },
        ],
    },
    {
        label: "Rendimiento",
        href: "/rendimiento",
        icon: Award,
        children: [
            { label: "Equipo", href: "/rendimiento/equipo", icon: UsersRound },
            { label: "Alertas", href: "/rendimiento/alertas", icon: AlertTriangle, ceoOnly: true },
        ],
    },
    { label: "Configuración", href: "/configuracion", icon: Settings },
];

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const { isCeo } = useRole();
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
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    };

    const filteredItems = navItems.filter((item) => !item.ceoOnly || isCeo);

    return (
        <aside
            className={cn(
                "fixed left-0 top-16 bottom-0 z-40 flex flex-col border-r border-border/50 bg-card/80 backdrop-blur-xl transition-all duration-300",
                collapsed ? "w-16" : "w-64"
            )}
        >
            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                {filteredItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    const hasChildren = item.children && item.children.length > 0;
                    const isExpanded = expandedSections.has(item.label);
                    const filteredChildren = item.children?.filter((c) => !("ceoOnly" in c) || isCeo);

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
                                        {item.badge && (
                                            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[var(--urus-danger)]" />
                                        )}
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
                                    {item.badge && (
                                        <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                                            {item.badge}
                                        </Badge>
                                    )}
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

            {/* Collapse toggle */}
            <div className="border-t border-border/50 p-2">
                <Button
                    onClick={onToggle}
                    className="flex w-full items-center justify-center rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
                >
                    {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                </Button>
            </div>
        </aside>
    );
}
