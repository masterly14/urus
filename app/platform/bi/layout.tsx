"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    BarChart4,
    Briefcase,
    Coins,
    Globe,
    LineChart,
    Users2,
} from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";

interface BILayoutProps {
    children: React.ReactNode;
}

const ceoNavigation = [
    { name: "Visión Ejecutiva", href: "/platform/bi/vision-ejecutiva", icon: Coins },
    { name: "Rendimiento", href: "/platform/bi/operativo", icon: BarChart4 },
    { name: "Capital Humano", href: "/platform/bi/capital-humano", icon: Users2 },
    { name: "Diagnóstico IA", href: "/platform/bi/prescriptivo", icon: LineChart },
    { name: "Expansión", href: "/platform/bi/expansion", icon: Globe },
    { name: "Finanzas", href: "/platform/bi/reinversion", icon: Briefcase },
];

export default function BILayout({ children }: BILayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { isCeo } = useSession();

    useEffect(() => {
        if (!isCeo) {
            router.replace("/platform/rendimiento");
        }
    }, [isCeo, router]);

    if (!isCeo) return null;

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Gobierno Estratégico</h1>
                <p className="text-muted-foreground">
                    Control total de la empresa. Decisión basada en datos, no en intuición.
                </p>
            </div>
            <div className="flex items-center space-x-1 overflow-x-auto pb-2">
                {ceoNavigation.map((item) => {
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
