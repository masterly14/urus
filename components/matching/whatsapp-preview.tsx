"use client";

import { cn } from "@/lib/utils";
import { CheckCheck, Phone, Video, Send, Loader2, Check, AlertTriangle, Reply } from "lucide-react";
import type { CruceMatch } from "@/components/matching/match-card";
import { useState, useCallback } from "react";

interface WhatsAppPreviewProps {
    match: CruceMatch;
    className?: string;
    onSent?: (matchId: string) => void;
}

const QUICK_REPLIES = [
    { label: "Me encaja", icon: "👍" },
    { label: "No me encaja", icon: "👎" },
    { label: "Busco algo diferente", icon: "🔄" },
] as const;

export function WhatsAppPreview({ match, className, onSent }: WhatsAppPreviewProps) {
    const buyerFirst = match.comprador.nombre.split(" ")[0];
    const time = new Date(match.fechaMatch).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">(
        match.whatsappEnviado ? "sent" : "idle"
    );
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSend = useCallback(async () => {
        if (sendState === "sending" || sendState === "sent") return;
        setSendState("sending");
        setErrorMsg(null);

        try {
            const res = await fetch(`/api/matching/cruces/${match.id}/send`, {
                method: "POST",
            });
            const data = await res.json();

            if (res.ok && data.ok) {
                setSendState("sent");
                onSent?.(match.id);
            } else {
                setSendState("error");
                setErrorMsg(data.error ?? "Error desconocido");
            }
        } catch {
            setSendState("error");
            setErrorMsg("Error de red. Inténtalo de nuevo.");
        }
    }, [match.id, sendState, onSent]);

    const templateText = [
        `Hola ${buyerFirst}, somos Urus Capital Group`,
        "",
        "Hace tiempo trabajaste con nosotros y hemos captado una nueva propiedad que encaja con lo que buscabas.",
        "",
        `Ver inmueble: https://inmueble.com`,
        "",
        "Te encaja?",
    ].join("\n");

    const isSent = sendState === "sent";
    const bubbleBg = isSent
        ? "bg-[#dcf8c6] dark:bg-[#005c4b]"
        : "bg-accent/40 dark:bg-accent/20 border border-dashed border-border/30";
    const textColor = isSent ? "text-foreground" : "text-muted-foreground";

    const hasTelefono = !!match.comprador.telefono;

    return (
        <div className={cn("rounded-lg overflow-hidden border border-border/30", className)}>
            {/* Header */}
            <div className="bg-[#075e54] dark:bg-[#1f2c34] px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-[#25D366]/30 flex items-center justify-center text-[10px] font-bold text-white">
                        {buyerFirst.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-white text-xs font-medium">{match.comprador.nombre}</p>
                        <p className="text-white/50 text-[10px]">
                            {hasTelefono ? match.comprador.telefono : "Sin teléfono"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Video className="h-4 w-4 text-white/60" />
                    <Phone className="h-4 w-4 text-white/60" />
                </div>
            </div>

            {/* Chat area */}
            <div
                className="p-3 space-y-2.5 min-h-[220px] max-h-[340px] overflow-y-auto"
                style={{
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                    backgroundColor: "color-mix(in oklch, var(--color-accent) 20%, transparent)",
                }}
            >
                {/* Template message bubble */}
                <div className="flex justify-end">
                    <div className={cn("rounded-lg rounded-tr-sm px-3 py-2 max-w-[88%] shadow-sm", bubbleBg)}>
                        <p className={cn("text-[11px] font-semibold leading-relaxed", textColor)}>
                            Hola {buyerFirst}, somos Urus Capital Group
                        </p>
                        <p className={cn("text-[11px] whitespace-pre-line leading-relaxed mt-1.5", textColor)}>
                            Hace tiempo trabajaste con nosotros y hemos captado una nueva propiedad que encaja con lo que buscabas.
                        </p>
                        <p className={cn("text-[11px] mt-2", isSent ? "text-[#027eb5]" : "text-blue-400/70")}>
                            Ver inmueble: <span className="underline">https://inmueble.com</span>
                        </p>
                        <p className={cn("text-[11px] mt-2 leading-relaxed", textColor)}>
                            Te encaja?
                        </p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[9px] text-muted-foreground">{time}</span>
                            {isSent && <CheckCheck className="h-3 w-3 text-[#53bdeb]" />}
                        </div>
                    </div>
                </div>

                {/* Quick reply buttons */}
                <div className="flex flex-wrap justify-end gap-1.5">
                    {QUICK_REPLIES.map((qr) => (
                        <div
                            key={qr.label}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium shadow-sm",
                                isSent
                                    ? "bg-white dark:bg-[#233138] border border-[#25D366]/30 text-[#075e54] dark:text-[#25D366]"
                                    : "bg-accent/30 border border-dashed border-border/30 text-muted-foreground",
                            )}
                        >
                            <span>{qr.icon}</span>
                            <span>{qr.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Template badge */}
            <div className="px-3 py-1.5 bg-accent/20 border-t border-border/20 flex items-center gap-1.5">
                <Reply className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-[9px] text-muted-foreground/70">
                    Plantilla Meta: <span className="font-mono font-medium">match</span> · 2 variables · 3 quick replies
                </span>
            </div>

            {/* Send action bar */}
            <div className="bg-[#f0f0f0] dark:bg-[#1f2c34] px-3 py-2.5">
                {sendState === "sent" ? (
                    <div className="flex items-center justify-center gap-2 py-1">
                        <Check className="h-4 w-4 text-[#25D366]" />
                        <span className="text-xs font-medium text-[#25D366]">Mensaje enviado al comprador</span>
                    </div>
                ) : sendState === "error" ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 justify-center">
                            <AlertTriangle className="h-3.5 w-3.5 text-[var(--urus-danger)]" />
                            <span className="text-[11px] text-[var(--urus-danger)]">{errorMsg}</span>
                        </div>
                        <button
                            onClick={handleSend}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-medium transition-colors"
                        >
                            <Send className="h-3.5 w-3.5" />
                            Reintentar envío
                        </button>
                    </div>
                ) : !hasTelefono ? (
                    <div className="flex items-center justify-center gap-2 py-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-[var(--urus-warning)]" />
                        <span className="text-[11px] text-[var(--urus-warning)]">Sin teléfono — no se puede enviar</span>
                    </div>
                ) : (
                    <button
                        onClick={handleSend}
                        disabled={sendState === "sending"}
                        className={cn(
                            "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-xs font-medium transition-all",
                            sendState === "sending"
                                ? "bg-[#25D366]/60 cursor-not-allowed"
                                : "bg-[#25D366] hover:bg-[#20bd5a] hover:shadow-md active:scale-[0.98]",
                        )}
                    >
                        {sendState === "sending" ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <Send className="h-3.5 w-3.5" />
                                Enviar WhatsApp al comprador
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
