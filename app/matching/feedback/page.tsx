"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Sparkles,
    MessageSquare,
    BrainCircuit,
    RefreshCw,
    CheckCircle2,
    XCircle,
    HelpCircle,
    TrendingUp,
    Zap,
    ThumbsUp,
    ThumbsDown,
    ArrowRight,
    Target,
    BarChart3,
    Clock,
    User,
    Home,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { matches } from "@/lib/mock-data/matches";
import type { Match, EstadoMensaje } from "@/lib/mock-data/types";

// Simulated feedback timeline entries
interface FeedbackEntry {
    id: string;
    comprador: string;
    estadoOriginal: EstadoMensaje;
    respuesta: string;
    interpretacionIA: string;
    accionCRM: string | null;
    fecha: string;
    tipo: "positivo" | "negativo" | "ajuste";
}

const feedbackTimeline: FeedbackEntry[] = [
    {
        id: "fb-1",
        comprador: "Ana García López",
        estadoOriginal: "me_encaja",
        respuesta: "Me encanta el piso de Calle Mayor. ¿Podemos verlo esta semana?",
        interpretacionIA: "Intención alta de compra. Solicita visita inmediata.",
        accionCRM: null,
        fecha: "2026-02-12T16:00:00Z",
        tipo: "positivo",
    },
    {
        id: "fb-2",
        comprador: "Carlos Fernández",
        estadoOriginal: "no_encaja",
        respuesta: "Se pasa de mi presupuesto, máximo 380.000€ y busco más metros.",
        interpretacionIA: "Presupuesto insuficiente. Ajustar rango de precio y m² mínimos.",
        accionCRM: "Presupuesto máximo: 400.000€ → 380.000€ | Metros mínimos: 100 → 120",
        fecha: "2026-02-10T15:00:00Z",
        tipo: "ajuste",
    },
    {
        id: "fb-3",
        comprador: "María José Blanco",
        estadoOriginal: "busco_diferente",
        respuesta: "Busco algo en Ruzafa pero con terraza, este no tiene.",
        interpretacionIA: "Requisito añadido: Terraza obligatoria. Zona confirmada: Ruzafa.",
        accionCRM: "Nuevo filtro: Terraza = Obligatoria",
        fecha: "2026-02-09T17:30:00Z",
        tipo: "ajuste",
    },
    {
        id: "fb-4",
        comprador: "Laura Martín Vega",
        estadoOriginal: "me_encaja",
        respuesta: "Perfecto, justo lo que buscábamos. ¿Qué documentación necesitamos?",
        interpretacionIA: "Avance a fase de documentación. Cliente listo para formalizar.",
        accionCRM: null,
        fecha: "2026-02-11T11:00:00Z",
        tipo: "positivo",
    },
    {
        id: "fb-5",
        comprador: "Pedro Sánchez Ruiz",
        estadoOriginal: "enviado",
        respuesta: "(Sin respuesta tras 48h)",
        interpretacionIA: "Sin interacción. Posible desinterés o mensaje no leído. Programar follow-up.",
        accionCRM: "Follow-up automático programado: 48h",
        fecha: "2026-02-12T20:00:00Z",
        tipo: "negativo",
    },
    {
        id: "fb-6",
        comprador: "Inversiones Sol SL",
        estadoOriginal: "me_encaja",
        respuesta: "Interesante para nuestra cartera. ¿Hay opción de negociar el precio?",
        interpretacionIA: "Perfil inversor con interés confirmado. Apertura a negociación de precio.",
        accionCRM: null,
        fecha: "2026-02-12T10:00:00Z",
        tipo: "positivo",
    },
];

// Simulated validation queue
interface ValidationItem {
    id: string;
    propiedad: { direccion: string; precio: number; zona: string; metros: number; habitaciones: number };
    comprador: string;
    razonIA: string;
    confianza: number;
}

const validationQueue: ValidationItem[] = [
    {
        id: "val-1",
        propiedad: { direccion: "Calle Caballeros 8, 1ºA", precio: 295000, zona: "Centro", metros: 90, habitaciones: 3 },
        comprador: "Laura Martín Vega",
        razonIA: "Zona y presupuesto coinciden. Metros ligeramente por encima de lo solicitado (+10m²). Recomendado.",
        confianza: 82,
    },
    {
        id: "val-2",
        propiedad: { direccion: "Av. Pérez Galdós 30, 5ºB", precio: 195000, zona: "Extramurs", metros: 65, habitaciones: 2 },
        comprador: "Miguel Torres Pardo",
        razonIA: "Precio dentro del rango pero zona no solicitada explícitamente. Proximidad a zona deseada (Centro). Validación manual recomendada.",
        confianza: 65,
    },
    {
        id: "val-3",
        propiedad: { direccion: "Calle Cirilo Amorós 50", precio: 480000, zona: "Ensanche", metros: 145, habitaciones: 4 },
        comprador: "Grupo Inmobiliario Valencia",
        razonIA: "Perfil inversor. Zona premium con alta revalorización. Coincide con presupuesto máximo. Alta probabilidad de interés.",
        confianza: 91,
    },
];

const tipoConfig = {
    positivo: { color: "var(--urus-success)", icon: ThumbsUp, label: "Positivo" },
    negativo: { color: "var(--urus-danger)", icon: ThumbsDown, label: "Sin respuesta" },
    ajuste: { color: "var(--urus-gold)", icon: RefreshCw, label: "Ajuste CRM" },
};

// Simulated learning metrics
const learningMetrics = [
    { month: "Sep", precision: 72, total: 18 },
    { month: "Oct", precision: 76, total: 22 },
    { month: "Nov", precision: 81, total: 28 },
    { month: "Dic", precision: 84, total: 32 },
    { month: "Ene", precision: 87, total: 38 },
    { month: "Feb", precision: 91, total: 45 },
];

export default function FeedbackPage() {
    const [validatedItems, setValidatedItems] = useState<Record<string, "si" | "no">>({});

    const handleValidation = (id: string, decision: "si" | "no") => {
        setValidatedItems((prev) => ({ ...prev, [id]: decision }));
    };

    // Stats
    const positiveCount = feedbackTimeline.filter((f) => f.tipo === "positivo").length;
    const adjustCount = feedbackTimeline.filter((f) => f.tipo === "ajuste").length;
    const negativeCount = feedbackTimeline.filter((f) => f.tipo === "negativo").length;
    const currentPrecision = learningMetrics[learningMetrics.length - 1].precision;
    const maxHeight = Math.max(...learningMetrics.map((m) => m.precision));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--urus-gold)]/20 to-[var(--urus-gold)]/5 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-[var(--urus-gold)]" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Feedback Loop</h1>
                        <p className="text-sm text-muted-foreground">
                            Retroalimentación inteligente y aprendizaje del motor de matching
                        </p>
                    </div>
                </div>
                <Link href="/matching/cruces">
                    <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                        <ArrowLeft className="h-3 w-3" />
                        Volver a Cruces
                    </Button>
                </Link>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-success)]/15 p-2">
                                <ThumbsUp className="h-4 w-4 text-[var(--urus-success)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Positivos</p>
                                <p className="text-xl font-bold font-mono text-[var(--urus-success)]">{positiveCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-gold)]/15 p-2">
                                <RefreshCw className="h-4 w-4 text-[var(--urus-gold)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ajustes CRM</p>
                                <p className="text-xl font-bold font-mono text-[var(--urus-gold)]">{adjustCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[var(--urus-danger)]/15 p-2">
                                <ThumbsDown className="h-4 w-4 text-[var(--urus-danger)]" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sin Respuesta</p>
                                <p className="text-xl font-bold font-mono text-[var(--urus-danger)]">{negativeCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:scale-[1.02]">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-secondary/15 p-2">
                                <Target className="h-4 w-4 text-secondary" />
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Precisión IA</p>
                                <p className="text-xl font-bold font-mono text-secondary">{currentPrecision}%</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Timeline + Learning metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Feedback Timeline */}
                <div className="lg:col-span-2 space-y-4">
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-secondary" />
                                <CardTitle className="text-sm font-semibold">Historial de Feedback</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="relative pl-6 space-y-0">
                                {/* Vertical line */}
                                <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border/30" />

                                {feedbackTimeline.map((entry, i) => {
                                    const config = tipoConfig[entry.tipo];
                                    const Icon = config.icon;
                                    const date = new Date(entry.fecha);

                                    return (
                                        <div key={entry.id} className="relative pb-6 last:pb-0">
                                            {/* Dot */}
                                            <div
                                                className="absolute -left-[15px] top-1 h-4 w-4 rounded-full border-2 flex items-center justify-center"
                                                style={{
                                                    borderColor: config.color,
                                                    backgroundColor: `color-mix(in oklch, ${config.color} 15%, var(--color-card))`,
                                                }}
                                            >
                                                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                                            </div>

                                            <div className="rounded-xl p-4 bg-accent/10 border border-border/20 hover:bg-accent/20 transition-all">
                                                {/* Header */}
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span className="text-sm font-medium">{entry.comprador}</span>
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[9px] gap-0.5"
                                                            style={{
                                                                borderColor: `color-mix(in oklch, ${config.color} 40%, transparent)`,
                                                                color: config.color,
                                                            }}
                                                        >
                                                            <Icon className="h-2.5 w-2.5" />
                                                            {config.label}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                </div>

                                                {/* Response */}
                                                <div className="bg-card/60 rounded-lg p-3 border border-border/20 mb-2">
                                                    <p className="text-xs italic text-muted-foreground">&ldquo;{entry.respuesta}&rdquo;</p>
                                                </div>

                                                {/* IA Interpretation */}
                                                <div className="flex items-start gap-2 mb-2">
                                                    <BrainCircuit className="h-3.5 w-3.5 text-secondary shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-[10px] text-secondary font-semibold uppercase tracking-wider mb-0.5">Interpretación IA</p>
                                                        <p className="text-xs text-muted-foreground">{entry.interpretacionIA}</p>
                                                    </div>
                                                </div>

                                                {/* CRM Action */}
                                                {entry.accionCRM && (
                                                    <div
                                                        className="rounded-lg p-2.5 flex items-start gap-2 border"
                                                        style={{
                                                            backgroundColor: "color-mix(in oklch, var(--urus-gold) 5%, transparent)",
                                                            borderColor: "color-mix(in oklch, var(--urus-gold) 20%, transparent)",
                                                        }}
                                                    >
                                                        <RefreshCw className="h-3 w-3 text-[var(--urus-gold)] shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-[9px] text-[var(--urus-gold)] font-semibold uppercase tracking-wider">Actualización automática CRM</p>
                                                            <p className="text-xs font-mono mt-0.5">{entry.accionCRM}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Learning Metrics */}
                <div className="space-y-4">
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-secondary" />
                                <CardTitle className="text-sm font-semibold">Métricas de Aprendizaje</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-4">
                            {/* Precision gauge */}
                            <div className="flex flex-col items-center">
                                <svg width="140" height="90" viewBox="0 0 140 90">
                                    <defs>
                                        <linearGradient id="learn-bg" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="var(--urus-danger)" stopOpacity="0.12" />
                                            <stop offset="50%" stopColor="var(--urus-warning)" stopOpacity="0.12" />
                                            <stop offset="100%" stopColor="var(--urus-success)" stopOpacity="0.12" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M 10 80 A 60 60 0 0 1 130 80" fill="none" stroke="url(#learn-bg)" strokeWidth="12" strokeLinecap="round" />
                                    <path
                                        d="M 10 80 A 60 60 0 0 1 130 80"
                                        fill="none"
                                        stroke="var(--urus-success)"
                                        strokeWidth="12"
                                        strokeLinecap="round"
                                        strokeDasharray={`${(currentPrecision / 100) * 188} 188`}
                                        style={{ transition: "stroke-dasharray 1s ease" }}
                                    />
                                    <text x="70" y="70" textAnchor="middle" className="text-lg font-bold font-mono" fill="var(--urus-success)">{currentPrecision}%</text>
                                    <text x="70" y="85" textAnchor="middle" className="text-[9px]" fill="currentColor" opacity="0.4">Precisión actual</text>
                                </svg>
                            </div>

                            {/* Monthly trend */}
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Evolución de Precisión</p>
                                <div className="flex items-end gap-2 h-[80px]">
                                    {learningMetrics.map((m) => {
                                        const heightPct = ((m.precision - 50) / 50) * 100;
                                        return (
                                            <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                                                <span className="text-[9px] font-mono font-bold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--urus-success)" }}>
                                                    {m.precision}%
                                                </span>
                                                <div
                                                    className="w-full rounded-t-md transition-all duration-300 group-hover:brightness-125"
                                                    style={{
                                                        height: `${heightPct}%`,
                                                        background: `linear-gradient(to top, color-mix(in oklch, var(--urus-success) 30%, transparent), var(--urus-success))`,
                                                        minHeight: "8px",
                                                    }}
                                                />
                                                <span className="text-[8px] text-muted-foreground">{m.month}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Total matches processed */}
                            <div className="space-y-2 pt-2 border-t border-border/20">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Matches Procesados</p>
                                {learningMetrics.map((m) => (
                                    <div key={m.month} className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground w-7">{m.month}</span>
                                        <div className="flex-1 h-2 rounded-full bg-accent/20 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                    width: `${(m.total / 50) * 100}%`,
                                                    backgroundColor: "var(--color-secondary)",
                                                    opacity: 0.4 + (m.total / 50) * 0.6,
                                                }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-mono w-5 text-right">{m.total}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="rounded-xl p-3 bg-secondary/5 border border-secondary/15">
                                <div className="flex items-start gap-2">
                                    <TrendingUp className="h-3.5 w-3.5 text-secondary shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] font-semibold text-secondary">Mejora continua</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            La precisión mejoró un <span className="font-bold text-[var(--urus-success)]">+{currentPrecision - learningMetrics[0].precision}%</span> en 6 meses
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Validation Queue */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-[var(--urus-gold)]" />
                            <CardTitle className="text-sm font-semibold">Cola de Validación</CardTitle>
                            <Badge variant="outline" className="text-[9px]">
                                {validationQueue.length - Object.keys(validatedItems).length} pendientes
                            </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Propiedades pre-filtradas por la IA para validación manual del agente
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="space-y-3">
                        {validationQueue.map((item) => {
                            const isValidated = item.id in validatedItems;
                            const decision = validatedItems[item.id];
                            const confColor = item.confianza >= 85 ? "var(--urus-success)" : item.confianza >= 70 ? "var(--urus-gold)" : "var(--urus-warning)";

                            return (
                                <div
                                    key={item.id}
                                    className={`rounded-xl p-4 border transition-all ${isValidated
                                            ? decision === "si"
                                                ? "bg-[var(--urus-success)]/3 border-[var(--urus-success)]/15 opacity-70"
                                                : "bg-[var(--urus-danger)]/3 border-[var(--urus-danger)]/15 opacity-70"
                                            : "bg-accent/10 border-border/20 hover:bg-accent/20"
                                        }`}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Property info */}
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="flex items-center gap-1.5">
                                                    <Home className="h-3.5 w-3.5 text-secondary" />
                                                    <span className="text-sm font-medium">{item.propiedad.direccion}</span>
                                                </div>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                <div className="flex items-center gap-1.5">
                                                    <User className="h-3.5 w-3.5 text-[var(--urus-gold)]" />
                                                    <span className="text-sm font-medium">{item.comprador}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                                <span className="font-mono font-semibold text-foreground">{item.propiedad.precio.toLocaleString("es-ES")} €</span>
                                                <span>{item.propiedad.metros} m²</span>
                                                <span>{item.propiedad.habitaciones} hab</span>
                                                <Badge variant="outline" className="text-[9px]">{item.propiedad.zona}</Badge>
                                            </div>

                                            {/* IA reasoning */}
                                            <div className="flex items-start gap-2 bg-card/40 rounded-lg p-2.5 border border-border/10">
                                                <BrainCircuit className="h-3.5 w-3.5 text-secondary shrink-0 mt-0.5" />
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">{item.razonIA}</p>
                                            </div>
                                        </div>

                                        {/* Confidence + Actions */}
                                        <div className="shrink-0 flex flex-col items-center gap-3">
                                            {/* Confidence */}
                                            <div className="text-center">
                                                <div className="relative">
                                                    <svg width="52" height="52" viewBox="0 0 52 52">
                                                        <circle cx="26" cy="26" r="20" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.06" />
                                                        <circle
                                                            cx="26" cy="26" r="20"
                                                            fill="none"
                                                            stroke={confColor}
                                                            strokeWidth="3"
                                                            strokeLinecap="round"
                                                            strokeDasharray={`${(item.confianza / 100) * 125.66} 125.66`}
                                                            transform="rotate(-90 26 26)"
                                                        />
                                                        <text x="26" y="29" textAnchor="middle" className="text-xs font-bold font-mono" fill={confColor}>
                                                            {item.confianza}
                                                        </text>
                                                    </svg>
                                                </div>
                                                <p className="text-[8px] text-muted-foreground mt-0.5">Confianza IA</p>
                                            </div>

                                            {/* Action buttons */}
                                            {!isValidated ? (
                                                <div className="flex gap-1.5">
                                                    <button
                                                        onClick={() => handleValidation(item.id, "si")}
                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--urus-success)]/10 border border-[var(--urus-success)]/30 text-[var(--urus-success)] text-[10px] font-medium hover:bg-[var(--urus-success)]/20 transition-all"
                                                    >
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Sí
                                                    </button>
                                                    <button
                                                        onClick={() => handleValidation(item.id, "no")}
                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--urus-danger)]/10 border border-[var(--urus-danger)]/30 text-[var(--urus-danger)] text-[10px] font-medium hover:bg-[var(--urus-danger)]/20 transition-all"
                                                    >
                                                        <XCircle className="h-3 w-3" />
                                                        No
                                                    </button>
                                                </div>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[9px]"
                                                    style={{
                                                        borderColor: decision === "si" ? "var(--urus-success)" : "var(--urus-danger)",
                                                        color: decision === "si" ? "var(--urus-success)" : "var(--urus-danger)",
                                                    }}
                                                >
                                                    {decision === "si" ? "✅ Validado" : "❌ Descartado"}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
