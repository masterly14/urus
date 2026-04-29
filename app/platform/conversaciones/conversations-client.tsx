"use client";

import { useMemo, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversation, useConversations } from "@/lib/hooks/use-conversations";
import { cn } from "@/lib/utils";

type Direction = "all" | "inbound" | "outbound";

type AvatarTone = {
  bg: string;
  text: string;
};

const AVATAR_TONES: AvatarTone[] = [
  { bg: "bg-urus-info-bg", text: "text-urus-info" },
  { bg: "bg-urus-success-bg", text: "text-urus-success" },
  { bg: "bg-urus-warning-bg", text: "text-urus-warning" },
  { bg: "bg-urus-ai-bg", text: "text-urus-ai" },
  { bg: "bg-urus-danger-bg", text: "text-urus-danger" },
];

function hashToTone(seed: string): AvatarTone {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_TONES.length;
  return AVATAR_TONES[index];
}

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
  const tone = hashToTone(waId);
  const initials = initialsFrom(name, waId);
  const sizeClasses = size === "sm" ? "h-8 w-8 text-[11px]" : "h-9 w-9 text-xs";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        tone.bg,
        tone.text,
        sizeClasses,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
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
    return new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function directionLabel(direction: "inbound" | "outbound"): string {
  return direction === "inbound" ? "Cliente" : "Sistema";
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

export function ConversationsClient() {
  const [q, setQ] = useState("");
  const [direction, setDirection] = useState<Direction>("all");
  const [agentOnly, setAgentOnly] = useState(false);
  const [selectedWaId, setSelectedWaId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);

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

  return (
    <div className="flex min-h-0 h-[calc(100vh-8rem)] flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Trazabilidad
          </p>
          <h1 className="text-xl font-semibold tracking-tight">Conversaciones</h1>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Consulta de solo lectura sobre los mensajes reales guardados en Neon, incluyendo trazas
          operativas y Coach emocional.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar por telefono, nombre, demanda, agente o texto"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value as Direction)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Todos</option>
          <option value="inbound">Entrantes</option>
          <option value="outbound">Salientes</option>
        </select>
        <label
          className={cn(
            "flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs transition-colors",
            agentOnly
              ? "border-urus-ai/40 bg-urus-ai-bg text-urus-ai"
              : "border-border bg-background text-muted-foreground hover:bg-muted/40",
          )}
        >
          <input
            type="checkbox"
            checked={agentOnly}
            onChange={(event) => setAgentOnly(event.target.checked)}
            className="sr-only"
          />
          <Sparkles className="size-3.5" />
          Agente IA
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="h-9 gap-2"
        >
          <RefreshCw className="size-3.5" />
          Actualizar
        </Button>
      </div>

      <Card className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden p-0">
        {!listCollapsed ? (
          <aside className="flex min-h-0 w-[320px] shrink-0 flex-col overflow-hidden border-r border-border bg-muted/20">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background/60 px-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Conversaciones</p>
                <p className="text-[11px] text-muted-foreground">
                  {loadingList ? "Cargando..." : `${conversations.length} visibles`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setListCollapsed(true)}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label="Colapsar lista"
                title="Colapsar lista"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </div>

            {listError ? (
              <p className="shrink-0 px-3 py-2 text-xs text-destructive">{listError}</p>
            ) : null}

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
              role="region"
              aria-label="Lista de conversaciones"
            >
              {!loadingList && conversations.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No hay conversaciones con los filtros actuales.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                  {conversations.map((conversation) => {
                    const isActive = activeWaId === conversation.waId;
                    return (
                      <li key={conversation.waId}>
                        <button
                          type="button"
                          onClick={() => setSelectedWaId(conversation.waId)}
                          className={cn(
                            "relative flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
                            isActive
                              ? "bg-primary/5"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute inset-y-2 left-0 w-0.5 rounded-r-full transition-colors",
                              isActive ? "bg-primary" : "bg-transparent",
                            )}
                            aria-hidden
                          />
                          <Avatar
                            name={conversationTitle(conversation)}
                            waId={conversation.waId}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-medium text-foreground">
                                {conversationTitle(conversation)}
                              </p>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {formatRelative(conversation.lastMessageAt)}
                              </span>
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {conversation.relationLabel}
                              {conversation.demandName
                                ? ` · ${conversation.demandName}`
                                : ""}
                            </p>
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              <span
                                className={cn(
                                  "mr-1 font-medium",
                                  conversation.lastDirection === "outbound"
                                    ? "text-primary"
                                    : "text-foreground/70",
                                )}
                              >
                                {conversation.lastDirection === "outbound" ? "→" : "←"}
                              </span>
                              {conversation.lastMessagePreview}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <Badge
                                variant="outline"
                                className="h-4 px-1.5 text-[10px]"
                              >
                                {conversation.messageCount} msg
                              </Badge>
                              {conversation.hasAgentMessages ? (
                                <Badge
                                  variant="ai"
                                  className="h-4 gap-0.5 px-1.5 text-[10px]"
                                >
                                  <Sparkles className="size-2.5" /> IA
                                </Badge>
                              ) : null}
                              {conversation.demandAgent ? (
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {conversation.demandAgent}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        ) : null}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/60 px-3">
            {listCollapsed ? (
              <button
                type="button"
                onClick={() => setListCollapsed(false)}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label="Expandir lista"
                title="Expandir lista"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            ) : null}

            {selected ? (
              <>
                <Avatar name={conversationTitle(selected)} waId={selected.waId} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {conversationTitle(selected)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {selected.relationLabel} · +{selected.waId}
                    {selected.demandName ? ` · ${selected.demandName}` : ""}
                    {selected.demandAgent ? ` · ${selected.demandAgent}` : ""}
                  </p>
                </div>
                {context.demand?.leadStatus ? (
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    {context.demand.leadStatus}
                  </Badge>
                ) : null}
                <button
                  type="button"
                  onClick={() => setContextOpen((prev) => !prev)}
                  disabled={!hasContextData}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
                    contextOpen
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                    !hasContextData && "cursor-not-allowed opacity-50",
                  )}
                  title={contextOpen ? "Ocultar contexto" : "Mostrar contexto"}
                >
                  {contextOpen ? (
                    <PanelRightClose className="size-3.5" />
                  ) : (
                    <PanelRightOpen className="size-3.5" />
                  )}
                  Contexto
                  {sentCount > 0 ? (
                    <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-medium text-foreground">
                      {sentCount}
                    </span>
                  ) : null}
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecciona una conversacion para ver el historial.
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/10">
              {detailError ? (
                <p className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
                  {detailError}
                </p>
              ) : null}

              {!selected ? (
                <div className="flex flex-1 items-center justify-center p-6">
                  <p className="max-w-xs text-center text-sm text-muted-foreground">
                    Selecciona una conversacion en la lista para revisar el historial y su
                    contexto.
                  </p>
                </div>
              ) : (
                <ScrollArea className="min-h-0 flex-1 overflow-hidden">
                  {loadingMessages ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      Cargando mensajes...
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      No hay mensajes para esta conversacion con los filtros actuales.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2 px-4 py-4">
                      {messages.map((message) => {
                        const isOutbound = message.direction === "outbound";
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              "flex",
                              isOutbound ? "justify-end" : "justify-start",
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-[var(--shadow-card)] ring-1",
                                isOutbound
                                  ? "rounded-br-sm bg-primary/10 text-foreground ring-primary/15"
                                  : "rounded-bl-sm bg-background text-foreground ring-border",
                              )}
                            >
                              <p className="whitespace-pre-wrap leading-relaxed">
                                {message.text}
                              </p>
                              <div
                                className={cn(
                                  "mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]",
                                  isOutbound
                                    ? "text-primary/70"
                                    : "text-muted-foreground",
                                )}
                              >
                                <span>{formatDateTime(message.occurredAt)}</span>
                                <span aria-hidden>·</span>
                                <span>{directionLabel(message.direction)}</span>
                                {message.source ? (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>{message.source}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>

            {selected && contextOpen && hasContextData ? (
              <aside className="flex min-h-0 w-[320px] shrink-0 flex-col overflow-hidden border-l border-border bg-background">
                <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Contexto
                  </p>
                  <button
                    type="button"
                    onClick={() => setContextOpen(false)}
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    aria-label="Cerrar contexto"
                    title="Cerrar contexto"
                  >
                    <PanelRightClose className="size-3.5" />
                  </button>
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
                  role="region"
                  aria-label="Contexto de la conversacion"
                >
                  <div className="flex flex-col gap-3 p-3 pb-4">
                    {context.demand ? (
                      <section className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Demanda
                            </p>
                            <p className="truncate text-sm font-semibold">
                              {context.demand.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {context.demand.id}
                            </p>
                          </div>
                          {context.demand.leadStatus ? (
                            <Badge variant="info" className="shrink-0">
                              {context.demand.leadStatus}
                            </Badge>
                          ) : null}
                        </div>
                        <dl className="mt-3 grid grid-cols-1 gap-y-2 text-xs">
                          {context.demand.agent ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">Agente</dt>
                              <dd className="font-medium text-foreground">
                                {context.demand.agent}
                              </dd>
                            </div>
                          ) : null}
                          {context.demand.phone ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">Tel.</dt>
                              <dd className="font-medium text-foreground">
                                {context.demand.phone}
                              </dd>
                            </div>
                          ) : null}
                          {context.demand.budgetMin || context.demand.budgetMax ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">Presup.</dt>
                              <dd className="font-medium text-foreground">
                                {formatMoney(context.demand.budgetMin) ?? "—"}
                                {" / "}
                                {formatMoney(context.demand.budgetMax) ?? "—"}
                              </dd>
                            </div>
                          ) : null}
                          {context.demand.zones ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">Zonas</dt>
                              <dd className="font-medium text-foreground">
                                {context.demand.zones}
                              </dd>
                            </div>
                          ) : null}
                          {context.demand.types ? (
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 text-muted-foreground">Tipos</dt>
                              <dd className="font-medium text-foreground">
                                {context.demand.types}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </section>
                    ) : null}

                    <section className="rounded-lg border border-border bg-card">
                      <header className="flex items-center justify-between border-b border-border px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Propiedades enviadas
                        </p>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          {sentCount}
                        </Badge>
                      </header>
                      {context.selections.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-muted-foreground">
                          No hay microsites o propiedades enviadas relacionadas.
                        </p>
                      ) : (
                        <div className="flex flex-col divide-y divide-border/60">
                          {context.selections.map((selection) => (
                            <div key={selection.id} className="p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">
                                    Seleccion {formatDateTime(selection.createdAt)}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {selection.status}
                                    {selection.firstViewedAt
                                      ? ` · visto ${formatDateTime(selection.firstViewedAt)}`
                                      : ""}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className="h-4 px-1.5 text-[10px]"
                                >
                                  {selection.properties.length}
                                </Badge>
                              </div>
                              <div className="mt-2 grid grid-cols-1 gap-2">
                                {selection.properties.slice(0, 6).map((property) => (
                                  <article
                                    key={`${selection.id}-${property.propertyId}`}
                                    className="group/property overflow-hidden rounded-md border border-border bg-background text-[11px] transition-shadow hover:shadow-[var(--shadow-card)]"
                                  >
                                    {property.firstImageUrl ? (
                                      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                                        <img
                                          src={property.firstImageUrl}
                                          alt={property.title}
                                          className="h-full w-full object-cover transition-transform duration-300 group-hover/property:scale-[1.03]"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                                        Sin imagen
                                      </div>
                                    )}
                                    <div className="space-y-1 p-2">
                                      <p className="line-clamp-2 font-medium leading-snug">
                                        {property.title}
                                      </p>
                                      <p className="truncate text-muted-foreground">
                                        {[property.zone, property.city]
                                          .filter(Boolean)
                                          .join(" · ") || property.propertyId}
                                      </p>
                                      <p className="text-muted-foreground">
                                        {[
                                          formatMoney(property.price),
                                          property.metersBuilt
                                            ? `${property.metersBuilt} m²`
                                            : null,
                                          property.rooms
                                            ? `${property.rooms} hab.`
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </p>
                                      {property.link ? (
                                        <a
                                          href={property.link}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-block pt-0.5 text-primary hover:underline"
                                        >
                                          Ver ficha →
                                        </a>
                                      ) : null}
                                    </div>
                                  </article>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        </section>
      </Card>
    </div>
  );
}
