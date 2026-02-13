"use client";

import { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Mic,
    Save,
    Send,
    History,
    FileText,
    CheckCircle2,
    AlertCircle,
    X,
    ChevronDown,
    ChevronUp,
    Play,
    Pause,
    MoreVertical,
    FileSignature,
    PenLine,
    Wand2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { contratos } from "@/lib/mock-data/contratos";
import type { Contrato } from "@/lib/mock-data/types";

// Simulated Voice-to-Action hook
function useVoiceToAction() {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [aiAction, setAiAction] = useState<{ type: string; description: string; changes: any } | null>(null);

    const startRecording = () => {
        setIsRecording(true);
        setTranscript("");
        setAiAction(null);

        // Simulate recording duration
        setTimeout(() => {
            setIsRecording(false);
            setIsProcessing(true);

            // Simulate processing
            setTimeout(() => {
                const mockTranscript = "Añade una cláusula de condición hipotecaria por 30 días y cambia las arras a penitenciales.";
                setTranscript(mockTranscript);
                setIsProcessing(false);

                // Simulate AI interpretation
                setAiAction({
                    type: "update_contract",
                    description: "Se han detectado 2 cambios:",
                    changes: {
                        condicionHipotecaria: true,
                        tipoArras: "penitenciales",
                        plazoHipoteca: "30 días"
                    }
                });
            }, 1500);
        }, 3000);
    };

    return { isRecording, transcript, isProcessing, aiAction, startRecording, setAiAction };
}

export default function ContratoDetallePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const [contract, setContract] = useState<Contrato | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<"editor" | "variables" | "history">("editor");
    const { isRecording, transcript, isProcessing, aiAction, startRecording, setAiAction } = useVoiceToAction();
    const [showConfetti, setShowConfetti] = useState(false);

    useEffect(() => {
        const found = contratos.find((c) => c.id === resolvedParams.id);
        if (found) setContract(found);
    }, [resolvedParams.id]);

    const applyChanges = () => {
        if (!contract || !aiAction) return;

        // Update contract state (simulated)
        setContract({
            ...contract,
            variables: {
                ...contract.variables,
                ...aiAction.changes
            },
            versionActual: `v${parseInt(contract.versionActual.replace("v", "")) + 1}`,
            versiones: [
                ...contract.versiones,
                {
                    version: `v${parseInt(contract.versionActual.replace("v", "")) + 1}`,
                    fecha: new Date().toISOString(),
                    descripcion: "Actualización por voz: condición hipotecaria y arras penitenciales"
                }
            ]
        });

        setAiAction(null);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
    };

    if (!contract) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh]">
                <p className="text-muted-foreground">Cargando contrato...</p>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-6rem)] flex flex-col gap-4">
            {/* Header */}
            <header className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/legal/contratos">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold flex items-center gap-2">
                                {contract.tipo === "arras" ? "Contrato de Arras" : "Contrato de Reserva"}
                                <Badge variant="outline" className="font-mono font-normal text-xs">
                                    {contract.id.toUpperCase()}
                                </Badge>
                            </h1>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                            Operación {contract.operacion} · {contract.variables.comprador as string} ↔ {contract.variables.vendedor as string}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 mr-4 bg-accent/30 px-2 py-1 rounded-md border border-border/30">
                        <History className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-mono font-medium">{contract.versionActual}</span>
                    </div>

                    <Button variant="outline" size="sm" className="gap-2">
                        <Save className="h-3.5 w-3.5" />
                        Guardar Borrador
                    </Button>
                    <Button size="sm" className="gap-2 bg-[var(--urus-gold)] hover:bg-[var(--urus-gold)]/90 text-black border-none">
                        <Send className="h-3.5 w-3.5" />
                        Enviar a Firma
                    </Button>
                </div>
            </header>

            {/* Main Editor Layout */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr,350px] gap-4 min-h-0">

                {/* Visual Editor (Left Panel) */}
                <Card className="flex flex-col overflow-hidden border-border/50 bg-card/60 backdrop-blur-sm shadow-sm h-full">
                    <div className="bg-muted/30 border-b border-border/30 p-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                                <FileText className="h-3 w-3" /> Vista Previa
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
                                <PenLine className="h-3 w-3" /> Edición Directa
                            </Button>
                        </div>
                        <span className="text-[10px] text-muted-foreground">Última modificación: hace 2 min</span>
                    </div>

                    <ScrollArea className="flex-1 p-8 bg-white dark:bg-[#1a1b1e]">
                        <div className="max-w-[700px] mx-auto text-sm space-y-6 text-foreground font-serif leading-relaxed">
                            {/* Document Header */}
                            <div className="text-center space-y-4 mb-8">
                                <h2 className="text-xl font-bold uppercase tracking-wide border-b-2 border-black dark:border-white pb-2 inline-block">
                                    {contract.tipo === "arras" ? "CONTRATO DE ARRAS PENITENCIALES" : "DOCUMENTO DE RESERVA"}
                                </h2>
                                <p className="text-xs text-muted-foreground">En Valencia, a {new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>
                            </div>

                            {/* REUNIDOS */}
                            <div className="space-y-2">
                                <h3 className="font-bold uppercase text-xs tracking-wider">REUNIDOS</h3>
                                <p>De una parte, <span className="font-bold bg-secondary/10 px-1 rounded">{contract.variables.vendedor as string}</span>, en adelante la "PARTE VENDEDORA".</p>
                                <p>Y de otra, <span className="font-bold bg-secondary/10 px-1 rounded">{contract.variables.comprador as string}</span>, en adelante la "PARTE COMPRADORA".</p>
                            </div>

                            {/* EXPONEN */}
                            <div className="space-y-2">
                                <h3 className="font-bold uppercase text-xs tracking-wider">EXPONEN</h3>
                                <p>Que la PARTE VENDEDORA es propietaria de la vivienda sita en <span className="italic">Calle Ejemplo 123, Valencia</span>.</p>
                                <p>Que ambas partes han acordado la compraventa de dicho inmueble por el precio de <span className="font-bold font-mono">{(contract.variables.precio as number).toLocaleString("es-ES")} €</span>.</p>
                            </div>

                            {/* ESTIPULACIONES */}
                            <div className="space-y-4">
                                <h3 className="font-bold uppercase text-xs tracking-wider">ESTIPULACIONES</h3>

                                <div className="space-y-1">
                                    <h4 className="font-bold text-xs underline">PRIMERA. Objeto</h4>
                                    <p>El objeto del presente contrato es la compraventa de la finca descrita en el expositivo I.</p>
                                </div>

                                <div className="space-y-1 transition-all duration-500" style={{ backgroundColor: aiAction?.changes?.tipoArras ? "rgba(234, 179, 8, 0.1)" : "transparent" }}>
                                    <h4 className="font-bold text-xs underline flex items-center gap-2">
                                        SEGUNDA. Arras
                                        {aiAction?.changes?.tipoArras && <Badge className="h-4 text-[9px] bg-yellow-500/20 text-yellow-500 border-none">Modificado</Badge>}
                                    </h4>
                                    <p>
                                        La PARTE COMPRADORA entrega en este acto la cantidad de <span className="font-bold font-mono">{(contract.variables.cantidadArras || 30000).toLocaleString("es-ES")} €</span> en concepto de
                                        <span className={cn("font-bold mx-1", contract.variables.tipoArras === "penitenciales" ? "underline decoration-2 decoration-secondary" : "")}>
                                            ARRAS {String(contract.variables.tipoArras || "confirmatorias").toUpperCase()}
                                        </span>
                                        a cuenta del precio final.
                                    </p>
                                </div>

                                {/* Dynamic Block: Hipoteca */}
                                {(contract.variables.condicionHipotecaria || aiAction?.changes?.condicionHipotecaria) && (
                                    <div className="space-y-1 p-3 border-l-2 border-secondary bg-secondary/5 animate-in slide-in-from-left-2 duration-500">
                                        <h4 className="font-bold text-xs underline flex items-center gap-2">
                                            TERCERA. Condición Resolutoria (Hipoteca)
                                            <Badge variant="outline" className="h-4 text-[9px] border-secondary/30 text-secondary">
                                                <Wand2 className="h-2 w-2 mr-1" />
                                                Cláusula Dinámica
                                            </Badge>
                                        </h4>
                                        <p className="text-justify">
                                            La eficacia del presente contrato queda supeditada a la obtención por parte de la PARTE COMPRADORA de la financiación hipotecaria necesaria.
                                            En caso de no obtenerse dicha financiación en el plazo de <span className="font-bold">{aiAction?.changes?.plazoHipoteca || "30 días"}</span>,
                                            el contrato quedará resuelto devolviéndose las cantidades entregadas sin penalización.
                                        </p>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <h4 className="font-bold text-xs underline">CUARTA. Escritura Pública</h4>
                                    <p>La firma de la escritura pública de compraventa se realizará antes del día <span className="font-bold">{new Date(contract.variables.fechaFirma as string).toLocaleDateString("es-ES")}</span>.</p>
                                </div>
                            </div>

                            {/* Signing Section */}
                            <div className="mt-12 pt-8 border-t border-black/10 dark:border-white/10 grid grid-cols-2 gap-12">
                                <div className="space-y-8">
                                    <p className="font-bold text-xs uppercase">Por la Parte Vendedora</p>
                                    <div className="h-16 border-b border-dashed border-gray-400"></div>
                                    <p className="text-xs">{contract.variables.vendedor as string}</p>
                                </div>
                                <div className="space-y-8">
                                    <p className="font-bold text-xs uppercase">Por la Parte Compradora</p>
                                    <div className="h-16 border-b border-dashed border-gray-400"></div>
                                    <p className="text-xs">{contract.variables.comprador as string}</p>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </Card>

                {/* Right Panel: Tools & Voice (Fixed Width) */}
                <div className="flex flex-col gap-4">
                    {/* Voice Interaction Card */}
                    <Card className={cn("border-border/50 bg-card/60 backdrop-blur-sm transition-all duration-300", isRecording ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]" : "")}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center justify-between">
                                Voice-to-Action
                                {isRecording && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-center py-4">
                                <button
                                    onClick={startRecording}
                                    disabled={isRecording || isProcessing}
                                    className={cn(
                                        "h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 relative group",
                                        isRecording ? "bg-red-500/10 scale-110" : "bg-secondary/10 hover:bg-secondary/20 hover:scale-105"
                                    )}
                                >
                                    {isRecording ? (
                                        <>
                                            <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-20" />
                                            <div className="h-8 w-8 bg-red-500 rounded-sm" />
                                        </>
                                    ) : (
                                        <Mic className={cn("h-8 w-8", isProcessing ? "text-muted-foreground animate-pulse" : "text-secondary")} />
                                    )}
                                </button>
                            </div>

                            {/* Transcript Status */}
                            <div className="min-h-[60px] text-center">
                                {isRecording ? (
                                    <p className="text-sm text-muted-foreground animate-pulse">Escuchando...</p>
                                ) : isProcessing ? (
                                    <p className="text-sm text-secondary animate-pulse flex items-center justify-center gap-2">
                                        <Wand2 className="h-3 w-3" /> Procesando con IA...
                                    </p>
                                ) : transcript ? (
                                    <div className="rounded-lg bg-accent/30 p-3 text-xs italic text-muted-foreground border border-border/30">
                                        "{transcript}"
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground/60">
                                        Pulsa el micrófono para dictar cambios (ej: "Añade cláusula hipotecaria de 30 días")
                                    </p>
                                )}
                            </div>

                            {/* AI Action Proposal */}
                            {aiAction && (
                                <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-3 space-y-2">
                                        <div className="flex items-center gap-2 text-secondary font-semibold text-xs">
                                            <Wand2 className="h-3 w-3" />
                                            Acción Propuesta
                                        </div>
                                        <p className="text-xs">{aiAction.description}</p>
                                        <div className="flex items-center gap-2 pt-1">
                                            <Badge variant="outline" className="text-[10px] border-secondary/20 text-secondary bg-secondary/5">
                                                + Condición Hipotecaria
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px] border-secondary/20 text-secondary bg-secondary/5">
                                                ➜ Arras Penitenciales
                                            </Badge>
                                        </div>
                                    </div>
                                    <Button onClick={applyChanges} className="w-full h-8 text-xs bg-secondary hover:bg-secondary/90">
                                        Aplicar Cambios
                                    </Button>
                                    <Button onClick={() => setAiAction(null)} variant="ghost" className="w-full h-8 text-xs text-muted-foreground">
                                        Cancelar
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Variables Panel */}
                    <Card className="flex-1 flex flex-col border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
                        <div className="flex items-center gap-1 p-2 border-b border-border/30 overflow-x-auto">
                            <Button
                                variant={activeTab === "variables" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 text-xs flex-1"
                                onClick={() => setActiveTab("variables")}
                            >
                                <ChevronDown className="h-3 w-3 mr-1" />
                                Variables
                            </Button>
                            <Button
                                variant={activeTab === "history" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 text-xs flex-1 text-muted-foreground"
                                onClick={() => setActiveTab("history")}
                            >
                                <History className="h-3 w-3 mr-1" />
                                Historial
                            </Button>
                        </div>

                        <ScrollArea className="flex-1 p-4">
                            {activeTab === "variables" ? (
                                <div className="space-y-4">
                                    {Object.entries(contract.variables).map(([key, val]) => (
                                        <div key={key} className="space-y-1">
                                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type={typeof val === "number" ? "number" : "text"}
                                                    defaultValue={val.toString()}
                                                    className="w-full bg-accent/20 border border-border/30 rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-secondary/50"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <div className="pt-2">
                                        <Button variant="outline" size="sm" className="w-full text-xs h-7">
                                            + Añadir Variable
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="relative pl-4 border-l-2 border-border/30 space-y-6">
                                        {[...contract.versiones].reverse().map((v, i) => (
                                            <div key={v.version} className="relative">
                                                <div className="absolute -left-[21px] top-0 h-2.5 w-2.5 rounded-full bg-secondary border-2 border-background" />
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-bold font-mono">{v.version}</span>
                                                        <span className="text-[10px] text-muted-foreground">{new Date(v.fecha).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{v.descripcion}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </ScrollArea>
                    </Card>
                </div>
            </div>

            {/* Confetti (Success Feedback) */}
            {showConfetti && (
                <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
                    <div className="bg-[var(--urus-success)] text-white px-6 py-3 rounded-full shadow-lg animate-in fade-in zoom-in duration-300 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-semibold">¡Contrato actualizado correctamente!</span>
                    </div>
                </div>
            )}
        </div>
    );
}
