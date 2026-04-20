"use client";

import { use, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    DollarSign,
    Calendar,
    User,
    Users,
    FileText,
    CheckCircle2,
    Circle,
    Download,
    Tag,
    Send,
    MessageSquare,
    Home,
    Building2,
    Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StepperProgress } from "@/components/post-venta/stepper-progress";
import { TimelineEvent } from "@/components/post-venta/pipeline-kanban";
import { operaciones } from "@/lib/mock-data/operaciones";
import { comerciales } from "@/lib/mock-data/comerciales";
import type { OperacionPostVenta } from "@/lib/postventa/pipeline-types";

const tipoClienteConfig = {
    comprador: { label: "Comprador", color: "var(--urus-info)", emoji: "🏠", icon: Home },
    inversor: { label: "Inversor", color: "var(--urus-gold)", emoji: "💰", icon: Building2 },
    vendedor: { label: "Vendedor", color: "var(--urus-success)", emoji: "📤", icon: Briefcase },
};

// ── Checklist items ──────────────────────────────────────────

function getChecklistItems(completed: boolean) {
    return [
        { label: "Email de agradecimiento enviado", done: true },
        { label: "Resumen de operación adjunto", done: true },
        { label: "Datos de partes verificados", done: completed },
        { label: "Documentación completa", done: completed },
        { label: "Confirmación del cliente", done: completed },
        { label: "Registro en CRM actualizado", done: completed },
    ];
}

function formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function OperacionDetalleContent({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const searchParams = useSearchParams();
    // Modo visual demo para revisión de UI sin backend real.
    const mockMode = searchParams.get("mock") === "1";
    const [operation, setOperation] = useState<OperacionPostVenta | null>(() =>
        mockMode ? operaciones.find((op) => op.id === resolvedParams.id) ?? null : null
    );
    const [loading, setLoading] = useState<boolean>(!mockMode);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (mockMode) {
            setOperation(operaciones.find((op) => op.id === resolvedParams.id) ?? null);
            setLoading(false);
            setLoadError(null);
            return;
        }

        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const response = await fetch(`/api/postventa/pipeline/${resolvedParams.id}`, {
                    method: "GET",
                    credentials: "same-origin",
                });
                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    const message = typeof body?.error === "string" ? body.error : "No se pudo cargar la operación";
                    throw new Error(message);
                }
                const body = await response.json() as OperacionPostVenta;
                if (!cancelled) setOperation(body);
            } catch (error) {
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : "Error inesperado";
                    setLoadError(message);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [mockMode, resolvedParams.id]);

    const backHref = mockMode
        ? "/platform/post-venta/pipeline?mock=1"
        : "/platform/post-venta/pipeline";

    const documents = useMemo(() => {
        if (!operation?.documentos) return [];
        return operation.documentos;
    }, [operation]);

    if (loading) {
        return (
            <div className="space-y-6">
                <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                    Volver al Pipeline
                </Link>
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="py-12 text-sm text-muted-foreground">
                        Cargando operación post-venta...
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!operation) {
        return (
            <div className="space-y-6">
                <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                    Volver al Pipeline
                </Link>
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                        <p className="text-lg font-semibold mb-2">Operación no encontrada</p>
                        <p className="text-sm text-muted-foreground">{loadError ?? "La operación solicitada no existe en el sistema."}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const comercial = comerciales.find((c) => c.id === operation.comercial);
    const comercialDisplay = comercial
        ? {
            nombre: comercial.nombre,
            ciudad: comercial.ciudad,
            avatar: comercial.avatar,
        }
        : operation.comercialNombre
            ? {
                nombre: operation.comercialNombre,
                ciudad: operation.comercialCiudad ?? "N/A",
                avatar: operation.comercialNombre
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
                    .join(""),
            }
            : null;
    const tipoConfig = tipoClienteConfig[operation.tipoCliente];
    const TipoIcon = tipoConfig.icon;
    const checklistItems = getChecklistItems(operation.checklistCompleto);
    const completedItems = checklistItems.filter((item) => item.done).length;
    const sortedMessages = [...operation.mensajes].sort(
        (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );

    return (
        <div className="space-y-6">
            {/* Back link */}
            <Link
                href={backHref}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                Volver al Pipeline
            </Link>

            {/* Header Card */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
                <div
                    className="h-1.5"
                    style={{
                        background: `linear-gradient(90deg, var(--urus-success) ${(operation.etapaActual / 4) * 100}%, oklch(0.3 0 0 / 20%) ${(operation.etapaActual / 4) * 100}%)`,
                    }}
                />
                <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className="text-xl font-bold tracking-tight">{operation.direccion}</h1>
                                <Badge
                                    variant="outline"
                                    className="text-[10px] px-2 gap-1"
                                    style={{
                                        borderColor: `color-mix(in oklch, ${tipoConfig.color} 40%, transparent)`,
                                        color: tipoConfig.color,
                                        backgroundColor: `color-mix(in oklch, ${tipoConfig.color} 8%, transparent)`,
                                    }}
                                >
                                    <TipoIcon className="h-3 w-3" />
                                    {tipoConfig.label}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] font-mono">
                                    {operation.id.toUpperCase()}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-secondary" />
                                    <div>
                                        <p className="text-[10px] text-muted-foreground">Precio</p>
                                        <p className="text-sm font-bold font-mono">{operation.precio.toLocaleString("es-ES")} €</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-[10px] text-muted-foreground">Cierre</p>
                                        <p className="text-sm font-medium">{formatDate(operation.fechaCierre)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-[10px] text-muted-foreground">Comprador</p>
                                        <p className="text-sm font-medium truncate">{operation.comprador}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-[10px] text-muted-foreground">Vendedor</p>
                                        <p className="text-sm font-medium truncate">{operation.vendedor}</p>
                                    </div>
                                </div>
                            </div>

                            {comercialDisplay && (
                                <div className="flex items-center gap-2 pt-1">
                                    <div className="h-7 w-7 rounded-full bg-accent/50 flex items-center justify-center text-[10px] font-semibold text-secondary">
                                        {comercialDisplay.avatar || "NA"}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        Comercial: <span className="text-foreground font-medium">{comercialDisplay.nombre}</span> · {comercialDisplay.ciudad}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Progress Steps */}
            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Progreso por Etapas</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                    <StepperProgress currentStep={operation.etapaActual} />
                </CardContent>
            </Card>

            {/* Main content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left: Timeline */}
                <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-secondary" />
                                <CardTitle className="text-sm font-semibold">Historial de Mensajes</CardTitle>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                                {operation.mensajes.length} mensajes
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {sortedMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="h-12 w-12 rounded-full bg-accent/30 flex items-center justify-center mb-3">
                                    <Send className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <p className="text-sm font-medium text-muted-foreground">Sin mensajes aún</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">Los mensajes automáticos se enviarán según la etapa</p>
                            </div>
                        ) : (
                            <div>
                                {sortedMessages.map((msg, idx) => (
                                    <TimelineEvent
                                        key={msg.id}
                                        message={msg}
                                        isLast={idx === sortedMessages.length - 1}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Right column */}
                <div className="space-y-4">
                    {/* Checklist */}
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-[var(--urus-success)]" />
                                    <CardTitle className="text-sm font-semibold">Checklist de Cierre</CardTitle>
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                    {completedItems}/{checklistItems.length}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            {/* Progress bar */}
                            <div className="h-2 rounded-full bg-accent/30 overflow-hidden mb-4">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                        width: `${(completedItems / checklistItems.length) * 100}%`,
                                        background: completedItems === checklistItems.length
                                            ? "var(--urus-success)"
                                            : "linear-gradient(90deg, var(--urus-warning), var(--urus-gold))",
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                {checklistItems.map((item, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2.5 py-1.5"
                                    >
                                        {item.done ? (
                                            <CheckCircle2 className="h-4 w-4 text-[var(--urus-success)] shrink-0" />
                                        ) : (
                                            <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                        )}
                                        <span
                                            className={`text-sm ${item.done
                                                    ? "text-foreground"
                                                    : "text-muted-foreground"
                                                }`}
                                        >
                                            {item.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Segmentation */}
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <Tag className="h-4 w-4 text-secondary" />
                                <CardTitle className="text-sm font-semibold">Segmentación del Cliente</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div
                                className="flex items-center gap-4 rounded-xl p-4 border"
                                style={{
                                    borderColor: `color-mix(in oklch, ${tipoConfig.color} 25%, transparent)`,
                                    backgroundColor: `color-mix(in oklch, ${tipoConfig.color} 5%, transparent)`,
                                }}
                            >
                                <div
                                    className="h-14 w-14 rounded-xl flex items-center justify-center text-2xl"
                                    style={{
                                        backgroundColor: `color-mix(in oklch, ${tipoConfig.color} 15%, transparent)`,
                                    }}
                                >
                                    {tipoConfig.emoji}
                                </div>
                                <div>
                                    <p className="text-lg font-bold" style={{ color: tipoConfig.color }}>
                                        {tipoConfig.label}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {operation.tipoCliente === "comprador" && "Primera compra · Seguimiento prioritario"}
                                        {operation.tipoCliente === "inversor" && "Perfil inversor · Alto potencial de repetición"}
                                        {operation.tipoCliente === "vendedor" && "Vendedor · Potencial comprador futuro"}
                                    </p>
                                </div>
                            </div>

                            {/* Recaptation suggestions */}
                            {operation.etapaActual >= 4 && (
                                <div className="mt-3 p-3 rounded-lg bg-accent/20 border border-border/30">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Acciones de Recaptación</p>
                                    <div className="space-y-1.5">
                                        {operation.tipoCliente === "comprador" && (
                                            <>
                                                <p className="text-xs text-foreground">• Enviar oportunidades de inversión en la zona</p>
                                                <p className="text-xs text-foreground">• Ofrecer servicios de reforma/interiorismo</p>
                                            </>
                                        )}
                                        {operation.tipoCliente === "inversor" && (
                                            <>
                                                <p className="text-xs text-foreground">• Nuevas oportunidades de inversión disponibles</p>
                                                <p className="text-xs text-foreground">• Informe de rentabilidad del activo actual</p>
                                            </>
                                        )}
                                        {operation.tipoCliente === "vendedor" && (
                                            <>
                                                <p className="text-xs text-foreground">• ¿Busca nueva vivienda para comprar?</p>
                                                <p className="text-xs text-foreground">• Referidos: ¿conoce a alguien que quiera vender?</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Documents */}
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <CardTitle className="text-sm font-semibold">Documentación</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="space-y-2">
                                {documents.length === 0 ? (
                                    <div className="text-xs text-muted-foreground">
                                        Sin documentos asociados a esta operación.
                                    </div>
                                ) : (
                                    documents.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="flex items-center justify-between rounded-lg px-3 py-2 bg-accent/20 hover:bg-accent/40 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <FileText className="h-4 w-4 text-[var(--urus-danger)] shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium truncate">{doc.nombre}</p>
                                                <p className="text-[10px] text-muted-foreground">{formatDate(doc.fecha)}</p>
                                            </div>
                                        </div>
                                        {doc.url ? (
                                            <a
                                                href={doc.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex"
                                            >
                                                <Download className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                            </a>
                                        ) : (
                                            <Download className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                                        )}
                                    </div>
                                ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function OperacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <Suspense fallback={null}>
            <OperacionDetalleContent params={params} />
        </Suspense>
    );
}
