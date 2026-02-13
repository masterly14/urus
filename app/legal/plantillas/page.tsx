"use client";

import { useState } from "react";
import Link from "next/link";
import {
    LayoutTemplate,
    Search,
    Plus,
    FileText,
    MoreVertical,
    PenLine,
    Copy,
    Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Mock templates
const templates = [
    {
        id: "tpl-1",
        title: "Contrato de Arras Penitenciales",
        description: "Modelo estándar según el artículo 1454 del Código Civil. Penalización doble si desiste el vendedor.",
        variables: ["precio", "arras", "plazo_escritura", "cargas"],
        lastModified: "2026-02-10",
        version: "v4.2",
    },
    {
        id: "tpl-2",
        title: "Contrato de Arras Confirmatorias",
        description: "Modelo donde la cantidad entregada es parte del precio. Obliga al cumplimiento del contrato.",
        variables: ["precio", "arras", "plazo_escritura"],
        lastModified: "2026-01-15",
        version: "v3.0",
    },
    {
        id: "tpl-3",
        title: "Documento de Reserva",
        description: "Reserva básica para retirar el inmueble del mercado temporalmente mientras se formalizan arras.",
        variables: ["precio", "reserva", "plazo_arras"],
        lastModified: "2026-02-01",
        version: "v2.1",
    },
    {
        id: "tpl-4",
        title: "Mandato de Venta en Exclusiva",
        description: "Contrato de encargos de venta para captación de propiedades en exclusiva.",
        variables: ["honorarios", "plazo", "precio_salida"],
        lastModified: "2025-12-20",
        version: "v5.0",
    },
];

export default function PlantillasPage() {
    const [search, setSearch] = useState("");

    const filtered = templates.filter(
        (t) =>
            t.title.toLowerCase().includes(search.toLowerCase()) ||
            t.description.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
                        <LayoutTemplate className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Plantillas Legales</h1>
                        <p className="text-sm text-muted-foreground">
                            Gestión de modelos de contratos y cláusulas reutilizables
                        </p>
                    </div>
                </div>
                <Button className="gap-2 bg-secondary hover:bg-secondary/90 text-white">
                    <Plus className="h-4 w-4" />
                    Nueva Plantilla
                </Button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar plantillas..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-card/60 border-border/50"
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((tpl) => (
                    <Card key={tpl.id} className="group border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02] cursor-pointer flex flex-col h-full">
                        <CardHeader className="pb-3 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                                    {tpl.version}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                            <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                                {tpl.title}
                            </CardTitle>
                            <CardDescription className="text-xs line-clamp-3 pt-1">
                                {tpl.description}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0 border-t border-border/20 mt-auto">
                            <div className="pt-3 space-y-3">
                                <div className="flex flex-wrap gap-1.5">
                                    {tpl.variables.slice(0, 3).map((v) => (
                                        <Badge key={v} variant="secondary" className="text-[9px] px-1.5 py-0 bg-secondary/10 text-secondary border-none font-normal">
                                            {`{${v}}`}
                                        </Badge>
                                    ))}
                                    {tpl.variables.length > 3 && (
                                        <span className="text-[9px] text-muted-foreground px-1">+{tpl.variables.length - 3}</span>
                                    )}
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                                    <span>Modificado: {new Date(tpl.lastModified).toLocaleDateString()}</span>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Editar">
                                            <PenLine className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Duplicar">
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {/* Create New Card (Empty State-ish) */}
                <button className="border-2 border-dashed border-border/40 hover:border-secondary/50 rounded-xl flex flex-col items-center justify-center gap-3 p-6 text-muted-foreground hover:text-secondary hover:bg-accent/5 transition-all group min-h-[220px]">
                    <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Plus className="h-6 w-6" />
                    </div>
                    <span className="text-sm font-medium">Crear Nueva Plantilla</span>
                </button>
            </div>
        </div>
    );
}
