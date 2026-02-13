"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Brain,
    Send,
    Sparkles,
    Clock,
    MessageSquare,
    Plus,
    Trash2,
    ArrowDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatBubble, TypingIndicator } from "@/components/coach/chat-bubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

interface Message {
    id: string;
    text: string;
    sender: "user" | "bot";
    timestamp: string;
}

interface Conversation {
    id: string;
    title: string;
    lastMessage: string;
    date: string;
    messages: Message[];
}

// ── Bot responses ─────────────────────────────────────────────

const botResponses: Record<string, string[]> = {
    default: [
        "Entiendo cómo te sientes. En el sector inmobiliario, es normal experimentar presión por los resultados. ¿Quieres que trabajemos en alguna técnica de gestión emocional?",
        "Eso es muy válido. Muchas veces la clave está en separar lo que podemos controlar de lo que no. ¿Has probado la técnica de los 3 círculos de influencia?",
        "Gracias por compartir eso conmigo. Reconocer cómo nos sentimos ya es un gran paso. ¿Te gustaría explorar juntos algunas estrategias?",
        "Lo que describes es bastante común entre comerciales de alto rendimiento. La buena noticia es que hay herramientas probadas que pueden ayudarte. ¿Empezamos?",
        "Cada día es una oportunidad nueva. Los grandes comerciales no son los que nunca caen, sino los que saben levantarse. ¿Qué tal si repasamos tus logros recientes?",
    ],
    motivacion: [
        "¡Gran actitud! 💪 Recuerda: cada \"no\" te acerca más a un \"sí\". Los datos muestran que los comerciales top contactan un 40% más que la media.\n\nAquí van 3 tips rápidos:\n1. Empieza el día con tu cliente más prometedor\n2. Celebra cada pequeña victoria\n3. Dedica 10 min al final del día a planificar mañana",
        "Tu energía es contagiosa 🌟 ¿Sabías que según nuestros datos, los comerciales que usan el coach regularmente tienen un 23% más de conversión? Estás en el camino correcto.",
    ],
    cierre: [
        "Para mejorar tu tasa de cierre, te recomiendo:\n\n📋 **Antes de la visita:** Investiga al comprador, su motivación real de compra.\n📞 **Durante:** Haz preguntas abiertas, escucha más de lo que hablas.\n🤝 **Cierre:** Usa la técnica del \"sí menor\" — confirma pequeños acuerdos antes del grande.\n\n¿Quieres que practiquemos algún escenario?",
        "El secreto del cierre efectivo está en la preparación. Los mejores comerciales de URUS dedican un 30% de su tiempo a preparar visitas. ¿Cómo estás distribuyendo tu tiempo actualmente?",
    ],
    estres: [
        "El estrés es una señal, no un enemigo. Vamos a trabajar juntos para convertirlo en energía productiva.\n\n🧘 **Técnica 5-4-3-2-1:**\n• 5 cosas que puedes ver\n• 4 cosas que puedes tocar\n• 3 cosas que puedes oír\n• 2 cosas que puedes oler\n• 1 cosa que puedes saborear\n\n¿Lo probamos ahora?",
        "Es importante reconocer el estrés temprano. ¿En una escala del 1 al 10, dónde dirías que estás hoy? Según tu historial, tus mejores semanas fueron cuando estabas en 4-5.",
    ],
    sentimiento: [
        "Me alegra que te tomes un momento para reflexionar. Tu bienestar emocional impacta directamente en tu rendimiento. ¿Cómo describirías tu estado emocional hoy?\n\n😊 Positivo y motivado\n😐 Neutral, con algo de cansancio\n😔 Desmotivado o agotado\n\nSea cual sea tu respuesta, aquí estoy para ayudarte.",
    ],
};

function getBotResponse(userMessage: string): string {
    const lower = userMessage.toLowerCase();
    if (lower.includes("motivac") || lower.includes("ánimo") || lower.includes("animo") || lower.includes("energía"))
        return botResponses.motivacion[Math.floor(Math.random() * botResponses.motivacion.length)];
    if (lower.includes("cierre") || lower.includes("venta") || lower.includes("cerrar") || lower.includes("tip"))
        return botResponses.cierre[Math.floor(Math.random() * botResponses.cierre.length)];
    if (lower.includes("estrés") || lower.includes("estres") || lower.includes("presión") || lower.includes("agotad"))
        return botResponses.estres[Math.floor(Math.random() * botResponses.estres.length)];
    if (lower.includes("sient") || lower.includes("cómo estoy") || lower.includes("como estoy") || lower.includes("emocion"))
        return botResponses.sentimiento[Math.floor(Math.random() * botResponses.sentimiento.length)];
    return botResponses.default[Math.floor(Math.random() * botResponses.default.length)];
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// ── Initial conversations ─────────────────────────────────────

const initialConversations: Conversation[] = [
    {
        id: "conv-1",
        title: "Sesión de Motivación",
        lastMessage: "¡Gran actitud! Recuerda que cada día es una oportunidad...",
        date: "Hoy",
        messages: [
            { id: "m1", text: "Hoy me siento un poco desmotivado con las ventas", sender: "user", timestamp: "09:15" },
            { id: "m2", text: "Entiendo cómo te sientes. En el sector inmobiliario, es normal experimentar altibajos. Lo importante es cómo gestionamos esos momentos. ¿Qué crees que te está generando esa desmotivación?", sender: "bot", timestamp: "09:15" },
            { id: "m3", text: "Llevo dos semanas sin cerrar ninguna operación", sender: "user", timestamp: "09:16" },
            { id: "m4", text: "Dos semanas pueden parecer mucho, pero miremos los datos: tu tasa de contacto efectiva ha subido un 12% este mes. Eso significa que estás haciendo bien el trabajo de base. Los cierres llegarán. ¿Quieres que repasemos tu pipeline actual?", sender: "bot", timestamp: "09:17" },
        ],
    },
    {
        id: "conv-2",
        title: "Tips de Cierre Efectivo",
        lastMessage: "Para mejorar tu tasa de cierre, te recomiendo...",
        date: "Ayer",
        messages: [
            { id: "m5", text: "Necesito consejos para cerrar con clientes indecisos", sender: "user", timestamp: "14:30" },
            { id: "m6", text: "Para mejorar tu tasa de cierre, te recomiendo:\n\n📋 **Antes de la visita:** Investiga al comprador, su motivación real de compra.\n📞 **Durante:** Haz preguntas abiertas, escucha más de lo que hablas.\n🤝 **Cierre:** Usa la técnica del \"sí menor\" — confirma pequeños acuerdos antes del grande.", sender: "bot", timestamp: "14:31" },
        ],
    },
    {
        id: "conv-3",
        title: "Gestión del Estrés",
        lastMessage: "La técnica 5-4-3-2-1 es muy efectiva...",
        date: "10 Feb",
        messages: [
            { id: "m7", text: "Estoy muy estresado con la presión de los objetivos", sender: "user", timestamp: "16:00" },
            { id: "m8", text: "El estrés es una señal, no un enemigo. Vamos a trabajar juntos para convertirlo en energía productiva.\n\n🧘 **Técnica 5-4-3-2-1:**\n• 5 cosas que puedes ver\n• 4 cosas que puedes tocar\n• 3 cosas que puedes oír\n• 2 cosas que puedes oler\n• 1 cosa que puedes saborear", sender: "bot", timestamp: "16:01" },
        ],
    },
];

// ── Quick Suggestions ─────────────────────────────────────────

const quickSuggestions = [
    { label: "¿Cómo me siento?", emoji: "💭" },
    { label: "Tips de cierre", emoji: "🎯" },
    { label: "Motivación", emoji: "💪" },
    { label: "Gestión del estrés", emoji: "🧘" },
];

// ── Main Component ────────────────────────────────────────────

export default function CoachChatPage() {
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
    const [activeConvId, setActiveConvId] = useState("conv-1");
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const activeConv = conversations.find((c) => c.id === activeConvId)!;

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [activeConv?.messages.length, isTyping, scrollToBottom]);

    const handleSend = useCallback(
        (text?: string) => {
            const messageText = text || input.trim();
            if (!messageText) return;

            const userMsg: Message = {
                id: `msg-${Date.now()}`,
                text: messageText,
                sender: "user",
                timestamp: formatTime(new Date()),
            };

            setConversations((prev) =>
                prev.map((c) =>
                    c.id === activeConvId
                        ? { ...c, messages: [...c.messages, userMsg], lastMessage: messageText, date: "Ahora" }
                        : c
                )
            );
            setInput("");
            setIsTyping(true);

            // Simulate bot response with delay
            const delay = 1500 + Math.random() * 2000;
            setTimeout(() => {
                const botMsg: Message = {
                    id: `msg-${Date.now()}-bot`,
                    text: getBotResponse(messageText),
                    sender: "bot",
                    timestamp: formatTime(new Date()),
                };
                setConversations((prev) =>
                    prev.map((c) =>
                        c.id === activeConvId
                            ? { ...c, messages: [...c.messages, botMsg], lastMessage: botMsg.text.slice(0, 50) + "..." }
                            : c
                    )
                );
                setIsTyping(false);
            }, delay);
        },
        [input, activeConvId]
    );

    const handleNewConversation = () => {
        const newConv: Conversation = {
            id: `conv-${Date.now()}`,
            title: "Nueva Conversación",
            lastMessage: "Inicia una conversación...",
            date: "Ahora",
            messages: [
                {
                    id: `msg-welcome-${Date.now()}`,
                    text: "¡Hola! 👋 Soy tu Coach IA de URUS Capital. Estoy aquí para ayudarte con motivación, gestión emocional y técnicas de venta. ¿En qué puedo ayudarte hoy?",
                    sender: "bot",
                    timestamp: formatTime(new Date()),
                },
            ],
        };
        setConversations((prev) => [newConv, ...prev]);
        setActiveConvId(newConv.id);
        inputRef.current?.focus();
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--urus-info)]/20 to-[var(--urus-info)]/5 flex items-center justify-center">
                    <Brain className="h-5 w-5 text-[var(--urus-info)]" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Chat del Coach</h1>
                    <p className="text-sm text-muted-foreground">
                        Asistente IA motivacional y de coaching comercial
                    </p>
                </div>
            </div>

            {/* Chat layout */}
            <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
                {/* Conversations Sidebar */}
                <Card
                    className={cn(
                        "border-border/50 bg-card/60 backdrop-blur-sm flex flex-col shrink-0 transition-all duration-300",
                        sidebarOpen ? "w-72" : "w-0 overflow-hidden border-0 p-0"
                    )}
                >
                    <CardHeader className="pb-3 shrink-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">Conversaciones</CardTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 rounded-lg hover:bg-accent/50"
                                onClick={handleNewConversation}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 flex-1 overflow-hidden px-2 pb-2">
                        <ScrollArea className="h-full">
                            <div className="space-y-1">
                                {conversations.map((conv) => (
                                    <button
                                        key={conv.id}
                                        onClick={() => setActiveConvId(conv.id)}
                                        className={cn(
                                            "w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 group",
                                            conv.id === activeConvId
                                                ? "bg-accent/40 border border-border/50"
                                                : "hover:bg-accent/20"
                                        )}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <MessageSquare className={cn(
                                                "h-3.5 w-3.5 shrink-0",
                                                conv.id === activeConvId ? "text-secondary" : "text-muted-foreground"
                                            )} />
                                            <p className="text-sm font-medium truncate">{conv.title}</p>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground truncate pl-5.5 leading-snug">
                                            {conv.lastMessage}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground/60 pl-5.5 mt-1">{conv.date}</p>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Chat Area */}
                <Card className="flex-1 border-border/50 bg-card/60 backdrop-blur-sm flex flex-col overflow-hidden">
                    {/* Chat header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 shrink-0">
                        <div className="flex items-center gap-3">
                            <button
                                className="lg:hidden"
                                onClick={() => setSidebarOpen((v) => !v)}
                            >
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <div className="relative">
                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[var(--urus-info)]/30 to-[var(--urus-info)]/10 flex items-center justify-center">
                                    <Sparkles className="h-4 w-4 text-[var(--urus-info)]" />
                                </div>
                                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[var(--urus-success)] border-2 border-card" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">Coach IA URUS</p>
                                <p className="text-[11px] text-[var(--urus-success)]">En línea</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                {activeConv.messages.length} mensajes
                            </Badge>
                        </div>
                    </div>

                    {/* Messages */}
                    <ScrollArea className="flex-1 px-5 py-4">
                        <div className="flex flex-col gap-3 min-h-full">
                            {activeConv.messages.map((msg, i) => (
                                <ChatBubble
                                    key={msg.id}
                                    message={msg.text}
                                    sender={msg.sender}
                                    timestamp={msg.timestamp}
                                    isNew={i === activeConv.messages.length - 1}
                                />
                            ))}
                            {isTyping && <TypingIndicator />}
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>

                    {/* Quick Suggestions */}
                    <div className="px-5 py-2 border-t border-border/20 shrink-0">
                        <div className="flex flex-wrap gap-2">
                            {quickSuggestions.map((s) => (
                                <button
                                    key={s.label}
                                    onClick={() => handleSend(s.label)}
                                    disabled={isTyping}
                                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border/50 bg-accent/20 hover:bg-accent/40 hover:border-secondary/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span>{s.emoji}</span>
                                    <span>{s.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Input */}
                    <div className="px-5 py-3 border-t border-border/30 shrink-0">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSend();
                            }}
                            className="flex items-center gap-2"
                        >
                            <div className="flex-1 relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Escribe un mensaje..."
                                    disabled={isTyping}
                                    className="w-full bg-accent/30 border border-border/50 rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary/50 transition-all disabled:opacity-50"
                                />
                            </div>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={!input.trim() || isTyping}
                                className="h-10 w-10 rounded-xl p-0 bg-gradient-to-br from-[var(--urus-info)] to-[var(--urus-info)]/70 hover:from-[var(--urus-info)]/90 hover:to-[var(--urus-info)]/60 disabled:opacity-30"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </Card>
            </div>
        </div>
    );
}
