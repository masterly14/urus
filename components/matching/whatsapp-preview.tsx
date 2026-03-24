"use client";

import { cn } from "@/lib/utils";
import { Check, CheckCheck, MessageCircle, Phone, Video } from "lucide-react";
import type { Match } from "@/lib/mock-data/types";

interface WhatsAppPreviewProps {
    match: Match;
    className?: string;
}

export function WhatsAppPreview({ match, className }: WhatsAppPreviewProps) {
    const buyerFirst = match.comprador.nombre.split(" ")[0];
    const time = new Date(match.fechaMatch).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    const messages = [
        {
            sender: "agent",
            text: `¡Hola ${buyerFirst}! 👋 Soy tu asesor en URUS Capital. Hemos encontrado una propiedad que encaja perfectamente con lo que buscas.`,
            time,
        },
        {
            sender: "agent",
            text: `📍 *${match.propiedad.direccion}*\n💰 ${match.propiedad.precio.toLocaleString("es-ES")} €\n📐 ${match.propiedad.metros} m² · ${match.propiedad.habitaciones} hab\n📌 Zona: ${match.propiedad.zona}\n\n✅ Coincidencia: ${match.porcentajeMatch}%`,
            time,
        },
        {
            sender: "agent",
            text: "¿Te gustaría programar una visita? Tenemos disponibilidad esta semana 🏠",
            time,
        },
    ];

    // Add buyer response based on message status
    const responseMap: Record<string, { text: string; time: string } | null> = {
        me_encaja: { text: "¡Me encanta! ¿Podemos verla el jueves? 🙌", time: `${parseInt(time) + 1}:15` },
        no_encaja: { text: "No es lo que busco, necesito algo más grande. Gracias.", time: `${parseInt(time) + 1}:22` },
        busco_diferente: { text: "Interesante, pero busco algo con terraza y en otra zona. ¿Tienen?", time: `${parseInt(time) + 2}:05` },
        enviado: null,
    };

    const buyerResponse = responseMap[match.estadoMensaje];

    return (
        <div className={cn("rounded-xl overflow-hidden border border-border/30", className)}>
            {/* WhatsApp header */}
            <div className="bg-[#075e54] dark:bg-[#1f2c34] px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-[#25D366]/30 flex items-center justify-center text-[10px] font-bold text-white">
                        {buyerFirst.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-white text-xs font-medium">{match.comprador.nombre}</p>
                        <p className="text-white/50 text-[10px]">
                            {match.estadoMensaje === "enviado" ? "en línea" : "visto por última vez hoy"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Video className="h-4 w-4 text-white/60" />
                    <Phone className="h-4 w-4 text-white/60" />
                </div>
            </div>

            {/* Chat body */}
            <div
                className="p-3 space-y-2 min-h-[200px] max-h-[280px] overflow-y-auto"
                style={{
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                    backgroundColor: "color-mix(in oklch, var(--color-accent) 20%, transparent)",
                }}
            >
                {messages.map((msg, i) => (
                    <div key={i} className="flex justify-end">
                        <div className="bg-[#dcf8c6] dark:bg-[#005c4b] rounded-lg rounded-tr-sm px-3 py-1.5 max-w-[85%] shadow-sm">
                            <p className="text-[11px] text-foreground whitespace-pre-line leading-relaxed">{msg.text}</p>
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                                <span className="text-[9px] text-muted-foreground">{msg.time}</span>
                                <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                            </div>
                        </div>
                    </div>
                ))}

                {buyerResponse && (
                    <div className="flex justify-start">
                        <div className="bg-card border border-border/30 rounded-lg rounded-tl-sm px-3 py-1.5 max-w-[85%] shadow-sm">
                            <p className="text-[11px] text-foreground leading-relaxed">{buyerResponse.text}</p>
                            <div className="flex items-center justify-end mt-0.5">
                                <span className="text-[9px] text-muted-foreground">{buyerResponse.time}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* WhatsApp input bar */}
            <div className="bg-[#f0f0f0] dark:bg-[#1f2c34] px-3 py-2 flex items-center gap-2">
                <div className="flex-1 bg-card/80 rounded-full px-3 py-1.5 border border-border/30">
                    <span className="text-[10px] text-muted-foreground">Escribe un mensaje...</span>
                </div>
                <div className="h-8 w-8 rounded-full bg-[#25D366] flex items-center justify-center">
                    <MessageCircle className="h-3.5 w-3.5 text-white" />
                </div>
            </div>
        </div>
    );
}
