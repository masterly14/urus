"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    AlertOctagon,
    BarChart3,
    TrendingUp,
    Users,
} from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";

interface PerformanceLayoutProps {
    children: React.ReactNode;
}

interface NavItem {
    name: string;
    href: string;
    icon: React.ElementType;
    ceoOnly?: boolean;
    comercialOnly?: boolean;
}

const navItems: NavItem[] = [
    { name: "Equipo", href: "/platform/rendimiento/equipo", icon: Users, ceoOnly: true },
    { name: "Comerciales", href: "/platform/rendimiento/comerciales", icon: TrendingUp, ceoOnly: true },
    { name: "Mis Resultados", href: "/platform/rendimiento/comercial/me", icon: BarChart3 },
    { name: "Alertas", href: "/platform/rendimiento/alertas", icon: AlertOctagon, ceoOnly: true },
];

export default function PerformanceLayout({ children }: PerformanceLayoutProps) {
    const pathname = usePathname();
    const { isCeo, isComercial, isCeoOrAdmin } = useSession();

    const filteredItems = navItems.filter((item) => {
        if (item.ceoOnly && !isCeoOrAdmin) return false;
        if (item.comercialOnly && !isComercial) return false;
        return true;
    });

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Gestión del Rendimiento</h1>
                <p className="text-muted-foreground">
                    {isCeoOrAdmin
                        ? "Sistema de gestión de rendimiento basado en arquetipos."
                        : "Tu panel de rendimiento personal."
                    }
                </p>
            </div>
            <div className="flex items-center space-x-1 border-b border-border/40 pb-2">
                {filteredItems.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-2.5",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            <span>{item.name}</span>
                        </Link>
                    );
                })}
            </div>
            <div className="flex-1">{children}</div>
        </div>
    );
}
