"use client";

/**
 * Chat interactivo contra el agente conversacional.
 *
 * Permite mantener una conversación libre con el agente usando los mismos
 * system prompt, tools y loop ReAct que producción, pero con mock tools
 * (sin side-effects en BD ni WhatsApp).
 *
 * Uso:
 *  - Selecciona un contexto (propiedades + fase + digest iniciales).
 *  - Escribe mensajes como si fueses el comprador.
 *  - El agente responde; debajo de cada respuesta puedes inspeccionar
 *    las tools invocadas, la fase resultante y el resultado del NLU si lo llamó.
 *  - "Nueva conversación" resetea el historial a los valores del contexto.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Tipos ───────────────────────────────────────────────────────────────────

type ConversationPhase =
  | "INITIAL_CONTACT"
  | "REVIEWING_OPTIONS"
  | "GIVING_FEEDBACK"
  | "SCHEDULING_VISIT"
  | "IDLE_FOLLOWUP"
  | "UNKNOWN";

interface PropertySummary {
  propertyId: string;
  title: string;
  price: number | null;
  zone: string | null;
  city: string | null;
  metersBuilt: number | null;
  rooms: number | null;
  extras: string[];
}

interface ChatContextPreset {
  id: string;
  label: string;
  description: string;
  propertyCount: number;
  defaultPhase: ConversationPhase;
  defaultDigest: string | null;
  properties: PropertySummary[];
}

interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface AgentTurn {
  id: string;
  role: "buyer" | "agent";
  text: string;
  timestamp: string;
  toolResults?: ToolCallResult[];
  nextPhase?: ConversationPhase;
  nluResult?: unknown;
  latencyMs?: number;
}

interface AgentResponse {
  responseText: string;
  toolResults: ToolCallResult[];
  nextPhase: ConversationPhase;
  nluResult: unknown | null;
  latencyMs: number;
}

// ── Utilidades de formato ───────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function phaseColor(phase: ConversationPhase): string {
  switch (phase) {
    case "INITIAL_CONTACT":
      return "border-sky-800 bg-sky-500/10 text-sky-300";
    case "REVIEWING_OPTIONS":
      return "border-violet-800 bg-violet-500/10 text-violet-300";
    case "GIVING_FEEDBACK":
      return "border-amber-800 bg-amber-500/10 text-amber-300";
    case "SCHEDULING_VISIT":
      return "border-emerald-800 bg-emerald-500/10 text-emerald-300";
    case "IDLE_FOLLOWUP":
      return "border-neutral-700 bg-neutral-800 text-neutral-300";
    default:
      return "border-neutral-700 bg-neutral-800 text-neutral-400";
  }
}

function toolBadgeColor(name: string): string {
  switch (name) {
    case "classify_feedback":
      return "border-sky-800 bg-sky-500/10 text-sky-300";
    case "emit_selection_feedback":
      return "border-violet-800 bg-violet-500/10 text-violet-300";
    case "update_demand":
      return "border-amber-800 bg-amber-500/10 text-amber-300";
    case "request_more_options":
      return "border-emerald-800 bg-emerald-500/10 text-emerald-300";
    case "initiate_visit":
      return "border-fuchsia-800 bg-fuchsia-500/10 text-fuchsia-300";
    case "escalate_to_human":
      return "border-rose-800 bg-rose-500/10 text-rose-300";
    case "get_property_details":
      return "border-cyan-800 bg-cyan-500/10 text-cyan-300";
    default:
      return "border-neutral-700 bg-neutral-800 text-neutral-300";
  }
}

/** Convierte las *negritas* de WhatsApp a <strong> para renderizar. */
function renderWhatsAppText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*([^*\n]+)\*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    parts.push(
      <strong key={`b-${idx++}`} className="font-semibold">
        {m[1]}
      </strong>,
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={`t-${i}`} style={{ whiteSpace: "pre-wrap" }}>
        {p}
      </span>
    ) : (
      p
    ),
  );
}

// ── Componente principal ────────────────────────────────────────────────────

export default function ChatAgentePage() {
  const [presets, setPresets] = useState<ChatContextPreset[] | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [phase, setPhase] = useState<ConversationPhase>("INITIAL_CONTACT");
  const [digest, setDigest] = useState<string | null>(null);
  const [digestDraft, setDigestDraft] = useState<string>("");
  const [editingDigest, setEditingDigest] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedPreset = useMemo(
    () => presets?.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  const conversationHistory = useMemo(
    () =>
      turns.map((t) => ({
        role: t.role === "agent" ? ("system" as const) : ("buyer" as const),
        text: t.text,
        timestamp: t.timestamp,
      })),
    [turns],
  );

  // ── Carga inicial de presets ─────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/chat-agente");
        if (!r.ok) {
          setError(`No se pudieron cargar los contextos (HTTP ${r.status}).`);
          return;
        }
        const data = (await r.json()) as { presets: ChatContextPreset[] };
        setPresets(data.presets);
        if (data.presets.length > 0 && !selectedPresetId) {
          applyPreset(data.presets[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns.length]);

  // ── Acciones ─────────────────────────────────────────────────────────────

  const applyPreset = useCallback((preset: ChatContextPreset) => {
    setSelectedPresetId(preset.id);
    setPhase(preset.defaultPhase);
    setDigest(preset.defaultDigest);
    setDigestDraft(preset.defaultDigest ?? "");
    setTurns([]);
    setError(null);
  }, []);

  const resetConversation = useCallback(() => {
    if (!selectedPreset) return;
    applyPreset(selectedPreset);
  }, [selectedPreset, applyPreset]);

  const sendMessage = useCallback(async () => {
    const text = message.trim();
    if (!text || !selectedPreset || sending) return;

    setSending(true);
    setError(null);

    const now = new Date().toISOString();
    const buyerTurn: AgentTurn = {
      id: `buyer-${Date.now()}`,
      role: "buyer",
      text,
      timestamp: now,
    };
    setTurns((prev) => [...prev, buyerTurn]);
    setMessage("");

    try {
      const r = await fetch("/api/chat-agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageText: text,
          properties: selectedPreset.properties,
          conversationHistory: [
            ...conversationHistory,
            { role: "buyer", text, timestamp: now },
          ],
          conversationPhase: phase,
          buyerDigest: digest,
        }),
      });

      const data = (await r.json()) as AgentResponse & { error?: string };

      if (!r.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }

      const agentTurn: AgentTurn = {
        id: `agent-${Date.now()}`,
        role: "agent",
        text: data.responseText,
        timestamp: new Date().toISOString(),
        toolResults: data.toolResults,
        nextPhase: data.nextPhase,
        nluResult: data.nluResult,
        latencyMs: data.latencyMs,
      };
      setTurns((prev) => [...prev, agentTurn]);
      setPhase(data.nextPhase);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTurns((prev) => prev.filter((t) => t.id !== buyerTurn.id));
      setMessage(text);
    } finally {
      setSending(false);
    }
  }, [
    message,
    selectedPreset,
    sending,
    conversationHistory,
    phase,
    digest,
  ]);

  const applyDigestDraft = useCallback(() => {
    setDigest(digestDraft.trim() === "" ? null : digestDraft.trim());
    setEditingDigest(false);
  }, [digestDraft]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (!presets) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-neutral-400 text-sm">
        {error ?? "Cargando contextos..."}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Chat con el agente conversacional</h1>
            <p className="text-xs text-neutral-400">
              Modo sandbox: sin efectos en BD ni WhatsApp. Mismo prompt y tools que producción.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${phaseColor(phase)}`}
            >
              {phase}
            </span>
            <button
              onClick={resetConversation}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800"
              disabled={sending}
            >
              Nueva conversación
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[320px,1fr]">
        {/* Sidebar: contexto */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-sm font-semibold">Contexto</h2>
            <div className="flex flex-col gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  disabled={sending}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    selectedPresetId === p.id
                      ? "border-violet-700 bg-violet-500/10 text-violet-200"
                      : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-800/60"
                  }`}
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="mt-1 text-[11px] text-neutral-400">
                    {p.propertyCount} propiedades · fase {p.defaultPhase}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {selectedPreset ? (
            <>
              <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Descripción
                </h3>
                <p className="text-xs text-neutral-300">{selectedPreset.description}</p>
              </section>

              <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Digest del comprador
                  </h3>
                  {!editingDigest ? (
                    <button
                      onClick={() => {
                        setDigestDraft(digest ?? "");
                        setEditingDigest(true);
                      }}
                      className="text-[11px] text-violet-400 hover:underline"
                    >
                      editar
                    </button>
                  ) : null}
                </div>
                {!editingDigest ? (
                  <p className="text-xs text-neutral-300">
                    {digest ?? <span className="text-neutral-500 italic">sin digest</span>}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={digestDraft}
                      onChange={(e) => setDigestDraft(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100 focus:border-violet-600 focus:outline-none"
                      placeholder="Describe lo que sabes del comprador..."
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingDigest(false)}
                        className="rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300"
                      >
                        cancelar
                      </button>
                      <button
                        onClick={applyDigestDraft}
                        className="rounded-md bg-violet-600 px-2 py-1 text-[11px] text-white"
                      >
                        aplicar
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Propiedades ({selectedPreset.properties.length})
                </h3>
                {selectedPreset.properties.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">
                    Sin propiedades asignadas al microsite.
                  </p>
                ) : (
                  <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
                    {selectedPreset.properties.map((p) => (
                      <li
                        key={p.propertyId}
                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5"
                      >
                        <div className="font-medium text-neutral-200">{p.title}</div>
                        <div className="text-[11px] text-neutral-400">
                          {p.price != null
                            ? `${p.price.toLocaleString("es-ES")} €`
                            : "—"}{" "}
                          · {p.metersBuilt ?? "?"} m² · {p.rooms ?? "?"} hab
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </aside>

        {/* Chat */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-4"
            style={{ minHeight: "60vh" }}
          >
            {turns.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-xs text-neutral-500">
                <div>
                  <div className="text-sm font-medium text-neutral-300">
                    Conversación vacía
                  </div>
                  <div className="mt-1">
                    Escribe un mensaje abajo para empezar a hablar con el agente.
                  </div>
                </div>
              </div>
            ) : (
              turns.map((t) => <TurnBubble key={t.id} turn={t} />)
            )}
            {sending ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
                el agente está pensando...
              </div>
            ) : null}
          </div>

          {/* Composer */}
          <div className="border-t border-neutral-800 bg-neutral-950 p-3">
            {error ? (
              <div className="mb-2 rounded-md border border-rose-800 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </div>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                rows={2}
                placeholder="Escribe como si fueras el comprador..."
                className="flex-1 resize-none rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-violet-600 focus:outline-none"
                disabled={sending || !selectedPreset}
              />
              <button
                type="submit"
                disabled={sending || !message.trim() || !selectedPreset}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
            <p className="mt-1 text-[11px] text-neutral-500">
              Enter para enviar · Shift+Enter para nueva línea · Las tools se ejecutan en mock, sin efectos reales.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Burbuja de turno ────────────────────────────────────────────────────────

function TurnBubble({ turn }: { turn: AgentTurn }) {
  const [expanded, setExpanded] = useState(false);

  if (turn.role === "buyer") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-600/90 px-3 py-2 text-sm text-white shadow">
          {renderWhatsAppText(turn.text)}
          <div className="mt-1 text-right text-[10px] text-emerald-100/70">
            {formatTime(turn.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  const hasTools = (turn.toolResults?.length ?? 0) > 0;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-neutral-800 px-3 py-2 text-sm text-neutral-100 shadow">
        {renderWhatsAppText(turn.text)}
        <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-neutral-400">
          <span>{formatTime(turn.timestamp)}</span>
          {turn.latencyMs != null ? (
            <span>{(turn.latencyMs / 1000).toFixed(1)}s</span>
          ) : null}
        </div>
      </div>

      <div className="flex max-w-[85%] flex-wrap items-center gap-1.5 pl-1 text-[11px]">
        {turn.nextPhase ? (
          <span
            className={`rounded-full border px-2 py-0.5 ${phaseColor(turn.nextPhase)}`}
          >
            fase → {turn.nextPhase}
          </span>
        ) : null}
        {turn.toolResults?.map((tc, i) => (
          <span
            key={`${tc.toolName}-${i}`}
            className={`rounded-full border px-2 py-0.5 font-mono ${toolBadgeColor(tc.toolName)}`}
          >
            {tc.toolName}
          </span>
        ))}
        {hasTools ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
          >
            {expanded ? "ocultar detalles" : "ver detalles"}
          </button>
        ) : null}
      </div>

      {expanded && hasTools ? (
        <div className="ml-1 max-w-[85%] rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-[11px] text-neutral-300">
          <div className="mb-2 font-semibold text-neutral-200">Tool calls</div>
          <div className="flex flex-col gap-2">
            {turn.toolResults?.map((tc, i) => (
              <div
                key={`det-${i}`}
                className="rounded-md border border-neutral-800 bg-neutral-900 p-2"
              >
                <div
                  className={`mb-1 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] ${toolBadgeColor(tc.toolName)}`}
                >
                  {tc.toolName}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-neutral-400">
                  {JSON.stringify({ args: tc.args, result: tc.result }, null, 2)}
                </pre>
              </div>
            ))}
          </div>
          {turn.nluResult ? (
            <>
              <div className="mt-3 mb-1 font-semibold text-neutral-200">
                NLU result
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-neutral-800 bg-neutral-900 p-2 text-[10px] text-neutral-400">
                {JSON.stringify(turn.nluResult, null, 2)}
              </pre>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
