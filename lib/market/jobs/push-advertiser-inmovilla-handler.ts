/**
 * Handler `MARKET_PUSH_ADVERTISER_TO_INMOVILLA`.
 *
 * Toma un `MarketAdvertiser` y lo registra como cliente en Inmovilla
 * via su API REST v1 (`POST /clientes/`). Reusa `searchClient` para
 * deduplicar por telefono antes de crear, y persiste el `cod_cli`
 * resultante en `MarketAdvertiser.inmovillaContactId`.
 *
 * Reglas:
 *  - Si `phoneCanonical` es `null`, no-op (skipped). Decision producto:
 *    no creamos contactos sin telefono, ya que toda la propuesta de
 *    captacion gira alrededor de poder llamar al publicante.
 *  - Si `inmovillaContactId` ya esta seteado, no-op (already linked).
 *  - Si `searchClient` devuelve un cliente, reutilizamos ese `cod_cli`.
 *  - Idempotencia adicional: el endpoint `/api/market/advertisers/.../inmovilla-contact`
 *    encola con idempotency key estable por advertiser. El handler en si
 *    es idempotente por la presencia de `inmovillaContactId`.
 *  - Respeta el circuit breaker compartido `egestion-inmovilla` (mismo
 *    que `WRITE_TO_INMOVILLA`).
 */

import { prisma } from "@/lib/prisma";
import {
  canExecute,
  recordFailure,
  recordSuccess,
} from "@/lib/circuit-breaker";
import {
  createInmovillaRestClient,
  type InmovillaRestClient,
} from "@/lib/inmovilla/rest";
import { createClient, searchClient } from "@/lib/inmovilla/rest/clients";
import type {
  Cliente,
  CreateClientPayload,
  CreateClientResponse,
} from "@/lib/inmovilla/rest/types";
import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "@/lib/workers/consumer/types";

const EGESTION_CIRCUIT_ID = "egestion-inmovilla";
const ES_PREFIX = 34;

interface PushPayload {
  advertiserId?: string;
}

export interface PushAdvertiserDeps {
  buildClient?: () => InmovillaRestClient;
}

export async function handleMarketPushAdvertiserToInmovilla(
  job: JobRecord,
  deps: PushAdvertiserDeps = {},
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as PushPayload;
  if (!payload.advertiserId) {
    return {
      success: false,
      error: "MARKET_PUSH_ADVERTISER_TO_INMOVILLA sin advertiserId",
      permanent: true,
    };
  }

  const advertiser = await prisma.marketAdvertiser.findUnique({
    where: { id: payload.advertiserId },
    include: {
      listings: {
        orderBy: { lastSeenAt: "desc" },
        take: 1,
      },
    },
  });

  if (!advertiser) {
    return {
      success: false,
      error: `MarketAdvertiser ${payload.advertiserId} no existe`,
      permanent: true,
    };
  }

  if (advertiser.inmovillaContactId) {
    return {
      success: true,
      scoredPayload: {
        advertiserId: advertiser.id,
        outcome: "already_linked",
        inmovillaContactId: advertiser.inmovillaContactId,
      },
    };
  }

  if (!advertiser.phoneCanonical) {
    return {
      success: true,
      scoredPayload: {
        advertiserId: advertiser.id,
        outcome: "skipped_no_phone",
      },
    };
  }

  const breaker = await canExecute(EGESTION_CIRCUIT_ID);
  if (!breaker.allowed) {
    return {
      success: false,
      error: `Circuit breaker OPEN para ${EGESTION_CIRCUIT_ID} (${breaker.state.failureCount} fallos consecutivos)`,
    };
  }

  let client: InmovillaRestClient;
  try {
    client = deps.buildClient?.() ?? createInmovillaRestClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Inmovilla REST mal configurado: ${message}`,
      permanent: true,
    };
  }

  const phoneLocal = stripEsPrefix(advertiser.phoneCanonical);
  if (!phoneLocal) {
    return {
      success: true,
      scoredPayload: {
        advertiserId: advertiser.id,
        outcome: "skipped_invalid_phone",
        phoneCanonical: advertiser.phoneCanonical,
      },
    };
  }

  try {
    const matches = await searchClient(client, { telefono: phoneLocal });
    let codCli: string | null = pickCodCli(matches);
    let outcome: "linked_existing" | "created" = "linked_existing";

    if (!codCli) {
      const created = await createClientFromAdvertiser({
        client,
        nombre: advertiser.displayName,
        phoneLocal,
        primaryListingUrl: advertiser.listings[0]?.canonicalUrl ?? null,
      });
      codCli = String(created.cod_cli);
      outcome = "created";
    }

    await prisma.marketAdvertiser.update({
      where: { id: advertiser.id },
      data: { inmovillaContactId: codCli },
    });

    await recordSuccess(EGESTION_CIRCUIT_ID);
    return {
      success: true,
      scoredPayload: {
        advertiserId: advertiser.id,
        outcome,
        inmovillaContactId: codCli,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(EGESTION_CIRCUIT_ID, message);
    return {
      success: false,
      error: `Inmovilla REST fallo: ${message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickCodCli(matches: Cliente[]): string | null {
  for (const match of matches) {
    if (match.cod_cli != null) return String(match.cod_cli);
  }
  return null;
}

function stripEsPrefix(phoneCanonical: string): number | null {
  // phoneCanonical ya viene en E.164 (lib/market/phone.ts). Inmovilla usa
  // telefono1 como integer y prefijotel1 separado.
  if (phoneCanonical.startsWith("+34")) {
    const local = phoneCanonical.slice(3);
    if (/^\d{9}$/.test(local)) return Number(local);
  }
  return null;
}

async function createClientFromAdvertiser(args: {
  client: InmovillaRestClient;
  nombre: string | null;
  phoneLocal: number;
  primaryListingUrl: string | null;
}): Promise<CreateClientResponse> {
  const nombre = (args.nombre ?? "").trim() || "Contacto Mercado";
  const observacion = buildObservacion(args.primaryListingUrl);

  const payload: CreateClientPayload = {
    nombre,
    apellidos: "",
    email: "",
    telefono1: args.phoneLocal,
    prefijotel1: ES_PREFIX,
    observacion,
  };

  return createClient(args.client, payload);
}

function buildObservacion(primaryListingUrl: string | null): string {
  const lines = [
    "Contacto creado desde Captacion · Oportunidades de mercado.",
    `Capturado el ${new Date().toISOString()}.`,
  ];
  if (primaryListingUrl) {
    lines.push(`Anuncio principal: ${primaryListingUrl}`);
  }
  return lines.join("\n");
}
