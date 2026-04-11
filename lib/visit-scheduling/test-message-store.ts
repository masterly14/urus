/**
 * Store en memoria para mensajes capturados durante tests interactivos
 * del flujo de agendamiento de visitas.
 *
 * No persiste entre reinicios del servidor — eso es intencional.
 * Solo se usa cuando el test interceptor está activo.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapturedButton {
  id: string;
  title: string;
}

export interface CapturedMessage {
  id: string;
  sessionId: string;
  timestamp: number;
  to: string;
  /** waId del remitente (solo para inbound). */
  from?: string;
  /** 'outbound' = sistema → usuario, 'inbound' = usuario → sistema */
  direction: "outbound" | "inbound";
  type: "text" | "template" | "interactive";
  text: string;
  buttons: CapturedButton[];
  templateName?: string;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const store = new Map<string, CapturedMessage[]>();

type RawCapture = {
  to: string;
  type: "text" | "template" | "interactive";
  payload: unknown;
};

let captureBuffer: RawCapture[] = [];
let isCapturing = false;

// ---------------------------------------------------------------------------
// Message extraction helpers
// ---------------------------------------------------------------------------

function extractFromText(payload: Record<string, unknown>): {
  text: string;
  buttons: CapturedButton[];
} {
  return { text: (payload.body as string) ?? "", buttons: [] };
}

function extractFromTemplate(payload: Record<string, unknown>): {
  text: string;
  buttons: CapturedButton[];
  templateName: string;
} {
  const name = (payload.name as string) ?? "unknown";
  const components =
    (payload.components as Array<Record<string, unknown>>) ?? [];

  const params: string[] = [];
  for (const comp of components) {
    const ps = (comp.parameters as Array<Record<string, unknown>>) ?? [];
    for (const p of ps) {
      if (p.text) params.push(String(p.text));
    }
  }

  return {
    text: params.length > 0 ? params.join(" · ") : `[${name}]`,
    buttons: [],
    templateName: name,
  };
}

function extractFromInteractive(payload: Record<string, unknown>): {
  text: string;
  buttons: CapturedButton[];
} {
  const body = payload.body as Record<string, unknown> | undefined;
  const text = (body?.text as string) ?? "";

  const action = payload.action as Record<string, unknown> | undefined;
  const rawButtons =
    (action?.buttons as Array<Record<string, unknown>>) ?? [];

  const buttons: CapturedButton[] = rawButtons.map((b) => {
    const reply = b.reply as Record<string, unknown> | undefined;
    return {
      id: (reply?.id as string) ?? (b.id as string) ?? "",
      title: (reply?.title as string) ?? (b.title as string) ?? "",
    };
  });

  return { text, buttons };
}

function convertToMessage(raw: RawCapture, sessionId: string): CapturedMessage {
  const p = (raw.payload ?? {}) as Record<string, unknown>;
  let text = "";
  let buttons: CapturedButton[] = [];
  let templateName: string | undefined;

  switch (raw.type) {
    case "text": {
      const r = extractFromText(p);
      text = r.text;
      buttons = r.buttons;
      break;
    }
    case "template": {
      const r = extractFromTemplate(p);
      text = r.text;
      buttons = r.buttons;
      templateName = r.templateName;
      break;
    }
    case "interactive": {
      const r = extractFromInteractive(p);
      text = r.text;
      buttons = r.buttons;
      break;
    }
  }

  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    timestamp: Date.now(),
    to: raw.to,
    direction: "outbound",
    type: raw.type,
    text,
    buttons,
    templateName,
  };
}

// ---------------------------------------------------------------------------
// Capture API — usado por el interceptor en send.ts
// ---------------------------------------------------------------------------

/**
 * El interceptor de send.ts llama esta función.
 * Almacena en buffer temporal hasta que se asigne a una sesión.
 */
export function captureOutboundRaw(msg: RawCapture) {
  if (isCapturing) {
    captureBuffer.push(msg);
  }
}

/**
 * Inicia la captura de mensajes salientes.
 */
export function startCapture() {
  captureBuffer = [];
  isCapturing = true;
}

/**
 * Detiene la captura y asigna los mensajes bufferizados a una sesión.
 * Devuelve los mensajes recién capturados.
 */
export function stopCapture(sessionId: string): CapturedMessage[] {
  isCapturing = false;
  const messages = captureBuffer.map((raw) => convertToMessage(raw, sessionId));
  const list = store.get(sessionId) ?? [];
  list.push(...messages);
  store.set(sessionId, list);
  captureBuffer = [];
  return messages;
}

/**
 * Descarta la captura actual sin asignar a ninguna sesión.
 */
export function discardCapture() {
  isCapturing = false;
  captureBuffer = [];
}

// ---------------------------------------------------------------------------
// Session metadata (para resolver buyer/commercial en la UI)
// ---------------------------------------------------------------------------

const sessionMeta = new Map<
  string,
  { buyerWaId: string; comercialWaId: string }
>();

export function registerSessionMeta(
  sessionId: string,
  meta: { buyerWaId: string; comercialWaId: string },
) {
  sessionMeta.set(sessionId, meta);
}

export function getSessionMeta(sessionId: string) {
  return sessionMeta.get(sessionId) ?? null;
}

// ---------------------------------------------------------------------------
// Inbound messages (respuestas del usuario desde la UI)
// ---------------------------------------------------------------------------

export function captureInboundMessage(
  sessionId: string,
  from: string,
  text: string,
  buttonId?: string,
) {
  const captured: CapturedMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    timestamp: Date.now(),
    to: "system",
    from,
    direction: "inbound",
    type: buttonId ? "interactive" : "text",
    text: buttonId ? `[Botón] ${text}` : text,
    buttons: [],
  };

  const list = store.get(sessionId) ?? [];
  list.push(captured);
  store.set(sessionId, list);
}

// ---------------------------------------------------------------------------
// Read / Clear
// ---------------------------------------------------------------------------

export function getMessagesForSession(sessionId: string): CapturedMessage[] {
  return store.get(sessionId) ?? [];
}

export function clearSession(sessionId: string) {
  store.delete(sessionId);
  sessionMeta.delete(sessionId);
}

export function clearAll() {
  store.clear();
  sessionMeta.clear();
  isCapturing = false;
  captureBuffer = [];
}
