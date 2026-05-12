/**
 * Validación de la conexión Gmail en Composio para el flujo 2FA de Inmovilla.
 *
 * Esta capa garantiza que **antes** de invocar al agente extractor de código 2FA,
 * exista una cuenta Composio Gmail en estado `ACTIVE` para el `COMPOSIO_USER_ID`
 * correspondiente. Si no la hay, lanzamos un error tipado para que los callers
 * (login Inmovilla, ingestion:demands, cron de health) puedan:
 *   - Disparar alerta accionable.
 *   - Evitar reintentos inútiles.
 *   - Devolver un código de error consistente con el resto de la observabilidad.
 *
 * El SDK de Composio (`@composio/core`) expone `composio.connectedAccounts`
 * con `list({ userIds })` y `retrieve(id)`. La forma exacta del payload puede
 * variar entre versiones del SDK; tipamos lo mínimo y normalizamos campos.
 */

/**
 * No tipamos el parámetro como `Composio` directamente porque es genérico en el
 * provider (`Composio<OpenAIProvider>` vs `Composio<OpenAIAgentsProvider>`) y
 * los callers usan distintos providers. Solo dependemos del subobjeto
 * `connectedAccounts`, así que aceptamos cualquier objeto compatible.
 */
export type ComposioForGmail = {
  connectedAccounts?: ConnectedAccountsApi;
};

export type ComposioGmailConnectionStatus =
  | "ACTIVE"
  | "INITIALIZING"
  | "INITIATED"
  | "EXPIRED"
  | "FAILED"
  | "INACTIVE"
  | "UNKNOWN";

export interface ComposioGmailConnection {
  id: string;
  status: ComposioGmailConnectionStatus;
  toolkitSlug: string;
  updatedAt?: string;
  createdAt?: string;
}

export class ComposioGmailNotConnectedError extends Error {
  readonly code = "COMPOSIO_GMAIL_NOT_CONNECTED" as const;
  readonly userId: string;
  readonly expectedConnectionId?: string;
  readonly observedStatus?: ComposioGmailConnectionStatus;

  constructor(
    message: string,
    opts: {
      userId: string;
      expectedConnectionId?: string;
      observedStatus?: ComposioGmailConnectionStatus;
    },
  ) {
    super(message);
    this.name = "ComposioGmailNotConnectedError";
    this.userId = opts.userId;
    this.expectedConnectionId = opts.expectedConnectionId;
    this.observedStatus = opts.observedStatus;
  }
}

interface RawConnectedAccount {
  id?: unknown;
  status?: unknown;
  toolkit?: { slug?: unknown };
  data?: { status?: unknown };
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface RawConnectedAccountsListResponse {
  items?: RawConnectedAccount[];
}

function normalizeStatus(value: unknown): ComposioGmailConnectionStatus {
  if (typeof value !== "string") return "UNKNOWN";
  const upper = value.toUpperCase();
  switch (upper) {
    case "ACTIVE":
    case "INITIALIZING":
    case "INITIATED":
    case "EXPIRED":
    case "FAILED":
    case "INACTIVE":
      return upper;
    default:
      return "UNKNOWN";
  }
}

function normalizeAccount(raw: RawConnectedAccount): ComposioGmailConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  const toolkitSlug =
    typeof raw.toolkit?.slug === "string" ? raw.toolkit.slug : "unknown";
  const statusRaw = raw.status ?? raw.data?.status;
  return {
    id,
    status: normalizeStatus(statusRaw),
    toolkitSlug,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

interface ConnectedAccountsApi {
  list?: (args: {
    userIds?: string[];
    toolkitSlugs?: string[];
  }) => Promise<RawConnectedAccountsListResponse>;
  retrieve?: (id: string) => Promise<RawConnectedAccount>;
}

function getConnectedAccountsApi(composio: ComposioForGmail): ConnectedAccountsApi {
  return composio.connectedAccounts ?? {};
}

async function fetchByFixedId(
  composio: ComposioForGmail,
  connectionId: string,
): Promise<ComposioGmailConnection | null> {
  const api = getConnectedAccountsApi(composio);
  if (typeof api.retrieve !== "function") return null;
  try {
    const raw = await api.retrieve(connectionId);
    return normalizeAccount(raw ?? {});
  } catch (err) {
    throw new Error(
      `Composio.connectedAccounts.retrieve("${connectionId}") falló: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function fetchActiveGmailForUser(
  composio: ComposioForGmail,
  userId: string,
): Promise<ComposioGmailConnection | null> {
  const api = getConnectedAccountsApi(composio);
  if (typeof api.list !== "function") return null;
  const response = await api.list({
    userIds: [userId],
    toolkitSlugs: ["gmail"],
  });
  const items = Array.isArray(response?.items) ? response.items : [];
  const candidates = items
    .map(normalizeAccount)
    .filter((acc): acc is ComposioGmailConnection => acc !== null)
    .filter((acc) => acc.toolkitSlug === "gmail");

  const active = candidates.find((acc) => acc.status === "ACTIVE");
  return active ?? candidates[0] ?? null;
}

/**
 * Devuelve la conexión Gmail activa anclada por env (preferido) o, si no se
 * configuró, busca la única conexión activa del usuario.
 *
 * @throws {ComposioGmailNotConnectedError} si no hay cuenta `ACTIVE` disponible.
 */
export async function getActiveGmailConnection(
  composio: ComposioForGmail,
  userId: string,
): Promise<ComposioGmailConnection> {
  const fixedId = process.env.COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID?.trim();

  if (fixedId) {
    const account = await fetchByFixedId(composio, fixedId);
    if (!account) {
      throw new ComposioGmailNotConnectedError(
        `Composio: no se encontró la conexión Gmail anclada (COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID="${fixedId}").`,
        { userId, expectedConnectionId: fixedId },
      );
    }
    if (account.status !== "ACTIVE") {
      throw new ComposioGmailNotConnectedError(
        `Composio: conexión Gmail anclada en estado ${account.status} (esperado ACTIVE). Reautoriza en https://app.composio.dev.`,
        {
          userId,
          expectedConnectionId: fixedId,
          observedStatus: account.status,
        },
      );
    }
    return account;
  }

  const account = await fetchActiveGmailForUser(composio, userId);
  if (!account) {
    throw new ComposioGmailNotConnectedError(
      `Composio: no hay ninguna conexión Gmail registrada para userId="${userId}". Crea la conexión en https://app.composio.dev y/o anclala con COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID.`,
      { userId },
    );
  }
  if (account.status !== "ACTIVE") {
    throw new ComposioGmailNotConnectedError(
      `Composio: la única conexión Gmail para userId="${userId}" está en estado ${account.status}. Reautoriza el OAuth en https://app.composio.dev.`,
      { userId, observedStatus: account.status },
    );
  }
  return account;
}
