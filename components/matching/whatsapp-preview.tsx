"use client";

import { cn } from "@/lib/utils";
import { CheckCheck, MessageCircle, Phone, Video, Send, Loader2, Check, AlertTriangle } from "lucide-react";
import type { CruceMatch } from "@/components/matching/match-card";
import { useState, useCallback } from "react";

interface WhatsAppPreviewProps {
    match: CruceMatch;
    className?: string;
    onSent?: (matchId: string) => void;
}

export function WhatsAppPreview({ match, className, onSent }: WhatsAppPreviewProps) {
    const buyerFirst = match.comprador.nombre.split(" ")[0];
    const time = new Date(match.fechaMatch).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const zonaLabel = [match.propiedad.zona, match.propiedad.ciudad].filter(Boolean).join(", ");

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

    const messages = [
        {
            sender: "agent",
            text: `¡Hola ${buyerFirst}! Soy tu asesor en URUS Capital. Hemos encontrado una propiedad que encaja con lo que buscas.`,
            time,
        },
        {
            sender: "agent",
            text: [
                `*${match.propiedad.titulo || match.propiedad.ref}*`,
                `${match.propiedad.precio.toLocaleString("es-ES")} €`,
                `${match.propiedad.metros} m² · ${match.propiedad.habitaciones} hab · ${match.propiedad.banyos} baños`,
                zonaLabel ? `${zonaLabel}` : null,
                match.propiedad.tipoOfer ? `${match.propiedad.tipoOfer}` : null,
                `\nCoincidencia: ${match.porcentajeMatch}%`,
            ].filter(Boolean).join("\n"),
            time,
        },
        {
            sender: "agent",
            text: "¿Te gustaría programar una visita? Tenemos disponibilidad esta semana",
            time,
        },
    ];

    const hasTelefono = !!match.comprador.telefono;

    return (
        <div className={cn("rounded-xl overflow-hidden border border-border/30", className)}>
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

            <div
                className="p-3 space-y-2 min-h-[200px] max-h-[280px] overflow-y-auto"
                style={{
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                    backgroundColor: "color-mix(in oklch, var(--color-accent) 20%, transparent)",
                }}
            >
                {sendState === "sent" ? (
                    messages.map((msg, i) => (
                        <div key={i} className="flex justify-end">
                            <div className="bg-[#dcf8c6] dark:bg-[#005c4b] rounded-lg rounded-tr-sm px-3 py-1.5 max-w-[85%] shadow-sm">
                                <p className="text-[11px] text-foreground whitespace-pre-line leading-relaxed">{msg.text}</p>
                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                    <span className="text-[9px] text-muted-foreground">{msg.time}</span>
                                    <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    messages.map((msg, i) => (
                        <div key={i} className="flex justify-end">
                            <div className="bg-accent/40 dark:bg-accent/20 rounded-lg rounded-tr-sm px-3 py-1.5 max-w-[85%] shadow-sm border border-dashed border-border/30">
                                <p className="text-[11px] text-muted-foreground whitespace-pre-line leading-relaxed">{msg.text}</p>
                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                    <span className="text-[9px] text-muted-foreground/50">{msg.time}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
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
