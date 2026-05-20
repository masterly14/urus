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
    Wallet,
} from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";
import { CeoSnapshotAlert } from "@/components/bi/ceo-snapshot-alert";

interface BILayoutProps {
    children: React.ReactNode;
}

const ceoNavigation = [
    { name: "Visión Ejecutiva", href: "/platform/bi/vision-ejecutiva", icon: Coins },
    { name: "Financiero", href: "/platform/bi/financiero", icon: Wallet },
    { name: "Rendimiento", href: "/platform/bi/operativo", icon: BarChart4 },
    { name: "Capital Humano", href: "/platform/bi/capital-humano", icon: Users2 },
    { name: "Diagnóstico IA", href: "/platform/bi/prescriptivo", icon: LineChart },
    { name: "Expansión", href: "/platform/bi/expansion", icon: Globe },
];

export default function BILayout({ children }: BILayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { isCeoOrAdmin, isPending } = useSession();

    useEffect(() => {
        if (!isPending && !isCeoOrAdmin) {
            router.replace("/platform/rendimiento");
        }
    }, [isCeoOrAdmin, isPending, router]);

    if (isPending || !isCeoOrAdmin) return null;

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex flex-col space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Gobierno Estratégico</h1>
                <p className="text-muted-foreground">
                    Control total de la empresa. Decisión basada en datos, no en intuición.
                </p>
            </div>
            <CeoSnapshotAlert />
            
            {/* 
              UX Pattern: We use tabs here because they represent different views 
              of the same overarching resource: Business Intelligence. 
              However, we ensure they don't look like global persistent tabs, 
              but rather contextual navigation for the BI section.
            */}
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-px mb-4">
                {ceoNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
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
