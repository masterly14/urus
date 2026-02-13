"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    AlertOctagon,
    BarChart3,
    Users,
} from "lucide-react";

interface PerformanceLayoutProps {
    children: React.ReactNode;
}

const navItems = [
    { name: "Equipo", href: "/rendimiento/equipo", icon: Users },
    { name: "Mis Resultados", href: "/rendimiento/comercial/me", icon: BarChart3 },
    { name: "Alertas", href: "/rendimiento/alertas", icon: AlertOctagon },
];

export default function PerformanceLayout({ children }: PerformanceLayoutProps) {
    const pathname = usePathname();

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Performance Management</h1>
                <p className="text-muted-foreground">
                    Sistema de gestión de rendimiento basado en arquetipos.
                </p>
            </div>
            <div className="flex items-center space-x-1 border-b border-border/40 pb-2">
                {navItems.map((item) => {
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
