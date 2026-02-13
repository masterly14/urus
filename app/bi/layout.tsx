"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    BarChart4,
    Briefcase,
    Coins,
    Globe,
    LineChart,
    Users2,
} from "lucide-react";

interface BILayoutProps {
    children: React.ReactNode;
}

const biNavigation = [
    { name: "Financiero", href: "/bi/financiero", icon: Coins },
    { name: "Operativo", href: "/bi/operativo", icon: BarChart4 },
    { name: "Capital Humano", href: "/bi/capital-humano", icon: Users2 },
    { name: "Prescriptivo", href: "/bi/prescriptivo", icon: LineChart },
    { name: "Expansión", href: "/bi/expansion", icon: Globe },
    { name: "Reinversión", href: "/bi/reinversion", icon: Briefcase },
];

export default function BILayout({ children }: BILayoutProps) {
    const pathname = usePathname();

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Business Intelligence</h1>
                <p className="text-muted-foreground">
                    Análisis avanzado y toma de decisiones basada en datos.
                </p>
            </div>
            <div className="flex items-center space-x-1 overflow-x-auto pb-2">
                {biNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
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
