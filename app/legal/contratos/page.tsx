"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    FileText,
    Filter,
    Eye,
    Mic,
    Send,
    ArrowUpRight,
    Search,
    Calendar,
    User,
    BookOpen,
    CheckCircle2,
    Clock,
    AlertCircle,
    FileSignature,
    Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contratos } from "@/lib/mock-data/contratos";
import type { EstadoContrato } from "@/lib/mock-data/types";

const estadoConfig: Record<EstadoContrato, { label: string; color: string; icon: typeof Clock; bgClass: string }> = {
    borrador: { label: "Borrador", color: "var(--urus-info)", icon: FileText, bgClass: "bg-[var(--urus-info)]/8 text-[var(--urus-info)] border-[var(--urus-info)]/20" },
    revision: { label: "Revisión Gestor", color: "var(--urus-warning)", icon: AlertCircle, bgClass: "bg-[var(--urus-warning)]/8 text-[var(--urus-warning)] border-[var(--urus-warning)]/20" },
    enviado: { label: "Enviado a Firma", color: "var(--urus-gold)", icon: Send, bgClass: "bg-[var(--urus-gold)]/8 text-[var(--urus-gold)] border-[var(--urus-gold)]/20" },
    firmado: { label: "Firmado", color: "var(--urus-success)", icon: CheckCircle2, bgClass: "bg-[var(--urus-success)]/8 text-[var(--urus-success)] border-[var(--urus-success)]/20" },
};

const tipoLabel: Record<string, string> = {
    reserva: "Reserva",
    arras: "Arras",
};

export default function ContratosPage() {
    const [filterTipo, setFilterTipo] = useState<string>("all");
    const [filterEstado, setFilterEstado] = useState<string>("all");
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        return contratos.filter((c) => {
            if (filterTipo !== "all" && c.tipo !== filterTipo) return false;
            if (filterEstado !== "all" && c.estado !== filterEstado) return false;
            if (search) {
                const q = search.toLowerCase();
                const matchSearch =
                    c.operacion.toLowerCase().includes(q) ||
                    c.id.toLowerCase().includes(q) ||
                    String(c.variables.comprador || "").toLowerCase().includes(q) ||
                    String(c.variables.vendedor || "").toLowerCase().includes(q);
                if (!matchSearch) return false;
            }
            return true;
        });
    }, [filterTipo, filterEstado, search]);

    // Stats
    const borradorCount = contratos.filter((c) => c.estado === "borrador").length;
    const revisionCount = contratos.filter((c) => c.estado === "revision").length;
    const enviadoCount = contratos.filter((c) => c.estado === "enviado").length;
    const firmadoCount = contratos.filter((c) => c.estado === "firmado").length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center">
                        <FileSignature className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Automatización Legal</h1>
                        <p className="text-sm text-muted-foreground">
                            Contratos automáticos con Voice-to-Action y firma digital
                        </p>
                    </div>
                </div>
                <Link href="/legal/plantillas">
                    <Badge variant="outline" className="gap-1.5 px-3 py-1.5 hover:bg-accent/40 cursor-pointer transition-colors">
                        <Layers className="h-3 w-3 text-secondary" />
                        Gestión de Plantillas
                        <ArrowUpRight className="h-3 w-3" />
                    </Badge>
                </Link>
            </div>

            {/* Status cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.entries(estadoConfig) as [EstadoContrato, typeof estadoConfig[EstadoContrato]][]).map(([key, cfg]) => {
                    const count = contratos.filter((c) => c.estado === key).length;
                    const Icon = cfg.icon;
                    return (
                        <Card
                            key={key}
                            className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                            onClick={() => setFilterEstado(filterEstado === key ? "all" : key)}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="rounded-lg p-2"
                                        style={{ backgroundColor: `color-mix(in oklch, ${cfg.color} 15%, transparent)` }}
                                    >
                                        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{cfg.label}</p>
                                        <p className="text-xl font-bold font-mono" style={{ color: cfg.color }}>{count}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Filters */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <Filter className="h-4 w-4 text-muted-foreground" />

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Buscar por operación, contrato, partes..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-accent/30 border border-border/50 rounded-lg pl-8 pr-3 py-1.5 text-xs w-[280px] focus:outline-none focus:ring-2 focus:ring-secondary/30"
                            />
                        </div>

                        {/* Tipo */}
                        <select
                            value={filterTipo}
                            onChange={(e) => setFilterTipo(e.target.value)}
                            className="bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        >
                            <option value="all">Todos los tipos</option>
                            <option value="reserva">Reserva</option>
                            <option value="arras">Arras</option>
                        </select>

                        {/* Estado */}
                        <div className="flex gap-1">
                            {(["all", "borrador", "revision", "enviado", "firmado"] as const).map((e) => {
                                const cfg = e !== "all" ? estadoConfig[e] : null;
                                return (
                                    <button
                                        key={e}
                                        onClick={() => setFilterEstado(e)}
                                        className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-all ${filterEstado === e
                                                ? "bg-card border-secondary/30 text-foreground font-medium shadow-sm"
                                                : "border-border/30 text-muted-foreground hover:bg-accent/30"
                                            }`}
                                    >
                                        {e === "all" ? "Todos" : cfg?.label}
                                    </button>
                                );
                            })}
                        </div>

                        <Badge variant="outline" className="text-[10px] ml-auto">{filtered.length} contratos</Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Contracts Table */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/30">
                                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Contrato</th>
                                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Operación</th>
                                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tipo</th>
                                    <th className="text-left px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Partes</th>
                                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Versión</th>
                                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Estado</th>
                                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Fecha</th>
                                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Precio</th>
                                    <th className="text-center px-4 py-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/15">
                                {filtered.map((c) => {
                                    const cfg = estadoConfig[c.estado];
                                    const Icon = cfg.icon;
                                    return (
                                        <tr key={c.id} className="hover:bg-accent/15 transition-colors group">
                                            <td className="px-4 py-3">
                                                <span className="text-sm font-mono font-medium">{c.id.toUpperCase()}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-mono text-muted-foreground">{c.operacion}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] ${c.tipo === "arras" ? "border-secondary/30 text-secondary" : "border-[var(--urus-info)]/30 text-[var(--urus-info)]"}`}
                                                >
                                                    {tipoLabel[c.tipo]}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-xs">
                                                    <p className="font-medium">{c.variables.comprador as string}</p>
                                                    <p className="text-muted-foreground text-[10px]">↔ {c.variables.vendedor as string}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs font-mono font-bold">{c.versionActual}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant="outline" className={`text-[10px] gap-1 ${cfg.bgClass}`}>
                                                    <Icon className="h-3 w-3" />
                                                    {cfg.label}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(c.fechaCreacion).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs font-mono font-medium">
                                                    {(c.variables.precio as number).toLocaleString("es-ES")} €
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Link href={`/legal/contratos/${c.id}`}>
                                                        <button className="p-1.5 rounded-lg hover:bg-accent/40 transition-all" title="Ver contrato">
                                                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                                        </button>
                                                    </Link>
                                                    <Link href={`/legal/contratos/${c.id}`}>
                                                        <button className="p-1.5 rounded-lg hover:bg-accent/40 transition-all" title="Editar por voz">
                                                            <Mic className="h-3.5 w-3.5 text-secondary" />
                                                        </button>
                                                    </Link>
                                                    {c.estado === "revision" && (
                                                        <button className="p-1.5 rounded-lg hover:bg-[var(--urus-gold)]/20 transition-all" title="Enviar a firma">
                                                            <Send className="h-3.5 w-3.5 text-[var(--urus-gold)]" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
