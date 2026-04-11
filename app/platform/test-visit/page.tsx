"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Property {
  codigo: string;
  ref: string;
  titulo: string;
  ciudad: string;
  zona: string;
  precio: number;
  habitaciones: number;
  metrosConstruidos: number;
  agente: string;
}

interface Comercial {
  id: string;
  nombre: string;
  waId: string;
  composioConnected: boolean;
}

interface SetupData {
  properties: Property[];
  comercial: Comercial | null;
  testBuyerWaId: string;
  error?: string;
}

interface CapturedButton {
  id: string;
  title: string;
}

interface CapturedMessage {
  id: string;
  sessionId: string;
  timestamp: number;
  to: string;
  from?: string;
  direction: "outbound" | "inbound";
  type: "text" | "template" | "interactive";
  text: string;
  buttons: CapturedButton[];
  templateName?: string;
}

interface SessionData {
  id: string;
  state: string;
  currentRound: number;
  maxRounds: number;
  buyerWaId: string;
  comercialWaId: string;
  propertyCode: string;
  demandId: string;
  confirmedSlotStart?: string;
  confirmedSlotEnd?: string;
  escalationReason?: string;
  visitorName?: string;
  visitorPhone?: string;
  calendarLink?: string;
  calendarEventId?: string;
}

// ---------------------------------------------------------------------------
// State labels
// ---------------------------------------------------------------------------

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  INITIATED: { label: "Iniciada", color: "#6b7280" },
  FETCHING_SLOTS: { label: "Buscando slots...", color: "#3b82f6" },
  SLOTS_PROPOSED_TO_COMMERCIAL: {
    label: "Esperando comercial",
    color: "#f59e0b",
  },
  COMMERCIAL_ACCEPTED_SLOT: { label: "Comercial aceptó", color: "#10b981" },
  SLOT_PROPOSED_TO_BUYER: { label: "Esperando comprador", color: "#f59e0b" },
  BUYER_ACCEPTED: { label: "Comprador aceptó", color: "#10b981" },
  BUYER_REJECTED: { label: "Comprador rechazó", color: "#ef4444" },
  ASKING_BUYER_PREFERENCE: {
    label: "Pidiendo preferencia",
    color: "#8b5cf6",
  },
  FETCHING_SPECIFIC_SLOT: {
    label: "Verificando disponibilidad...",
    color: "#3b82f6",
  },
  SPECIFIC_SLOT_TO_COMMERCIAL: {
    label: "Comercial confirma preferencia",
    color: "#f59e0b",
  },
  COLLECTING_VISITOR_DATA: { label: "Recopilando datos", color: "#8b5cf6" },
  VISIT_CONFIRMED: { label: "VISITA CONFIRMADA", color: "#059669" },
  VISIT_COMPLETED: { label: "Completada", color: "#6b7280" },
  VISIT_CANCELLED: { label: "Cancelada", color: "#ef4444" },
  VISIT_RESCHEDULED: { label: "Reprogramada", color: "#f97316" },
  ESCALATED_MANUAL: { label: "ESCALADA A MANUAL", color: "#dc2626" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TestVisitPage() {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [session, setSession] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<CapturedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commercialInput, setCommercialInput] = useState("");
  const [buyerInput, setBuyerInput] = useState("");
  const [lastIntent, setLastIntent] = useState<string | null>(null);

  const commercialEndRef = useRef<HTMLDivElement>(null);
  const buyerEndRef = useRef<HTMLDivElement>(null);

  // --- Fetch setup data ---
  useEffect(() => {
    fetch("/api/test-visit-scheduling")
      .then((r) => r.json())
      .then(setSetup)
      .catch((e) => setError(e.message));
  }, []);

  // --- Auto-scroll chat panels ---
  useEffect(() => {
    commercialEndRef.current?.scrollIntoView({ behavior: "smooth" });
    buyerEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Refresh session state ---
  const refreshSession = useCallback(async () => {
    if (!session) return;
    try {
      const r = await fetch(
        `/api/test-visit-scheduling?sessionId=${session.id}`,
      );
      const data = await r.json();
      if (data.session) setSession(data.session);
      if (data.messages) setMessages(data.messages);
    } catch {}
  }, [session]);

  // --- Start test ---
  const startTest = async () => {
    if (!selectedProperty) return;
    setLoading(true);
    setLoadingMessage("Iniciando sesión y consultando calendario de Composio...");
    setError(null);
    setLastIntent(null);

    try {
      const r = await fetch("/api/test-visit-scheduling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyCode: selectedProperty }),
      });
      const data = await r.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSession(data.session);
        setMessages(data.messages ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  // --- Send response ---
  const sendResponse = async (
    role: "buyer" | "commercial",
    text?: string,
    buttonId?: string,
  ) => {
    if (!session) return;
    setLoading(true);
    setLoadingMessage(
      buttonId
        ? "Procesando selección..."
        : "Clasificando intención con GPT-4o-mini...",
    );

    try {
      const r = await fetch("/api/test-visit-scheduling/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          senderRole: role,
          text,
          buttonId,
        }),
      });
      const data = await r.json();
      if (data.session) setSession(data.session);
      if (data.messages) setMessages(data.messages);
      if (data.intent) setLastIntent(`${data.intent} (${data.confidence})`);
      if (data.error && !data.handled) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  // --- Reset ---
  const resetTest = async () => {
    if (!session) return;
    setLoading(true);
    try {
      await fetch(
        `/api/test-visit-scheduling?sessionId=${session.id}`,
        { method: "DELETE" },
      );
      setSession(null);
      setMessages([]);
      setError(null);
      setLastIntent(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // --- Classify messages by panel ---
  const commercialWaId = setup?.comercial?.waId ?? session?.comercialWaId;
  const buyerWaId = setup?.testBuyerWaId ?? session?.buyerWaId;

  const commercialMessages = messages.filter(
    (m) =>
      (m.direction === "outbound" && m.to === commercialWaId) ||
      (m.direction === "inbound" && m.from === commercialWaId),
  );

  const buyerMessages = messages.filter(
    (m) =>
      (m.direction === "outbound" && m.to === buyerWaId) ||
      (m.direction === "inbound" && m.from === buyerWaId),
  );

  const stateInfo = session
    ? STATE_LABELS[session.state] ?? { label: session.state, color: "#6b7280" }
    : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1
        style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}
      >
        Test Interactivo — Agendamiento de Visitas
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
        BD real + Composio real + UI simuladora de WhatsApp. Actúa como comprador y comercial.
      </p>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            color: "#dc2626",
            fontSize: 14,
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 12, textDecoration: "underline", cursor: "pointer" }}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* --- Setup bar --- */}
      {!session && setup && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>
              Comercial: {setup.comercial?.nombre ?? "—"}{" "}
              {setup.comercial?.composioConnected ? "✓ Composio" : "✗ Sin Composio"}
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            >
              <option value="">Seleccionar propiedad...</option>
              {setup.properties.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.ref || p.codigo} — {p.titulo || "Sin título"} ({p.zona},{" "}
                  {p.ciudad}) — {p.precio.toLocaleString("es-ES")}€
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={startTest}
            disabled={!selectedProperty || loading}
            style={{
              padding: "10px 24px",
              borderRadius: 6,
              background: selectedProperty && !loading ? "#2563eb" : "#9ca3af",
              color: "white",
              border: "none",
              cursor: selectedProperty && !loading ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {loading ? "Iniciando..." : "Iniciar Test"}
          </button>
        </div>
      )}

      {setup && !setup.comercial && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: "#6b7280",
            fontSize: 16,
          }}
        >
          No hay comercial con conexión Composio activa.
          <br />
          Configura un comercial en{" "}
          <code>/api/composio/connect</code> primero.
        </div>
      )}

      {/* --- Session header --- */}
      {session && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: 20,
                  background: stateInfo?.color ?? "#6b7280",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {stateInfo?.label ?? session.state}
              </span>
              <span style={{ fontSize: 13, color: "#374151" }}>
                Ronda {session.currentRound}/{session.maxRounds}
              </span>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                ID: {session.id.slice(0, 12)}...
              </span>
              {lastIntent && (
                <span style={{ fontSize: 12, color: "#6366f1" }}>
                  Intent: {lastIntent}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={refreshSession}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Refrescar
              </button>
              <button
                onClick={resetTest}
                disabled={loading}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#dc2626",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 13,
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {/* --- Extra info --- */}
          {(session.calendarLink ||
            session.escalationReason ||
            session.visitorName) && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {session.calendarLink && (
                <div>
                  📅 Evento Calendar:{" "}
                  <a
                    href={session.calendarLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2563eb" }}
                  >
                    {session.calendarLink}
                  </a>
                </div>
              )}
              {session.visitorName && (
                <div>
                  👤 Visitante: {session.visitorName} — {session.visitorPhone}
                </div>
              )}
              {session.escalationReason && (
                <div style={{ color: "#dc2626" }}>
                  ⚠ Escalado: {session.escalationReason}
                </div>
              )}
            </div>
          )}

          {/* --- Loading bar --- */}
          {loading && (
            <div
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                fontSize: 13,
                color: "#1d4ed8",
                textAlign: "center",
              }}
            >
              ⏳ {loadingMessage || "Procesando..."}
            </div>
          )}

          {/* --- Chat panels --- */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* COMMERCIAL PANEL */}
            <ChatPanel
              title={`Comercial (${setup?.comercial?.nombre ?? session.comercialWaId})`}
              subtitle={session.comercialWaId ?? ""}
              messages={commercialMessages}
              endRef={commercialEndRef}
              inputValue={commercialInput}
              onInputChange={setCommercialInput}
              onSend={(text) => {
                sendResponse("commercial", text);
                setCommercialInput("");
              }}
              onButtonClick={(buttonId, title) => {
                sendResponse("commercial", title, buttonId);
              }}
              disabled={loading}
              accentColor="#059669"
            />

            {/* BUYER PANEL */}
            <ChatPanel
              title="Comprador (Test)"
              subtitle={buyerWaId ?? "34600999888"}
              messages={buyerMessages}
              endRef={buyerEndRef}
              inputValue={buyerInput}
              onInputChange={setBuyerInput}
              onSend={(text) => {
                sendResponse("buyer", text);
                setBuyerInput("");
              }}
              onButtonClick={(buttonId, title) => {
                sendResponse("buyer", title, buttonId);
              }}
              disabled={loading}
              accentColor="#2563eb"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Panel
// ---------------------------------------------------------------------------

function ChatPanel({
  title,
  subtitle,
  messages,
  endRef,
  inputValue,
  onInputChange,
  onSend,
  onButtonClick,
  disabled,
  accentColor,
}: {
  title: string;
  subtitle: string;
  messages: CapturedMessage[];
  endRef: React.RefObject<HTMLDivElement | null>;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
  onButtonClick: (buttonId: string, title: string) => void;
  disabled: boolean;
  accentColor: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: 600,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: accentColor,
          color: "white",
          padding: "12px 16px",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{subtitle}</div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          background: "#f3f4f6",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 13,
              marginTop: 24,
            }}
          >
            Sin mensajes aún...
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onButtonClick={onButtonClick}
            disabled={disabled}
          />
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 12,
          borderTop: "1px solid #e5e7eb",
          background: "white",
        }}
      >
        <input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputValue.trim() && !disabled) {
              onSend(inputValue.trim());
            }
          }}
          placeholder="Escribe un mensaje..."
          disabled={disabled}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 20,
            border: "1px solid #d1d5db",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={() => {
            if (inputValue.trim()) onSend(inputValue.trim());
          }}
          disabled={disabled || !inputValue.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            background:
              !disabled && inputValue.trim() ? accentColor : "#d1d5db",
            color: "white",
            border: "none",
            cursor:
              !disabled && inputValue.trim() ? "pointer" : "not-allowed",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  onButtonClick,
  disabled,
}: {
  message: CapturedMessage;
  onButtonClick: (buttonId: string, title: string) => void;
  disabled: boolean;
}) {
  const isInbound = message.direction === "inbound";
  const isTemplate = message.type === "template";

  return (
    <div
      style={{
        alignSelf: isInbound ? "flex-end" : "flex-start",
        maxWidth: "85%",
      }}
    >
      <div
        style={{
          background: isInbound ? "#dcfce7" : "white",
          borderRadius: 12,
          padding: "10px 14px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        }}
      >
        {isTemplate && message.templateName && (
          <div
            style={{
              fontSize: 11,
              color: "#6b7280",
              marginBottom: 4,
              fontStyle: "italic",
            }}
          >
            📋 Template: {message.templateName}
          </div>
        )}

        <div
          style={{
            fontSize: 14,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            color: "#1f2937",
          }}
        >
          {message.text || "(sin texto)"}
        </div>

        {message.buttons.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 10,
              borderTop: "1px solid #e5e7eb",
              paddingTop: 10,
            }}
          >
            {message.buttons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => onButtonClick(btn.id, btn.title)}
                disabled={disabled}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #3b82f6",
                  background: disabled ? "#e5e7eb" : "#eff6ff",
                  color: disabled ? "#9ca3af" : "#2563eb",
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "center",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!disabled) {
                    (e.target as HTMLButtonElement).style.background = "#dbeafe";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled) {
                    (e.target as HTMLButtonElement).style.background = "#eff6ff";
                  }
                }}
              >
                {btn.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#9ca3af",
          marginTop: 2,
          textAlign: isInbound ? "right" : "left",
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        {new Date(message.timestamp).toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </div>
    </div>
  );
}
