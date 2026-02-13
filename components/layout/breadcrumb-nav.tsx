"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const labelMap: Record<string, string> = {
    coach: "Coach Emocional",
    chat: "Chat",
    metricas: "Métricas",
    "post-venta": "Post-Venta",
    pipeline: "Pipeline",
    operacion: "Operación",
    colaboradores: "Colaboradores",
    ranking: "Rankings",
    matching: "Matching",
    cruces: "Cruces Automáticos",
    feedback: "Feedback Loop",
    pricing: "Smart Pricing",
    analisis: "Análisis",
    mercado: "Mercado",
    legal: "Legal",
    contratos: "Contratos",
    plantillas: "Plantillas",
    bi: "Business Intelligence",
    financiero: "Financiero",
    operativo: "Operativo",
    "capital-humano": "Capital Humano",
    prescriptivo: "Prescriptivo",
    expansion: "Expansión",
    reinversion: "Reinversión",
    rendimiento: "Rendimiento",
    equipo: "Equipo",
    comercial: "Comercial",
    alertas: "Alertas",
    configuracion: "Configuración",
};

export function BreadcrumbNav() {
    const pathname = usePathname();

    if (pathname === "/") return null;

    const segments = pathname.split("/").filter(Boolean);

    return (
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link
                href="/"
                className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
                <Home className="h-3.5 w-3.5" />
            </Link>
            {segments.map((segment, index) => {
                const href = "/" + segments.slice(0, index + 1).join("/");
                const isLast = index === segments.length - 1;
                const label = labelMap[segment] ||
                    (segment.startsWith("[") ? segment : segment.charAt(0).toUpperCase() + segment.slice(1));

                // Skip dynamic segments like [id] that look like actual IDs
                const isDynamic = /^[a-z0-9-]+$/.test(segment) && !labelMap[segment] && segment.length > 10;

                return (
                    <span key={href} className="flex items-center gap-1.5">
                        <ChevronRight className="h-3.5 w-3.5" />
                        {isLast ? (
                            <span className="font-medium text-foreground">
                                {isDynamic ? `#${segment.slice(0, 8)}` : label}
                            </span>
                        ) : (
                            <Link href={href} className="hover:text-foreground transition-colors">
                                {isDynamic ? `#${segment.slice(0, 8)}` : label}
                            </Link>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}
