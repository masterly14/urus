"use client";

import { Fragment, useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Home,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TemplateMessageCard } from "@/components/conversations/template-message-card";
import { useConversation, useConversations } from "@/lib/hooks/use-conversations";
import { cloudinaryAudioMp3DeliveryUrl } from "@/lib/cloudinary/audio-playback-url";
import { cn } from "@/lib/utils";

type Direction = "all" | "inbound" | "outbound";

function initialsFrom(value: string | null | undefined, fallback: string): string {
  const source = (value ?? fallback).trim();
  if (!source) return "?";
  const words = source
    .replace(/^\+/, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return source.slice(-2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function Avatar({
  name,
  waId,
  size = "md",
}: {
  name: string | null;
  waId: string;
  size?: "sm" | "md";
}) {
  const initials = initialsFrom(name, waId);
  const sizeClasses = size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-sm";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium bg-accent text-foreground border border-border/50",
        sizeClasses,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelative(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return formatTime(value);
  }
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function conversationTitle(conversation: {
  ownerName: string | null;
  displayName: string | null;
  waId: string;
}) {
  return conversation.ownerName ?? conversation.displayName ?? `+${conversation.waId}`;
}

function formatMoney(value: number | null): string | null {
  if (value == null) return null;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeWhatsAppBoldMarkers(text: string): string {
  // Backward compatibility: if an old message came with **texto**, normalize it
  // to the current canonical format *texto* before rendering.
  return text.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
}

function renderLineWithSingleAsteriskBold(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const boldPattern = /\*([^*\n]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = boldPattern.exec(line)) !== null) {
    const [fullMatch, boldText] = match;
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong key={`bold-${match.index}`} className="font-semibold text-foreground">
        {boldText}
      </strong>,
    );
    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [line];
}

function renderMessageText(text: string): ReactNode {
  const normalized = normalizeWhatsAppBoldMarkers(text);
  const lines = normalized.split("\n");
  return lines.map((line, index) => (
    <Fragment key={`line-${index}`}>
      {renderLineWithSingleAsteriskBold(line)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

type AudioSource = { src: string; type: string };

/** Fuentes para `<audio>`: MP3 vía Cloudinary primero (OGG/Opus de WhatsApp falla en Safari). */
function audioSourcesFromPayload(payload: unknown): AudioSource[] | null {
  const record = asRecord(payload);
  if (!record) return null;
  const audio = asRecord(record.audio);
  if (!audio) return null;
  const mime =
    typeof audio.mime_type === "string" && audio.mime_type.trim()
      ? audio.mime_type.trim()
      : "audio/ogg";
  const cloudinaryUrl =
    typeof audio.cloudinaryUrl === "string" ? audio.cloudinaryUrl : null;
  if (cloudinaryUrl) {
    return [
      { src: cloudinaryAudioMp3DeliveryUrl(cloudinaryUrl), type: "audio/mpeg" },
      { src: cloudinaryUrl, type: mime },
    ];
  }
  const link = typeof audio.link === "string" ? audio.link : null;
  if (link) return [{ src: link, type: mime }];
  return null;
}

export function ConversationsClient() {
  const searchParams = useSearchParams();
  const waIdParam = searchParams.get("waId")?.trim() ?? null;
  const initialQuery = searchParams.get("q")?.trim() ?? waIdParam ?? "";
  const [q, setQ] = useState(initialQuery);
  const [direction, setDirection] = useState<Direction>("all");
  const [agentOnly, setAgentOnly] = useState(false);
  const [selectedWaId, setSelectedWaId] = useState<string | null>(waIdParam);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(false); // Default closed for cleaner chat view

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      direction,
      agentOnly,
      limit: 50,
    }),
    [agentOnly, direction, q],
  );

  const {
    conversations,
    isLoading: loadingList,
    error: listError,
    refetch,
  } = useConversations(filters);

  useEffect(() => {
    if (!waIdParam) return;
    setSelectedWaId((current) => current ?? waIdParam);
    setQ((current) => current || waIdParam);
  }, [waIdParam]);

  const activeWaId = conversations.some((conversation) => conversation.waId === selectedWaId)
    ? selectedWaId
    : conversations[0]?.waId ?? null;

  const {
    messages,
    context,
    isLoading: loadingMessages,
    error: detailError,
  } = useConversation(activeWaId, direction);

  const selected = conversations.find((conversation) => conversation.waId === activeWaId) ?? null;
  const sentCount = context.selections.reduce(
    (total, selection) => total + selection.properties.length,
    0,
  );
  const hasContextData = Boolean(context.demand) || context.selections.length > 0;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, activeWaId]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] min-h-0 max-w-[1600px] flex-col gap-4 overflow-hidden">
      {/* Header & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Conversaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historial de mensajes, trazas operativas y Coach emocional.
          </p>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-border/60 bg-card p-1.5 shadow-sm">
          <div className="relative min-w-[200px]">
            <label htmlFor="conversation-search" className="sr-only">
              Buscar conversaciones
            </label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="conversation-search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Buscar por nombre, teléfono o mensaje"
              className="h-8 w-full rounded-md bg-transparent pl-8 pr-3 text-sm outline-none transition-colors focus:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          
          <div className="h-5 w-px bg-border/60 mx-1" />
          
          <select
            aria-label="Filtrar por dirección del mensaje"
            value={direction}
            onChange={(event) => setDirection(event.target.value as Direction)}
            className="h-8 cursor-pointer rounded-md bg-transparent px-2 text-sm outline-none transition-colors focus:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Todos</option>
            <option value="inbound">Entrantes</option>
            <option value="outbound">Salientes</option>
          </select>

          <div className="h-5 w-px bg-border/60 mx-1" />

          <button
            type="button"
            onClick={() => setAgentOnly(!agentOnly)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              agentOnly
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            aria-pressed={agentOnly}
          >
            <Sparkles className="size-3.5" />
            Solo IA
          </button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground ml-1"
            title="Actualizar"
            aria-label="Actualizar conversaciones"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Main Chat Interface */}
      <Card className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden border-border/60 shadow-sm">
        {/* Left Panel: Conversation List */}
        {!listCollapsed && (
          <aside className="flex min-h-0 w-[min(420px,42vw)] min-w-[320px] shrink-0 flex-col overflow-hidden border-r border-border/60 bg-card">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-5">
              <span className="text-sm font-semibold text-foreground">Conversaciones</span>
              <button
                type="button"
                onClick={() => setListCollapsed(true)}
                className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Colapsar lista"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </div>

            {listError ? (
              <p className="shrink-0 px-5 py-3 text-xs text-destructive bg-destructive/10">{listError}</p>
            ) : null}

            <ScrollArea className="min-h-0 flex-1 overflow-hidden" aria-label="Lista de conversaciones">
              {!loadingList && conversations.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <div className="space-y-2">
                    <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">No hay conversaciones</p>
                    <p className="text-xs text-muted-foreground">
                      Ajusta los filtros o actualiza la bandeja.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="flex flex-col">
                  {conversations.map((conversation) => {
                    const isActive = activeWaId === conversation.waId;
                    return (
                      <li key={conversation.waId}>
                        <button
                          type="button"
                          onClick={() => setSelectedWaId(conversation.waId)}
                          className={cn(
                            "flex w-full items-start gap-3.5 border-b border-border/20 px-5 py-4 text-left transition-colors last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            isActive ? "bg-accent" : "hover:bg-accent/50",
                          )}
                        >
                          <Avatar
                            name={conversationTitle(conversation)}
                            waId={conversation.waId}
                          />
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <p className="truncate text-[14px] font-semibold text-foreground">
                                {conversationTitle(conversation)}
                              </p>
                              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                                {formatRelative(conversation.lastMessageAt)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                              {conversation.lastDirection === "outbound" && (
                                <span className="text-primary/70 mr-1 font-medium">Tú:</span>
                              )}
                              {conversation.lastMessagePreview}
                            </p>
                            {conversation.hasAgentMessages && (
                              <Badge variant="ai" className="mt-2.5 h-5 rounded-md px-1.5 text-[10px]">
                                <Sparkles className="size-3" />
                                IA Activa
                              </Badge>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </aside>
        )}

        {/* Center Panel: Chat Area */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background relative">
          {/* Chat Header */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-card/50 backdrop-blur-sm px-4 z-10">
            <div className="flex items-center gap-3 min-w-0">
              {listCollapsed && (
                <button
                  type="button"
                  onClick={() => setListCollapsed(false)}
                  className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Expandir lista"
                >
                  <PanelLeftOpen className="size-4" />
                </button>
              )}

              {selected ? (
                <>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {conversationTitle(selected)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      +{selected.waId} {selected.relationLabel ? `· ${selected.relationLabel}` : ""}
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            {selected && (
              <div className="flex items-center gap-2 shrink-0">
                {context.demand?.leadStatus && (
                  <Badge variant="secondary" className="hidden sm:inline-flex bg-accent font-normal">
                    {context.demand.leadStatus}
                  </Badge>
                )}
                <Button
                  variant={contextOpen ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setContextOpen(!contextOpen)}
                  disabled={!hasContextData}
                  className={cn("h-8 gap-2", !hasContextData && "opacity-50")}
                >
                  {contextOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                  <span className="hidden sm:inline">Detalles</span>
                </Button>
              </div>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex min-h-0 flex-1 bg-accent/5">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {detailError && (
                <p className="bg-destructive/10 px-4 py-2 text-xs text-destructive text-center">
                  {detailError}
                </p>
              )}

              {!selected ? (
                <div className="flex flex-1 items-center justify-center p-6">
                  <div className="text-center space-y-3">
                    <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center mx-auto">
                      <Search className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Selecciona una conversación para ver el historial.
                    </p>
                  </div>
                </div>
              ) : (
                <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden" aria-label="Historial de mensajes">
                  <div className="px-5 pt-6 pb-12 sm:px-8 sm:pb-14">
                    {loadingMessages ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-center">
                        <div className="space-y-2">
                          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">Sin mensajes visibles</p>
                          <p className="max-w-sm text-xs text-muted-foreground">
                            No hay mensajes para esta conversación con el filtro seleccionado.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                      {messages.map((message, index) => {
                        const isOutbound = message.direction === "outbound";
                        const showDateSeparator = index === 0 || 
                          new Date(messages[index - 1].occurredAt).toDateString() !== new Date(message.occurredAt).toDateString();

                        return (
                          <div key={message.id} className="flex flex-col">
                            {showDateSeparator && (
                              <div className="flex justify-center my-4">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-accent/50 px-2 py-1 rounded-md">
                                  {new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(message.occurredAt))}
                                </span>
                              </div>
                            )}
                            <div className={cn("flex w-full", isOutbound ? "justify-end" : "justify-start")}>
                              <article
                                className={cn(
                                  "group relative min-w-0 max-w-[92%] overflow-hidden rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm sm:max-w-[82%] md:max-w-[76%] lg:max-w-[70%] [&_*]:max-w-full",
                                  isOutbound
                                    ? "rounded-tr-sm border border-primary/20 bg-primary/10 text-foreground"
                                    : "rounded-tl-sm border border-border bg-card text-card-foreground"
                                )}
                                aria-label={isOutbound ? "Mensaje enviado" : "Mensaje recibido"}
                              >
                                {message.templateRender ? (
                                  <div className="min-w-0 text-foreground">
                                    <TemplateMessageCard template={message.templateRender} />
                                  </div>
                                ) : message.kind === "audio" ? (
                                  <div className="min-w-0 space-y-2">
                                    <p className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                      {renderMessageText(message.text)}
                                    </p>
                                    {(() => {
                                      const sources = audioSourcesFromPayload(message.rawPayload);
                                      if (!sources?.length) return null;
                                      return (
                                        <audio
                                          controls
                                          preload="metadata"
                                          className="w-full min-w-0 max-w-full"
                                          key={sources[0]?.src}
                                        >
                                          {sources.map((source) => (
                                            <source
                                              key={`${source.src}:${source.type}`}
                                              src={source.src}
                                              type={source.type}
                                            />
                                          ))}
                                        </audio>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <p className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                    {renderMessageText(message.text)}
                                  </p>
                                )}
                                
                                <div
                                  className={cn(
                                    "flex items-center justify-end gap-1.5 mt-1 text-[10px] select-none",
                                    "text-muted-foreground"
                                  )}
                                >
                                  {message.source && message.source !== "api" && (
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                      via {message.source} ·
                                    </span>
                                  )}
                                  <span>{formatTime(message.occurredAt)}</span>
                                </div>
                              </article>
                            </div>
                          </div>
                        );
                      })}
                        <div ref={messagesEndRef} className="h-px w-full" />
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Right Panel: Context */}
            {selected && contextOpen && hasContextData && (
              <aside className="flex min-h-0 w-[300px] shrink-0 flex-col overflow-hidden border-l border-border/60 bg-card">
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-4">
                  <span className="text-sm font-semibold text-foreground">Detalles</span>
                  <button
                    type="button"
                    onClick={() => setContextOpen(false)}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Cerrar detalles"
                  >
                    <PanelRightClose className="size-4" />
                  </button>
                </div>
                
                <ScrollArea className="min-h-0 flex-1 overflow-hidden">
                  <div className="p-4 space-y-6">
                    {/* Demand Info */}
                    {context.demand && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="size-4" />
                          <h3 className="text-xs font-semibold uppercase tracking-wider">Demanda</h3>
                        </div>
                        <div className="bg-accent/40 rounded-lg p-3 space-y-2 text-sm">
                          <div>
                            <p className="font-medium text-foreground">{context.demand.name}</p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{context.demand.id}</p>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-2 pt-2 border-t border-border/50 text-xs">
                            {context.demand.budgetMin || context.demand.budgetMax ? (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Presupuesto</span>
                                <span className="font-medium">
                                  {formatMoney(context.demand.budgetMin) ?? "0"} - {formatMoney(context.demand.budgetMax) ?? "Max"}
                                </span>
                              </div>
                            ) : null}
                            {context.demand.zones && (
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground shrink-0">Zonas</span>
                                <span className="font-medium text-right truncate" title={context.demand.zones}>{context.demand.zones}</span>
                              </div>
                            )}
                            {context.demand.agent && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Agente</span>
                                <span className="font-medium">{context.demand.agent}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sent Properties */}
                    {context.selections.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Home className="size-4" />
                            <h3 className="text-xs font-semibold uppercase tracking-wider">Propiedades Enviadas</h3>
                          </div>
                          <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{sentCount}</Badge>
                        </div>
                        
                        <div className="space-y-3">
                          {context.selections.map((selection) => (
                            <div key={selection.id} className="space-y-2">
                              <p className="text-[10px] text-muted-foreground font-medium">
                                Enviado el {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(new Date(selection.createdAt))}
                              </p>
                              <div className="space-y-2">
                                {selection.properties.map((property) => (
                                  <a
                                    key={`${selection.id}-${property.propertyId}`}
                                    href={property.link ?? "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-card hover:bg-accent/50 transition-colors group"
                                  >
                                    {property.firstImageUrl ? (
                                      <div className="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-muted">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={property.firstImageUrl}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      </div>
                                    ) : (
                                      <div className="h-12 w-12 shrink-0 rounded-md bg-accent flex items-center justify-center text-muted-foreground">
                                        <Home className="size-4 opacity-50" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                        {property.title || property.propertyId}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                        {formatMoney(property.price)} · {property.zone || property.city}
                                      </p>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </aside>
            )}
          </div>
        </section>
      </Card>
    </div>
  );
}
