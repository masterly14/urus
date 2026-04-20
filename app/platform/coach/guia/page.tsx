"use client";

import { useState, useEffect } from "react";
import {
    Brain,
    MessageCircle,
    Shield,
    Sparkles,
    Phone,
    CheckCircle2,
    XCircle,
    Clock,
    Heart,
    Lock,
    Save,
    Info,
    ChevronRight,
    LogIn,
    LogOut,
    Timer,
    LifeBuoy,
    Target,
    TrendingUp,
    Focus,
    Flame,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "coach_contact_number";

// ── Tipos de sesión ─────────────────────────────────────────────────────────
const flujos = [
    {
        icon: LifeBuoy,
        color: "var(--urus-danger)",
        label: "Bloqueado",
        description:
            "Miedo al cierre, inseguridad, presión por objetivos, fatiga o ego que te frena. El Coach identifica qué te tiene parado y te da una acción para los próximos 10 minutos.",
        ejemplos: ["no sé cómo decirle el precio", "llevo dos semanas sin cerrar", "estoy agotado"],
    },
    {
        icon: Target,
        color: "var(--urus-info)",
        label: "Preparar un cierre o visita",
        description:
            "Tienes un cierre, llamada o visita y quieres ir seguro. El Coach simula objeciones contigo y te da un ancla de confianza antes de entrar.",
        ejemplos: ["tengo un cierre en una hora", "cómo manejo si me dice que es caro", "voy a ver a un cliente difícil"],
    },
    {
        icon: Heart,
        color: "var(--urus-warning)",
        label: "Necesitas desahogarte",
        description:
            "Has tenido un mal día o perdiste una operación. El Coach escucha sin interrumpir con soluciones — a veces solo hace falta que alguien te entienda.",
        ejemplos: ["acabo de perder una operación", "qué semana de mierda", "el cliente me canceló a última hora"],
    },
    {
        icon: Focus,
        color: "var(--urus-success)",
        label: "Sin foco",
        description:
            "Todo parece urgente y no priorizas. El Coach te ayuda a elegir UNA sola acción para los próximos 30-60 minutos y salir del atasco mental.",
        ejemplos: ["no sé por dónde empezar", "tengo mil cosas y no arranco", "estoy disperso"],
    },
    {
        icon: TrendingUp,
        color: "var(--urus-gold)",
        label: "Quieres mejorar",
        description:
            "No hay ningún problema urgente, pero quieres crecer. El Coach propone un reto concreto y medible para esta semana.",
        ejemplos: ["cómo mejoro mi tasa de cierre", "analicemos la operación de ayer", "qué puedo trabajar"],
    },
    {
        icon: Flame,
        color: "var(--urus-info)",
        label: "Solo hablar",
        description:
            "A veces solo quieres un «¿qué tal?» y de ahí surge lo que necesitas. No hace falta llegar con un tema preparado.",
        ejemplos: ["hola", "aquí estoy", "buenas, cómo va esto"],
    },
];

const privacyItems = [
    {
        icon: Lock,
        title: "Datos anonimizados",
        description:
            "El equipo directivo solo ve métricas agregadas — energía media del equipo, número de sesiones, alertas generales. Tu nombre no aparece en ningún reporte.",
    },
    {
        icon: Shield,
        title: "Conversaciones privadas",
        description:
            "Solo tú tienes acceso al historial de tus conversaciones. Nadie del equipo directivo puede leer lo que has hablado con el Coach.",
    },
    {
        icon: Info,
        title: "Sin juicios",
        description:
            "El Coach no evalúa tu rendimiento ni reporta tu estado de ánimo a nadie. Es un espacio para ti.",
    },
];

// ── Chat bubble simulado ────────────────────────────────────────────────────

function WaBubble({
    text,
    side,
    label,
}: {
    text: string;
    side: "left" | "right";
    label?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-0.5", side === "right" ? "items-end" : "items-start")}>
            {label && (
                <span className="text-[10px] text-muted-foreground/60 px-1">{label}</span>
            )}
            <div
                className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    side === "right"
                        ? "bg-[var(--urus-info)]/15 border border-[var(--urus-info)]/20 text-foreground rounded-tr-sm"
                        : "bg-accent/40 border border-border/30 text-foreground rounded-tl-sm"
                )}
            >
                {text}
            </div>
        </div>
    );
}

export default function CoachGuiaPage() {
    const [contactNumber, setContactNumber] = useState("");
    const [savedNumber, setSavedNumber] = useState("");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY) ?? "";
        setContactNumber(stored);
        setSavedNumber(stored);
    }, []);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, contactNumber.trim());
        setSavedNumber(contactNumber.trim());
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const isDirty = contactNumber.trim() !== savedNumber;

    return (
        <div className="space-y-10 max-w-5xl">
            {/* ── Hero ── */}
            <div className="relative rounded-2xl overflow-hidden border border-[var(--urus-info)]/20 bg-gradient-to-br from-[var(--urus-info)]/10 via-card/60 to-card/40 backdrop-blur-sm p-8">
                <div
                    className="absolute inset-0 opacity-30 pointer-events-none"
                    style={{
                        background:
                            "radial-gradient(ellipse at 80% 20%, color-mix(in oklch, var(--urus-info) 25%, transparent) 0%, transparent 60%)",
                    }}
                />
                <div className="relative flex items-start gap-6">
                    <div className="h-16 w-16 shrink-0 rounded-2xl bg-gradient-to-br from-[var(--urus-info)]/30 to-[var(--urus-info)]/10 flex items-center justify-center shadow-lg">
                        <Brain className="h-8 w-8 text-[var(--urus-info)]" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h1 className="text-3xl font-bold tracking-tight">Coach Emocional</h1>
                            <Badge
                                variant="outline"
                                className="gap-1.5 text-xs border-[var(--urus-info)]/40 text-[var(--urus-info)]"
                            >
                                <Sparkles className="h-3 w-3" />
                                Activo 24/7 · WhatsApp
                            </Badge>
                        </div>
                        <p className="text-muted-foreground leading-relaxed max-w-2xl">
                            Tu acompañante en el trabajo. No es un bot motivacional ni un terapeuta.
                            Es alguien que entiende lo que es vender pisos en España — la presión de
                            un cierre de 300.000€, los clientes indecisos, los días en que no arranca nada.
                        </p>
                        <div className="flex items-center gap-6 mt-5 flex-wrap">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4 text-[var(--urus-success)]" />
                                <span>Disponible 24 horas</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Shield className="h-4 w-4 text-[var(--urus-info)]" />
                                <span>100% confidencial</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MessageCircle className="h-4 w-4 text-secondary" />
                                <span>Mismo número de WhatsApp de URUS</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Cómo funciona: activación ── */}
            <section>
                <div className="flex items-center gap-2 mb-1">
                    <div className="h-1 w-4 rounded-full bg-[var(--urus-info)]" />
                    <h2 className="text-lg font-semibold">Cómo se activa</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-5 pl-6">
                    El Coach vive en el mismo número de WhatsApp de URUS. Para activarlo, el primer
                    mensaje tiene que empezar con la palabra <span className="font-mono font-semibold bg-accent/50 px-1.5 py-0.5 rounded text-foreground">coach</span>.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Conversation demo */}
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <div className="h-8 w-8 rounded-full bg-[var(--urus-info)]/20 flex items-center justify-center">
                                        <Brain className="h-4 w-4 text-[var(--urus-info)]" />
                                    </div>
                                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--urus-success)] border-2 border-card" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Coach URUS</p>
                                    <p className="text-[11px] text-[var(--urus-success)]">En línea</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                            <WaBubble
                                text="coach tengo un cierre en dos horas y estoy nervioso"
                                side="right"
                                label="Tú"
                            />
                            <WaBubble
                                text="Buenas. Esto queda entre nosotros, nadie más ve esta conversación. Cuéntame, ¿qué te ronda?"
                                side="left"
                                label="Coach"
                            />
                            <WaBubble
                                text="es que el cliente siempre me dice que lo tiene que hablar con su mujer"
                                side="right"
                            />
                            <WaBubble
                                text='Vale. Esa objeción de "lo hablo con mi pareja" casi nunca es un no — es una demora. ¿Has confirmado que ella también viene a la visita o va solo él?'
                                side="left"
                            />
                        </CardContent>
                    </Card>

                    {/* Rules */}
                    <div className="space-y-3">
                        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                            <CardContent className="p-4 flex items-start gap-3">
                                <div className="h-9 w-9 shrink-0 rounded-xl bg-[var(--urus-info)]/15 flex items-center justify-center">
                                    <LogIn className="h-4 w-4 text-[var(--urus-info)]" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Para activar</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        Empieza el mensaje con{" "}
                                        <span className="font-mono font-semibold bg-accent/50 px-1 rounded">coach</span>
                                        {" "}seguido de lo que necesitas, o simplemente{" "}
                                        <span className="font-mono font-semibold bg-accent/50 px-1 rounded">coach</span>{" "}
                                        solo. La sesión se abre automáticamente.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                            <CardContent className="p-4 flex items-start gap-3">
                                <div className="h-9 w-9 shrink-0 rounded-xl bg-[var(--urus-success)]/15 flex items-center justify-center">
                                    <Timer className="h-4 w-4 text-[var(--urus-success)]" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Sesión activa</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        Una vez activado, todos tus mensajes van al Coach durante{" "}
                                        <span className="font-semibold text-foreground">30 minutos</span>{" "}
                                        desde el último mensaje. No hace falta escribir{" "}
                                        <span className="font-mono font-semibold bg-accent/50 px-1 rounded">coach</span>{" "}
                                        en cada mensaje.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                            <CardContent className="p-4 flex items-start gap-3">
                                <div className="h-9 w-9 shrink-0 rounded-xl bg-[var(--urus-danger)]/15 flex items-center justify-center">
                                    <LogOut className="h-4 w-4 text-[var(--urus-danger)]" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Para cerrar la sesión</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        Escribe{" "}
                                        <span className="font-mono font-semibold bg-accent/50 px-1 rounded">salir</span>{" "}
                                        en cualquier momento. El Coach responde:{" "}
                                        <span className="italic text-foreground/70">
                                            «Venga, aquí estamos cuando necesites. Dale caña.»
                                        </span>{" "}
                                        y la sesión se cierra.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                            <CardContent className="p-4 flex items-start gap-3">
                                <div className="h-9 w-9 shrink-0 rounded-xl bg-[var(--urus-warning)]/15 flex items-center justify-center">
                                    <MessageCircle className="h-4 w-4 text-[var(--urus-warning)]" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Mismo número, contextos separados</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        El número de WhatsApp es el mismo que usa URUS para comunicaciones
                                        con compradores. El sistema detecta automáticamente si el mensaje
                                        va al Coach o a otro flujo.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* ── Modos del Coach ── */}
            <section>
                <div className="flex items-center gap-2 mb-1">
                    <div className="h-1 w-4 rounded-full bg-secondary" />
                    <h2 className="text-lg font-semibold">Qué detecta el Coach en tu mensaje</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-5 pl-6">
                    No hace falta decirle qué tipo de ayuda necesitas. El Coach clasifica tu mensaje
                    automáticamente y adapta la conversación. Puede cambiar de modo dentro de la
                    misma sesión si cambias de tema.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {flujos.map((flujo) => {
                        const Icon = flujo.icon;
                        return (
                            <Card
                                key={flujo.label}
                                className="border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 group"
                            >
                                <CardContent className="p-5">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div
                                            className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                                            style={{
                                                background: `color-mix(in oklch, ${flujo.color} 15%, transparent)`,
                                            }}
                                        >
                                            <Icon className="h-4 w-4" style={{ color: flujo.color }} />
                                        </div>
                                        <p className="text-sm font-semibold">{flujo.label}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                                        {flujo.description}
                                    </p>
                                    <div className="space-y-1">
                                        {flujo.ejemplos.map((e) => (
                                            <div
                                                key={e}
                                                className="flex items-center gap-2 rounded-lg bg-accent/20 px-2.5 py-1.5 border border-border/20"
                                            >
                                                <MessageCircle
                                                    className="h-2.5 w-2.5 shrink-0"
                                                    style={{ color: flujo.color }}
                                                />
                                                <span className="text-[11px] text-muted-foreground italic">
                                                    «{e}»
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            {/* ── Lo que sabe de ti ── */}
            <section>
                <div className="flex items-center gap-2 mb-1">
                    <div className="h-1 w-4 rounded-full bg-[var(--urus-warning)]" />
                    <h2 className="text-lg font-semibold">Lo que el Coach sabe de ti</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-5 pl-6">
                    Al activarse, el Coach carga tu contexto del CRM en tiempo real. Lo usa de forma
                    natural — nunca te dirá «según mis datos» ni que tiene acceso a tus cifras.
                </p>
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                {
                                    color: "var(--urus-info)",
                                    label: "Cierres pendientes hoy",
                                    detail:
                                        "Visitas programadas y operaciones en estado ARRAS o PENDIENTE_FIRMA. Si tienes un cierre hoy y estás nervioso, el Coach puede mencionarlo.",
                                },
                                {
                                    color: "var(--urus-danger)",
                                    label: "Operación perdida recientemente",
                                    detail:
                                        "Si en los últimos 14 días se canceló alguna operación tuya. El Coach lo tiene en cuenta si parece afectarte, pero no lo saca él primero.",
                                },
                                {
                                    color: "var(--urus-success)",
                                    label: "Racha positiva",
                                    detail:
                                        "Si tienes 2 o más cierres en los últimos 30 días. El Coach puede usarlo como ancla de confianza cuando lo necesites.",
                                },
                                {
                                    color: "var(--urus-gold)",
                                    label: "Tu nombre y ciudad",
                                    detail:
                                        "Sabe cómo te llamas y dónde operas (Córdoba, Málaga, Sevilla). Lo usa cuando ya lleváis varios turnos de conversación.",
                                },
                            ].map((item) => (
                                <div
                                    key={item.label}
                                    className="flex items-start gap-3 rounded-xl p-3.5 border border-border/30 bg-accent/10"
                                >
                                    <div
                                        className="h-2 w-2 rounded-full mt-1.5 shrink-0"
                                        style={{ background: item.color }}
                                    />
                                    <div>
                                        <p className="text-sm font-medium">{item.label}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                            {item.detail}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* ── Cómo habla ── */}
            <section>
                <div className="flex items-center gap-2 mb-1">
                    <div className="h-1 w-4 rounded-full bg-[var(--urus-info)]" />
                    <h2 className="text-lg font-semibold">Cómo habla el Coach</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-5 pl-6">
                    No esperes frases de LinkedIn ni motivación vacía.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-[var(--urus-success)]/20 bg-[var(--urus-success)]/5">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-[var(--urus-success)]" />
                                <CardTitle className="text-sm font-semibold text-[var(--urus-success)]">
                                    Así sí habla
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-2">
                            {[
                                "«Mira, si todo es urgente, nada es urgente. ¿Qué de eso tiene consecuencias hoy?»",
                                "«Dos semanas sin cerrar no son una racha mala, son datos. ¿Qué ha pasado en cada visita?»",
                                "«Para. Respira. ¿Qué es lo peor que puede pasar si dices el precio?»",
                                "«Venga, aquí estamos cuando necesites. Dale caña.»",
                            ].map((phrase) => (
                                <div
                                    key={phrase}
                                    className="rounded-lg bg-card/60 border border-[var(--urus-success)]/15 px-3.5 py-2.5"
                                >
                                    <p className="text-sm text-muted-foreground italic">{phrase}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border-[var(--urus-danger)]/20 bg-[var(--urus-danger)]/5">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-[var(--urus-danger)]" />
                                <CardTitle className="text-sm font-semibold text-[var(--urus-danger)]">
                                    Así NO habla
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-2">
                            {[
                                "«¡Ánimo, tú puedes! Recuerda que eres valioso.»",
                                "«Entiendo perfectamente cómo te sientes en este momento.»",
                                "«Aquí tienes 5 tips para mejorar tu comunicación asertiva:»",
                                "«¡Genial! Sin duda, absolutamente, por supuesto.»",
                            ].map((phrase) => (
                                <div
                                    key={phrase}
                                    className="rounded-lg bg-card/60 border border-[var(--urus-danger)]/15 px-3.5 py-2.5"
                                >
                                    <p className="text-sm text-muted-foreground italic line-through opacity-60">
                                        {phrase}
                                    </p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* ── Qué puede y no puede hacer ── */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <div className="h-1 w-4 rounded-full bg-secondary" />
                    <h2 className="text-lg font-semibold">Qué puede (y qué no puede) hacer</h2>
                </div>
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3">
                            {[
                                { type: "can", label: "Apoyo emocional sin tecnicismos de terapia" },
                                { type: "can", label: "Simulaciones de objeciones antes de un cierre" },
                                { type: "can", label: "Técnicas de desbloqueo en 2-5 minutos" },
                                { type: "can", label: "Retos concretos y medibles para esta semana" },
                                { type: "can", label: "Usar tu contexto del CRM de forma natural" },
                                { type: "cannot", label: "Diagnósticos clínicos o tratamientos médicos" },
                                { type: "cannot", label: "Reemplazar a un psicólogo o terapeuta" },
                                { type: "cannot", label: "Acceder a datos de operaciones o comisiones" },
                            ].map((item, i) => {
                                const isCan = item.type === "can";
                                return (
                                    <div key={i} className="flex items-start gap-3 py-1">
                                        {isCan ? (
                                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[var(--urus-success)]" />
                                        ) : (
                                            <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-[var(--urus-danger)]" />
                                        )}
                                        <span
                                            className={cn(
                                                "text-sm",
                                                isCan ? "text-foreground" : "text-muted-foreground"
                                            )}
                                        >
                                            {item.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* ── Privacidad ── */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <div className="h-1 w-4 rounded-full bg-[var(--urus-success)]" />
                    <h2 className="text-lg font-semibold">Privacidad y confidencialidad</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {privacyItems.map((item, i) => {
                        const Icon = item.icon;
                        return (
                            <Card
                                key={i}
                                className="border-[var(--urus-success)]/20 bg-[var(--urus-success)]/5"
                            >
                                <CardContent className="p-5">
                                    <div className="h-10 w-10 rounded-xl bg-[var(--urus-success)]/15 flex items-center justify-center mb-3">
                                        <Icon className="h-5 w-5 text-[var(--urus-success)]" />
                                    </div>
                                    <p className="text-sm font-semibold mb-1">{item.title}</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {item.description}
                                    </p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            {/* ── Número de contacto ── */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <div className="h-1 w-4 rounded-full bg-[var(--urus-warning)]" />
                    <h2 className="text-lg font-semibold">Número de WhatsApp del Coach</h2>
                </div>
                <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <CardTitle className="text-base font-semibold">
                                    Número de contacto
                                </CardTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Número que verán los comerciales para iniciar la conversación.
                                    Incluye código de país (ej.{" "}
                                    <span className="font-mono text-xs bg-accent/40 px-1.5 py-0.5 rounded">
                                        +34 612 345 678
                                    </span>
                                    ).
                                </p>
                            </div>
                            {savedNumber && (
                                <Badge
                                    variant="outline"
                                    className="shrink-0 gap-1.5 text-xs border-[var(--urus-success)]/40 text-[var(--urus-success)] bg-[var(--urus-success)]/5"
                                >
                                    <CheckCircle2 className="h-3 w-3" />
                                    Configurado
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex gap-3 items-center flex-wrap sm:flex-nowrap">
                            <div className="relative flex-1 min-w-0">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="tel"
                                    value={contactNumber}
                                    onChange={(e) => setContactNumber(e.target.value)}
                                    placeholder="+34 612 345 678"
                                    className="w-full bg-accent/30 border border-border/50 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[var(--urus-warning)]/30 focus:border-[var(--urus-warning)]/50 transition-all"
                                />
                            </div>
                            <Button
                                onClick={handleSave}
                                disabled={!isDirty && !saved}
                                className={cn(
                                    "shrink-0 gap-2 rounded-xl transition-all duration-300",
                                    saved
                                        ? "bg-[var(--urus-success)] hover:bg-[var(--urus-success)]/90 text-white"
                                        : "bg-[var(--urus-warning)] hover:bg-[var(--urus-warning)]/90 text-black"
                                )}
                            >
                                {saved ? (
                                    <>
                                        <CheckCircle2 className="h-4 w-4" />
                                        Guardado
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4" />
                                        Guardar
                                    </>
                                )}
                            </Button>
                        </div>

                        {savedNumber && (
                            <div className="mt-4 rounded-xl border border-[var(--urus-info)]/20 bg-[var(--urus-info)]/5 px-4 py-3 flex items-center gap-3">
                                <div className="h-8 w-8 shrink-0 rounded-lg bg-[var(--urus-info)]/15 flex items-center justify-center">
                                    <MessageCircle className="h-4 w-4 text-[var(--urus-info)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground">Número activo</p>
                                    <p className="text-sm font-semibold font-mono text-[var(--urus-info)] mt-0.5">
                                        {savedNumber}
                                    </p>
                                </div>
                                <a
                                    href={`https://wa.me/${savedNumber.replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-xs text-[var(--urus-info)] hover:text-[var(--urus-info)]/80 flex items-center gap-1 transition-colors"
                                >
                                    Probar
                                    <ChevronRight className="h-3 w-3" />
                                </a>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
