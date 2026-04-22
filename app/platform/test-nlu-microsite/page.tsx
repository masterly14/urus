"use client";

/**
 * Banco de pruebas interactivo del agente NLU de micrositios.
 *
 * Permite:
 *  - Elegir un contexto de microsite (mocks, escenarios de la suite eval,
 *    o un MicrositeSelection real de Neon) como fuente de propiedades +
 *    historial semilla.
 *  - Enviar mensajes como comprador (manual o generados con un comprador
 *    sintético usando una de las 8 personas de la suite eval).
 *  - Ver para cada turno: resultado del NLU (intention, propertyFeedback,
 *    variables, wantsMoreOptions), eventos emitidos en el Event Store y
 *    jobs encolados.
 *  - Juzgar cualquier turno contra expectedOutcome cuando el contexto es
 *    un escenario conocido.
 *
 * El pipeline escribe de verdad en BD y encola jobs. El waId del comprador
 * siempre es el fijado en constants.TEST_BUYER_WAID (no es configurable por
 * el usuario de la UI para impedir mensajear a compradores de producción).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  NLUResult,
  PropertyFeedbackItem,
  DemandVariables,
} from "@/lib/agents/types";
import { ConversationalEvalPanel } from "./conversational-eval-panel";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type ContextSource = "mock" | "scenario" | "real";

interface CatalogEntry {
  source: ContextSource;
  id: string;
  label: string;
  description: string;
  propertiesCount: number;
  category?: string;
  personaId?: string;
  createdAt?: string;
  demandId?: string;
}

interface PersonaEntry {
  id: string;
  name: string;
  description: string;
}

interface ContextProperty {
  propertyId: string;
  title: string;
  price: number | null;
  zone: string | null;
  city: string | null;
  metersBuilt: number | null;
  rooms: number | null;
  extras: string[];
  image: string | null;
}

interface ExpectedOutcome {
  intention?: string;
  propertyFeedback?: { propertyId: string; sentiment: string }[];
  variableKeys?: string[];
  wantsMoreOptions?: boolean;
}

interface ActiveSession {
  sessionId: string;
  selectionId: string;
  selectionToken: string;
  demandId: string;
  buyerWaId: string;
  comercialId: string;
  createdAt: string;
  context: {
    source: ContextSource;
    id: string;
    label: string;
    description: string;
    properties: ContextProperty[];
    conversationHistorySeed: { role: "buyer" | "system"; text: string; timestamp: string }[];
    scenarioId: string | null;
    personaId: string | null;
    expectedOutcome: ExpectedOutcome | null;
    buyerInstructions: string | null;
  };
}

interface EmittedEventSummary {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

interface TurnSummary {
  inboundEventId: string;
  occurredAt: string;
  text: string;
  emittedEvents: EmittedEventSummary[];
  enqueuedJobCount: number;
}

interface PipelineTurnResult {
  inboundEventId: string;
  nluResult: NLUResult;
  emittedEvents: EmittedEventSummary[];
  enqueuedJobs: {
    id: string;
    type: string;
    idempotencyKey: string;
    availableAt: string | null;
    payload: Record<string, unknown>;
  }[];
  latencyMs: number;
  historyUsed: { role: "buyer" | "system"; text: string; timestamp: string }[];
}

interface TurnRecord {
  id: string;
  kind: "seed" | "inbound" | "system";
  role: "buyer" | "system";
  text: string;
  occurredAt: string;
  result?: PipelineTurnResult;
  syntheticReasoning?: string | null;
  judge?: {
    propertyResolutionScore: number;
    sentimentAccuracyScore: number;
    variableExtractionScore: number;
    intentionScore: number;
    wantsMoreScore: number;
    hallucinationPenalty: number;
    overallScore: number;
    reasoning: string;
    failures: string[];
  };
}

interface SetupPayload {
  buyerWaId: string;
  catalog: {
    mocks: CatalogEntry[];
    scenarios: CatalogEntry[];
    reals: CatalogEntry[];
  };
  personas: PersonaEntry[];
  activeSession: ActiveSession | null;
  activeTurns: TurnSummary[];
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function formatPrice(v: number | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("es-ES")} €`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function scoreColor(score: number): string {
  if (score >= 0.85) return "text-urus-success";
  if (score >= 0.7) return "text-urus-warning";
  return "text-urus-danger";
}

function intentionBadgeClasses(intention: string): string {
  switch (intention) {
    case "ME_ENCAJA":
      return "border-emerald-800 bg-emerald-500/10 text-urus-success";
    case "NO_ME_ENCAJA":
      return "border-rose-800 bg-rose-500/10 text-urus-danger";
    case "BUSCO_DIFERENTE":
      return "border-amber-800 bg-amber-500/10 text-urus-warning";
    default:
      return "border-neutral-700 bg-neutral-800 text-neutral-300";
  }
}

function sentimentBadgeClasses(sentiment: string): string {
  if (sentiment === "ME_INTERESA") {
    return "border-emerald-800 bg-emerald-500/10 text-urus-success";
  }
  return "border-rose-800 bg-rose-500/10 text-urus-danger";
}

function eventBadgeClasses(type: string): string {
  if (type === "WHATSAPP_RECIBIDO") return "border-sky-800 bg-sky-500/10 text-sky-300";
  if (type === "SELECCION_COMPRADOR") return "border-violet-800 bg-violet-500/10 text-violet-300";
  if (type === "DEMANDA_ACTUALIZADA") return "border-urus-warning/30 bg-urus-warning/10 text-urus-warning";
  return "border-neutral-700 bg-neutral-800 text-neutral-300";
}

function variableEntries(vars: DemandVariables): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  if (vars.precioMin != null) out.push({ key: "precioMin", value: `${vars.precioMin.toLocaleString("es-ES")}€` });
  if (vars.precioMax != null) out.push({ key: "precioMax", value: `${vars.precioMax.toLocaleString("es-ES")}€` });
  if (vars.metrosMin != null) out.push({ key: "metrosMin", value: `${vars.metrosMin} m²` });
  if (vars.metrosMax != null) out.push({ key: "metrosMax", value: `${vars.metrosMax} m²` });
  if (vars.habitacionesMin != null) out.push({ key: "habitacionesMin", value: String(vars.habitacionesMin) });
  if (vars.ciudad) out.push({ key: "ciudad", value: vars.ciudad });
  if (vars.zonas?.length) out.push({ key: "zonas", value: vars.zonas.join(", ") });
  if (vars.tipos?.length) out.push({ key: "tipos", value: vars.tipos.join(", ") });
  if (vars.extras?.length) out.push({ key: "extras", value: vars.extras.join(", ") });
  if (vars.extrasNoDeseados?.length) out.push({ key: "extrasNoDeseados", value: vars.extrasNoDeseados.join(", ") });
  return out;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function TestNluMicrositePage() {
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [tab, setTab] = useState<ContextSource>("mock");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);

  const [buyerMode, setBuyerMode] = useState<"manual" | "synthetic">("manual");
  const [pipelineMode, setPipelineMode] = useState<"nlu" | "conversational">("nlu");
  const [personaId, setPersonaId] = useState<string>("directo");
  const [manualText, setManualText] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"interactive" | "eval">("interactive");

  const scrollRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Carga de setup
  // -------------------------------------------------------------------------

  const loadSetup = useCallback(async (): Promise<SetupPayload | null> => {
    try {
      const r = await fetch("/api/test-nlu-microsite");
      const data = (await r.json()) as SetupPayload & { error?: string };
      if ("error" in data && data.error) {
        setError(data.error);
        return null;
      }
      setSetup(data);
      if (data.activeSession) {
        setSession(data.activeSession);
        setTurns(buildTurnsFromSummaries(data.activeSession, data.activeTurns));
      }
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  useEffect(() => {
    loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns.length]);

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------

  const startSession = useCallback(async () => {
    if (!selectedCatalogId) return;
    setLoading(true);
    setLoadingMessage("Creando Demand + MicrositeSelection sintéticos en Neon...");
    setError(null);

    try {
      const r = await fetch("/api/test-nlu-microsite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: { source: tab, id: selectedCatalogId },
        }),
      });
      const data = (await r.json()) as {
        session?: ActiveSession;
        turns?: TurnSummary[];
        error?: string;
      };
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.session) {
        setSession(data.session);
        setTurns(buildTurnsFromSummaries(data.session, data.turns ?? []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [selectedCatalogId, tab]);

  const resetSession = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadingMessage("Limpiando recursos sintéticos...");
    setError(null);
    try {
      await fetch(`/api/test-nlu-microsite?sessionId=${session.sessionId}`, {
        method: "DELETE",
      });
      setSession(null);
      setTurns([]);
      setSelectedCatalogId(null);
      await loadSetup();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [session, loadSetup]);

  const sendMessage = useCallback(async () => {
    if (!session) return;
    if (buyerMode === "manual" && !manualText.trim()) return;

    setLoading(true);
    setLoadingMessage(
      buyerMode === "manual"
        ? pipelineMode === "conversational"
          ? "Ejecutando agente conversacional..."
          : "Clasificando con el NLU y ejecutando pipeline..."
        : `Generando mensaje sintético (${personaId}) y ${pipelineMode === "conversational" ? "procesando con agente" : "clasificándolo"}...`,
    );
    setError(null);

    const turnNumber =
      turns.filter((t) => t.kind === "inbound").length + 1;

    try {
      const r = await fetch("/api/test-nlu-microsite/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          mode: buyerMode,
          pipeline: pipelineMode,
          text: buyerMode === "manual" ? manualText.trim() : undefined,
          personaId: buyerMode === "synthetic" ? personaId : undefined,
          turnNumber,
        }),
      });
      const data = (await r.json()) as {
        messageText?: string;
        syntheticReasoning?: string | null;
        pipeline?: "nlu" | "conversational";
        result?: PipelineTurnResult & {
          responseText?: string;
          toolResults?: Array<{ toolName: string; args: Record<string, unknown>; result: unknown }>;
          nextPhase?: string;
        };
        turns?: TurnSummary[];
        error?: string;
      };
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.result && data.messageText) {
        const newTurns: TurnRecord[] = [
          {
            id: data.result!.inboundEventId,
            kind: "inbound",
            role: "buyer",
            text: data.messageText!,
            occurredAt: new Date().toISOString(),
            result: data.result,
            syntheticReasoning: data.syntheticReasoning ?? null,
          },
        ];

        if (data.pipeline === "conversational" && data.result.responseText) {
          newTurns.push({
            id: `${data.result.inboundEventId}-response`,
            kind: "system",
            role: "system",
            text: data.result.responseText,
            occurredAt: new Date().toISOString(),
          });
        }

        setTurns((prev) => [...prev, ...newTurns]);
        setManualText("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }, [session, buyerMode, pipelineMode, manualText, personaId, turns]);

  const judgeTurn = useCallback(
    async (turn: TurnRecord) => {
      if (!session || !turn.result) return;
      setLoading(true);
      setLoadingMessage("Ejecutando juez IA contra expectedOutcome...");
      setError(null);
      try {
        const r = await fetch("/api/test-nlu-microsite/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            buyerMessage: turn.text,
            nluResult: turn.result.nluResult,
          }),
        });
        const data = (await r.json()) as {
          evaluation?: TurnRecord["judge"];
          error?: string;
        };
        if (data.error) {
          setError(data.error);
          return;
        }
        if (data.evaluation) {
          setTurns((prev) =>
            prev.map((t) => (t.id === turn.id ? { ...t, judge: data.evaluation } : t)),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setLoadingMessage("");
      }
    },
    [session],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const currentCatalog = useMemo<CatalogEntry[]>(() => {
    if (!setup) return [];
    if (tab === "mock") return setup.catalog.mocks;
    if (tab === "scenario") return setup.catalog.scenarios;
    return setup.catalog.reals;
  }, [setup, tab]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            Urus Capital · Test bench
          </div>
          <h1 className="mt-1 text-2xl font-bold">Agente NLU de micrositios</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Ejecuta el pipeline real (Event Store + Job Queue) contra una Demand y un
            MicrositeSelection sintéticos. Cualquier WhatsApp emitido va al número de
            test <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs">
              {setup?.buyerWaId ?? "—"}
            </code>.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setViewMode("interactive")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "interactive"
                  ? "bg-neutral-100 text-neutral-950"
                  : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              Interactivo
            </button>
            <button
              onClick={() => setViewMode("eval")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "eval"
                  ? "bg-violet-600 text-white"
                  : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              Eval Conversacional
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="rounded-lg border border-rose-800 bg-rose-500/10 px-4 py-3 text-sm text-urus-danger">
            {error}
          </div>
        </div>
      ) : null}

      {viewMode === "eval" ? (
        <ConversationalEvalPanel />
      ) : !session ? (
        <SetupPanel
          setup={setup}
          tab={tab}
          setTab={setTab}
          catalog={currentCatalog}
          selectedId={selectedCatalogId}
          onSelect={setSelectedCatalogId}
          onStart={startSession}
          loading={loading}
          loadingMessage={loadingMessage}
        />
      ) : (
        <ActivePanel
          setup={setup}
          session={session}
          turns={turns}
          buyerMode={buyerMode}
          setBuyerMode={setBuyerMode}
          pipelineMode={pipelineMode}
          setPipelineMode={setPipelineMode}
          personaId={personaId}
          setPersonaId={setPersonaId}
          manualText={manualText}
          setManualText={setManualText}
          onSend={sendMessage}
          onReset={resetSession}
          onJudge={judgeTurn}
          loading={loading}
          loadingMessage={loadingMessage}
          scrollRef={scrollRef}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Setup Panel (sin sesión activa)
// ---------------------------------------------------------------------------

function SetupPanel({
  setup,
  tab,
  setTab,
  catalog,
  selectedId,
  onSelect,
  onStart,
  loading,
  loadingMessage,
}: {
  setup: SetupPayload | null;
  tab: ContextSource;
  setTab: (t: ContextSource) => void;
  catalog: CatalogEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStart: () => void;
  loading: boolean;
  loadingMessage: string;
}) {
  const tabs: { id: ContextSource; label: string; count: number }[] = [
    { id: "mock", label: "Mocks", count: setup?.catalog.mocks.length ?? 0 },
    { id: "scenario", label: "Escenarios eval", count: setup?.catalog.scenarios.length ?? 0 },
    { id: "real", label: "Selections reales", count: setup?.catalog.reals.length ?? 0 },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6">
        <h2 className="text-lg font-semibold">1 · Elige el contexto del microsite</h2>
        <p className="mt-1 text-sm text-neutral-400">
          El set de propiedades que recibe el NLU. Al iniciar, se crean una Demand y un
          MicrositeSelection sintéticos en Neon.
        </p>

        <div className="mt-4 flex gap-2 border-b border-neutral-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              disabled={loading}
              className={`px-4 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? "border-b-2 border-neutral-100 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {t.label}{" "}
              <span className="ml-1 rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {catalog.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-500">
              {tab === "real"
                ? "No hay MicrositeSelection persistidos todavía."
                : "Sin entradas en este catálogo."}
            </div>
          ) : (
            catalog.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onSelect(entry.id)}
                disabled={loading}
                className={`flex flex-col rounded-lg border p-4 text-left transition ${
                  selectedId === entry.id
                    ? "border-neutral-100 bg-neutral-100/5"
                    : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{entry.label}</div>
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300">
                    {entry.propertiesCount} props
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-400 line-clamp-3">
                  {entry.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-neutral-500">
                  {entry.category ? (
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5">
                      {entry.category}
                    </span>
                  ) : null}
                  {entry.personaId ? (
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5">
                      persona={entry.personaId}
                    </span>
                  ) : null}
                  {entry.demandId ? (
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5">
                      demand={entry.demandId.slice(0, 10)}…
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            {selectedId
              ? `Contexto seleccionado: ${selectedId}`
              : "Selecciona un contexto para continuar."}
          </div>
          <button
            onClick={onStart}
            disabled={!selectedId || loading}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {loading ? loadingMessage || "Creando..." : "Iniciar sesión de test"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Active Panel (con sesión)
// ---------------------------------------------------------------------------

function ActivePanel({
  setup,
  session,
  turns,
  buyerMode,
  setBuyerMode,
  pipelineMode,
  setPipelineMode,
  personaId,
  setPersonaId,
  manualText,
  setManualText,
  onSend,
  onReset,
  onJudge,
  loading,
  loadingMessage,
  scrollRef,
}: {
  setup: SetupPayload | null;
  session: ActiveSession;
  turns: TurnRecord[];
  buyerMode: "manual" | "synthetic";
  setBuyerMode: (m: "manual" | "synthetic") => void;
  pipelineMode: "nlu" | "conversational";
  setPipelineMode: (m: "nlu" | "conversational") => void;
  personaId: string;
  setPersonaId: (id: string) => void;
  manualText: string;
  setManualText: (t: string) => void;
  onSend: () => void;
  onReset: () => void;
  onJudge: (t: TurnRecord) => void;
  loading: boolean;
  loadingMessage: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-4">
      <SessionHeader session={session} onReset={onReset} loading={loading} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <MicrositePanel session={session} />

        <div className="flex min-h-0 flex-col gap-4">
          <ConversationPanel
            session={session}
            turns={turns}
            scrollRef={scrollRef}
            onJudge={onJudge}
            loading={loading}
          />
          <InputPanel
            setup={setup}
            buyerMode={buyerMode}
            setBuyerMode={setBuyerMode}
            pipelineMode={pipelineMode}
            setPipelineMode={setPipelineMode}
            personaId={personaId}
            setPersonaId={setPersonaId}
            manualText={manualText}
            setManualText={setManualText}
            onSend={onSend}
            loading={loading}
            loadingMessage={loadingMessage}
          />
        </div>
      </div>
    </section>
  );
}

function SessionHeader({
  session,
  onReset,
  loading,
}: {
  session: ActiveSession;
  onReset: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Sesión activa · {session.context.source}
          </div>
          <div className="mt-1 truncate text-sm font-semibold">
            {session.context.label}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500 line-clamp-2">
            {session.context.description}
          </div>
        </div>
        <button
          onClick={onReset}
          disabled={loading}
          className="shrink-0 rounded-lg border border-rose-900 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-urus-danger transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          Reset · limpiar recursos sintéticos
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-neutral-400 md:grid-cols-4">
        <div>
          <dt className="text-neutral-500">demandId</dt>
          <dd className="truncate font-mono text-neutral-300">{session.demandId}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">selectionId</dt>
          <dd className="truncate font-mono text-neutral-300">{session.selectionId}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">selectionToken</dt>
          <dd className="truncate font-mono text-neutral-300">{session.selectionToken}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">buyer waId</dt>
          <dd className="truncate font-mono text-neutral-300">{session.buyerWaId}</dd>
        </div>
      </dl>
      {session.context.scenarioId ? (
        <ScenarioSummary session={session} />
      ) : null}
    </div>
  );
}

function ScenarioSummary({ session }: { session: ActiveSession }) {
  const { expectedOutcome, buyerInstructions, personaId } = session.context;
  return (
    <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-xs">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
        Escenario eval · ground truth disponible para el juez
      </div>
      {personaId ? (
        <div className="text-neutral-400">
          Persona sintética recomendada: <span className="text-neutral-200">{personaId}</span>
        </div>
      ) : null}
      {buyerInstructions ? (
        <div className="mt-1 text-neutral-400">
          <span className="text-neutral-500">Instrucciones del comprador:</span>{" "}
          {buyerInstructions}
        </div>
      ) : null}
      {expectedOutcome ? (
        <div className="mt-2 space-y-1 text-neutral-400">
          {expectedOutcome.intention ? (
            <div>
              <span className="text-neutral-500">Intención esperada:</span>{" "}
              <span className="text-neutral-200">{expectedOutcome.intention}</span>
            </div>
          ) : null}
          {expectedOutcome.propertyFeedback && expectedOutcome.propertyFeedback.length > 0 ? (
            <div>
              <span className="text-neutral-500">Feedback esperado:</span>{" "}
              {expectedOutcome.propertyFeedback
                .map((f) => `${f.propertyId}=${f.sentiment}`)
                .join(", ")}
            </div>
          ) : null}
          {expectedOutcome.variableKeys && expectedOutcome.variableKeys.length > 0 ? (
            <div>
              <span className="text-neutral-500">Variables esperadas:</span>{" "}
              {expectedOutcome.variableKeys.join(", ")}
            </div>
          ) : null}
          {expectedOutcome.wantsMoreOptions !== undefined ? (
            <div>
              <span className="text-neutral-500">wantsMoreOptions:</span>{" "}
              {String(expectedOutcome.wantsMoreOptions)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MicrositePanel({ session }: { session: ActiveSession }) {
  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-neutral-800 bg-neutral-900/40">
      <div className="border-b border-neutral-800 px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          Microsite · propiedades vistas por el NLU
        </div>
        <div className="mt-0.5 text-sm text-neutral-300">
          {session.context.properties.length} propiedades
        </div>
      </div>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
        {session.context.properties.map((p, i) => (
          <article
            key={p.propertyId}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-neutral-500">
                  #{i + 1} · {p.propertyId}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-neutral-100">
                  {p.title}
                </div>
              </div>
              {p.price !== null ? (
                <span className="shrink-0 rounded-full border border-emerald-900 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-urus-success">
                  {formatPrice(p.price)}
                </span>
              ) : null}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-neutral-400">
              {p.zone ? (
                <div>
                  <span className="text-neutral-500">Zona: </span>
                  {p.zone}
                </div>
              ) : null}
              {p.city ? (
                <div>
                  <span className="text-neutral-500">Ciudad: </span>
                  {p.city}
                </div>
              ) : null}
              {p.metersBuilt !== null ? (
                <div>
                  <span className="text-neutral-500">m²: </span>
                  {p.metersBuilt}
                </div>
              ) : null}
              {p.rooms !== null ? (
                <div>
                  <span className="text-neutral-500">hab: </span>
                  {p.rooms}
                </div>
              ) : null}
            </dl>
            {p.extras.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.extras.map((ex) => (
                  <span
                    key={ex}
                    className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function ConversationPanel({
  session,
  turns,
  scrollRef,
  onJudge,
  loading,
}: {
  session: ActiveSession;
  turns: TurnRecord[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onJudge: (t: TurnRecord) => void;
  loading: boolean;
}) {
  const seedTurns = session.context.conversationHistorySeed ?? [];
  const hasGroundTruth = Boolean(session.context.scenarioId);

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-neutral-800 bg-neutral-900/40">
      <div className="border-b border-neutral-800 px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          Conversación con el comprador
        </div>
        <div className="mt-0.5 text-sm text-neutral-300">
          {turns.filter((t) => t.kind === "inbound").length} turnos ejecutados
          {seedTurns.length > 0 ? ` · ${seedTurns.length} mensajes semilla` : ""}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="min-h-[40vh] flex-1 space-y-3 overflow-y-auto p-4"
      >
        {seedTurns.map((s, i) => (
          <SeedTurn key={`seed-${i}`} role={s.role} text={s.text} timestamp={s.timestamp} />
        ))}
        {turns.length === 0 && seedTurns.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            Envía tu primer mensaje como comprador (manual o sintético) para comenzar.
          </div>
        ) : null}
        {turns
          .filter((t) => t.kind === "inbound")
          .map((t) => (
            <InboundTurn
              key={t.id}
              turn={t}
              onJudge={onJudge}
              canJudge={hasGroundTruth && !loading}
              properties={session.context.properties}
            />
          ))}
      </div>
    </div>
  );
}

function SeedTurn({
  role,
  text,
  timestamp,
}: {
  role: "buyer" | "system";
  text: string;
  timestamp: string;
}) {
  const isBuyer = role === "buyer";
  return (
    <div className={`flex ${isBuyer ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg border px-3 py-2 text-sm ${
          isBuyer
            ? "border-emerald-900 bg-emerald-500/5 text-urus-success"
            : "border-neutral-800 bg-neutral-800/40 text-neutral-300"
        }`}
      >
        <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
          <span>{isBuyer ? "Comprador (seed)" : "Sistema (seed)"}</span>
          <span>{formatTime(timestamp)}</span>
        </div>
        <div>{text}</div>
      </div>
    </div>
  );
}

function InboundTurn({
  turn,
  onJudge,
  canJudge,
  properties,
}: {
  turn: TurnRecord;
  onJudge: (t: TurnRecord) => void;
  canJudge: boolean;
  properties: ContextProperty[];
}) {
  const result = turn.result;
  if (!result) return null;
  const nlu = result.nluResult;
  const vars = variableEntries(nlu.variables);
  const titleById = new Map(properties.map((p) => [p.propertyId, p.title]));

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg border border-emerald-900 bg-emerald-500/10 px-3 py-2 text-sm text-urus-success">
          <div className="mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-urus-success/70">
            <span>Comprador</span>
            <span>{formatTime(turn.occurredAt)}</span>
          </div>
          <div>{turn.text}</div>
          {turn.syntheticReasoning ? (
            <div className="mt-1 border-t border-emerald-900/50 pt-1 text-[10px] text-urus-success/60">
              sintético: {turn.syntheticReasoning}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 pb-2">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">
            Salida NLU
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${intentionBadgeClasses(nlu.intention)}`}
          >
            {nlu.intention}
          </span>
          <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300">
            confidence {nlu.confidence.toFixed(2)}
          </span>
          {nlu.wantsMoreOptions ? (
            <span className="rounded-full border border-sky-800 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">
              wantsMoreOptions
            </span>
          ) : null}
          <span className="ml-auto text-[10px] text-neutral-500">
            {result.latencyMs} ms · historial usado: {result.historyUsed.length}
          </span>
        </div>

        {nlu.propertyFeedback.length > 0 ? (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              propertyFeedback
            </div>
            <ul className="mt-1 space-y-0.5">
              {nlu.propertyFeedback.map((fb: PropertyFeedbackItem) => (
                <li key={fb.propertyId} className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${sentimentBadgeClasses(fb.sentiment)}`}
                  >
                    {fb.sentiment}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-500">
                    {fb.propertyId}
                  </span>
                  <span className="text-neutral-300">
                    {titleById.get(fb.propertyId) ?? "(propiedad fuera del listado)"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {vars.length > 0 ? (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              variables extraídas
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {vars.map((v) => (
                <span
                  key={v.key}
                  className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
                >
                  <span className="text-neutral-500">{v.key}=</span>
                  {v.value}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {nlu.reasoning ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] text-neutral-500 hover:text-neutral-300">
              razonamiento NLU
            </summary>
            <p className="mt-1 text-[11px] text-neutral-400">{nlu.reasoning}</p>
          </details>
        ) : null}

        {result.emittedEvents.length > 0 || result.enqueuedJobs.length > 0 ? (
          <div className="mt-3 border-t border-neutral-800 pt-2">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              Pipeline · efectos reales
            </div>
            {result.emittedEvents.length > 0 ? (
              <div className="mt-1 space-y-0.5">
                {result.emittedEvents.map((evt) => (
                  <div key={evt.id} className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${eventBadgeClasses(evt.type)}`}
                    >
                      {evt.type}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-500">
                      {evt.aggregateType}:{evt.aggregateId.slice(0, 10)}…
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {result.enqueuedJobs.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {result.enqueuedJobs.map((j) => (
                  <span
                    key={j.id}
                    className="rounded border border-violet-900 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300"
                    title={j.idempotencyKey}
                  >
                    job · {j.type}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 border-t border-neutral-800 pt-2 text-[10px] text-neutral-500">
            Pipeline no emitió eventos (turno no disparó SELECCION_COMPRADOR /
            DEMANDA_ACTUALIZADA / GENERATE_MICROSITE).
          </div>
        )}

        {canJudge ? (
          <div className="mt-3 border-t border-neutral-800 pt-2">
            {turn.judge ? (
              <JudgeResult judge={turn.judge} />
            ) : (
              <button
                onClick={() => onJudge(turn)}
                className="rounded border border-amber-900 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-urus-warning transition hover:bg-amber-500/20"
              >
                Juzgar este turno contra expectedOutcome
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function JudgeResult({ judge }: { judge: NonNullable<TurnRecord["judge"]> }) {
  const dims: { key: string; label: string; value: number }[] = [
    { key: "overall", label: "Overall", value: judge.overallScore },
    { key: "propertyResolution", label: "Property", value: judge.propertyResolutionScore },
    { key: "sentiment", label: "Sentiment", value: judge.sentimentAccuracyScore },
    { key: "variable", label: "Variables", value: judge.variableExtractionScore },
    { key: "intention", label: "Intention", value: judge.intentionScore },
    { key: "wantsMore", label: "WantsMore", value: judge.wantsMoreScore },
  ];
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        Juez IA · expectedOutcome
      </div>
      <div className="flex flex-wrap gap-2 text-[10px]">
        {dims.map((d) => (
          <span
            key={d.key}
            className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 font-mono"
          >
            <span className="text-neutral-400">{d.label}:</span>{" "}
            <span className={scoreColor(d.value)}>{d.value.toFixed(3)}</span>
          </span>
        ))}
        {judge.hallucinationPenalty > 0 ? (
          <span className="rounded border border-rose-800 bg-rose-500/10 px-2 py-0.5 text-urus-danger">
            halluc. {judge.hallucinationPenalty.toFixed(2)}
          </span>
        ) : null}
      </div>
      {judge.failures.length > 0 ? (
        <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-urus-danger/90">
          {judge.failures.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : null}
      {judge.reasoning ? (
        <details>
          <summary className="cursor-pointer text-[10px] text-neutral-500 hover:text-neutral-300">
            razonamiento del juez
          </summary>
          <p className="mt-1 text-[11px] text-neutral-400">{judge.reasoning}</p>
        </details>
      ) : null}
    </div>
  );
}

function InputPanel({
  setup,
  buyerMode,
  setBuyerMode,
  pipelineMode,
  setPipelineMode,
  personaId,
  setPersonaId,
  manualText,
  setManualText,
  onSend,
  loading,
  loadingMessage,
}: {
  setup: SetupPayload | null;
  buyerMode: "manual" | "synthetic";
  setBuyerMode: (m: "manual" | "synthetic") => void;
  pipelineMode: "nlu" | "conversational";
  setPipelineMode: (m: "nlu" | "conversational") => void;
  personaId: string;
  setPersonaId: (id: string) => void;
  manualText: string;
  setManualText: (t: string) => void;
  onSend: () => void;
  loading: boolean;
  loadingMessage: string;
}) {
  const personas = setup?.personas ?? [];
  const canSend =
    !loading &&
    (buyerMode === "synthetic" ? Boolean(personaId) : manualText.trim().length > 0);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 pb-2 text-xs">
        <span className="text-neutral-500">Modo:</span>
        <div className="flex overflow-hidden rounded-md border border-neutral-800">
          <button
            onClick={() => setBuyerMode("manual")}
            disabled={loading}
            className={`px-3 py-1 ${
              buyerMode === "manual"
                ? "bg-neutral-100 text-neutral-950"
                : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            Manual
          </button>
          <button
            onClick={() => setBuyerMode("synthetic")}
            disabled={loading}
            className={`px-3 py-1 ${
              buyerMode === "synthetic"
                ? "bg-neutral-100 text-neutral-950"
                : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            Sintético
          </button>
        </div>

        <span className="ml-3 text-neutral-500">Pipeline:</span>
        <div className="flex overflow-hidden rounded-md border border-neutral-800">
          <button
            onClick={() => setPipelineMode("nlu")}
            disabled={loading}
            className={`px-3 py-1 ${
              pipelineMode === "nlu"
                ? "bg-sky-600 text-white"
                : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            NLU
          </button>
          <button
            onClick={() => setPipelineMode("conversational")}
            disabled={loading}
            className={`px-3 py-1 ${
              pipelineMode === "conversational"
                ? "bg-urus-success text-white"
                : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            Conversacional
          </button>
        </div>
        {buyerMode === "synthetic" ? (
          <select
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            disabled={loading}
            className="ml-auto rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {buyerMode === "manual" ? (
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Mensaje del comprador (se clasifica con el NLU y ejecuta pipeline real)"
            rows={2}
            disabled={loading}
            className="flex-1 resize-none rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
          />
          <button
            onClick={onSend}
            disabled={!canSend}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            Enviar
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-xs text-neutral-400">
            El comprador sintético usará la persona{" "}
            <span className="text-neutral-200">{personaId}</span> y las instrucciones del
            escenario activo (si las hay).
          </div>
          <button
            onClick={onSend}
            disabled={!canSend}
            className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            Generar turno
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-2 text-[11px] text-neutral-500">{loadingMessage}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Construcción inicial de turns desde resumen
// ---------------------------------------------------------------------------

function buildTurnsFromSummaries(
  _session: ActiveSession,
  summaries: TurnSummary[],
): TurnRecord[] {
  // Los summaries representan inbounds persistidos antes de la carga actual.
  // Se reconstruyen como turns "solo lectura" (sin nluResult completo ni jobs).
  return summaries.map((s) => ({
    id: s.inboundEventId,
    kind: "inbound",
    role: "buyer",
    text: s.text,
    occurredAt: s.occurredAt,
    result: undefined,
  }));
}
