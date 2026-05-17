import type { PortalWarmSession, PrismaClient, StatefoxPortalSource } from "@prisma/client";
import type { WarmSession, WarmedCookies } from "./types";

/**
 * Cliente Prisma "delgado" sobre el modelo `portalWarmSession`. Sirve para
 * desacoplar la capa de repo del singleton `@/lib/prisma`: el Market Worker
 * (Railway) instancia su propio `PrismaClient` apuntando a la misma DB y lo
 * inyecta aqui. El monolito Next sigue usando el singleton via
 * las funciones standalone exportadas mas abajo.
 */
export type WarmSessionPrismaClient = Pick<PrismaClient, "$executeRaw" | "$transaction"> & {
  portalWarmSession: PrismaClient["portalWarmSession"];
};

export function toWarmSession(row: PortalWarmSession): WarmSession {
  return {
    id: row.id,
    source: row.source,
    cookieHeader: row.cookieHeader,
    userAgent: row.userAgent,
    proxySession: row.proxySession ?? undefined,
    status: row.status,
    requestCount: row.requestCount,
    maxRequests: row.maxRequests,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt ?? undefined,
    warmedAt: row.warmedAt,
  };
}

/**
 * Repositorio del modelo `portalWarmSession` ligado a un `PrismaClient`
 * concreto. El monolito usa el singleton (`defaultRepo`); el Market Worker
 * inyecta su propio cliente via `createWarmSessionRepo(prisma)`.
 */
export interface WarmSessionRepo {
  getActiveWarmSession(args: {
    source: Exclude<StatefoxPortalSource, "unknown">;
    now?: Date;
  }): Promise<WarmSession | null>;
  expireStaleWarmSessions(args: {
    source: Exclude<StatefoxPortalSource, "unknown">;
    now?: Date;
  }): Promise<void>;
  recordWarmedSession(args: {
    source: Exclude<StatefoxPortalSource, "unknown">;
    warmed: WarmedCookies;
    expiresAt: Date;
    maxRequests: number;
  }): Promise<WarmSession>;
  incrementWarmSessionUsage(sessionId: string): Promise<void>;
  invalidateWarmSession(sessionId: string, reason: string): Promise<void>;
  invalidateActiveWarmSessions(args: {
    source: Exclude<StatefoxPortalSource, "unknown">;
    reason: string;
  }): Promise<number>;
}

/**
 * Construye un repo asociado al `PrismaClient` recibido. Sin estado: la
 * misma instancia de repo puede usarse desde multiples llamadas concurrentes.
 */
export function createWarmSessionRepo(prisma: WarmSessionPrismaClient): WarmSessionRepo {
  return {
    async getActiveWarmSession(args) {
      const now = args.now ?? new Date();
      const row = await prisma.portalWarmSession.findFirst({
        where: {
          source: args.source,
          status: "ACTIVE",
          expiresAt: { gt: now },
          requestCount: { lt: prisma.portalWarmSession.fields.maxRequests },
        },
        orderBy: { warmedAt: "desc" },
      });
      return row ? toWarmSession(row) : null;
    },

    async expireStaleWarmSessions(args) {
      const now = args.now ?? new Date();
      await prisma.portalWarmSession.updateMany({
        where: {
          source: args.source,
          status: "ACTIVE",
          expiresAt: { lte: now },
        },
        data: {
          status: "EXPIRED",
          invalidatedAt: now,
          invalidReason: "TTL vencido",
        },
      });
      await prisma.portalWarmSession.updateMany({
        where: {
          source: args.source,
          status: "ACTIVE",
          requestCount: { gte: prisma.portalWarmSession.fields.maxRequests },
        },
        data: {
          status: "EXHAUSTED",
          invalidatedAt: now,
          invalidReason: "Máximo de usos alcanzado",
        },
      });
    },

    async recordWarmedSession(args) {
      const row = await prisma.portalWarmSession.create({
        data: {
          source: args.source,
          cookieHeader: args.warmed.cookieHeader,
          userAgent: args.warmed.userAgent,
          proxySession: args.warmed.proxySession,
          maxRequests: args.maxRequests,
          expiresAt: args.expiresAt,
        },
      });
      return toWarmSession(row);
    },

    async incrementWarmSessionUsage(sessionId) {
      const now = new Date();
      const updated = await prisma.portalWarmSession.update({
        where: { id: sessionId },
        data: {
          requestCount: { increment: 1 },
          lastUsedAt: now,
        },
      });
      if (updated.requestCount >= updated.maxRequests && updated.status === "ACTIVE") {
        await prisma.portalWarmSession.update({
          where: { id: sessionId },
          data: {
            status: "EXHAUSTED",
            invalidatedAt: now,
            invalidReason: "Máximo de usos alcanzado",
          },
        });
      }
    },

    async invalidateWarmSession(sessionId, reason) {
      await prisma.portalWarmSession
        .update({
          where: { id: sessionId },
          data: {
            status: "INVALIDATED",
            invalidatedAt: new Date(),
            invalidReason: reason,
          },
        })
        .catch(() => undefined);
    },

    async invalidateActiveWarmSessions(args) {
      const result = await prisma.portalWarmSession.updateMany({
        where: {
          source: args.source,
          status: "ACTIVE",
        },
        data: {
          status: "INVALIDATED",
          invalidatedAt: new Date(),
          invalidReason: args.reason,
        },
      });
      return result.count;
    },
  };
}

/**
 * Repo singleton ligado al `prisma` del monolito. Lo usa Statefox image cache
 * y los handlers del job queue del monolito.
 *
 * Lazy: `@/lib/prisma` no se resuelve hasta la primera llamada a una API
 * legacy. Esto permite que consumidores que NO usan la API legacy (p.ej. el
 * Market Worker en Railway, que inyecta su propio `PrismaClient` via
 * `createWarmSessionRepo`) puedan importar este modulo sin necesitar el
 * singleton del monolito en su filesystem ni en su grafo de modulos.
 *
 * Usamos `import()` dinamico (no `require()`) para que vitest pueda seguir
 * interceptando el modulo via `vi.mock("@/lib/prisma", ...)` y porque
 * Next/tsx resuelven el alias `@/...` igual en ambos modos.
 */
let _defaultRepo: WarmSessionRepo | null = null;

async function getDefaultRepo(): Promise<WarmSessionRepo> {
  if (_defaultRepo) return _defaultRepo;
  const mod = await import("@/lib/prisma");
  _defaultRepo = createWarmSessionRepo(
    mod.prisma as unknown as WarmSessionPrismaClient,
  );
  return _defaultRepo;
}

// ---------------------------------------------------------------------------
// API legacy: funciones standalone que delegan al `defaultRepo` (singleton).
// Las callers de Statefox y del CLI legacy las siguen usando sin cambios.
// El Market Worker NO debe usar estas: tiene su propio repo via
// createWarmSessionRepo(workerPrisma).
// ---------------------------------------------------------------------------

export async function getActiveWarmSession(args: {
  source: Exclude<StatefoxPortalSource, "unknown">;
  now?: Date;
}): Promise<WarmSession | null> {
  const repo = await getDefaultRepo();
  return repo.getActiveWarmSession(args);
}

export async function expireStaleWarmSessions(args: {
  source: Exclude<StatefoxPortalSource, "unknown">;
  now?: Date;
}): Promise<void> {
  const repo = await getDefaultRepo();
  return repo.expireStaleWarmSessions(args);
}

export async function recordWarmedSession(args: {
  source: Exclude<StatefoxPortalSource, "unknown">;
  warmed: WarmedCookies;
  expiresAt: Date;
  maxRequests: number;
}): Promise<WarmSession> {
  const repo = await getDefaultRepo();
  return repo.recordWarmedSession(args);
}

export async function incrementWarmSessionUsage(sessionId: string): Promise<void> {
  const repo = await getDefaultRepo();
  return repo.incrementWarmSessionUsage(sessionId);
}

export async function invalidateWarmSession(sessionId: string, reason: string): Promise<void> {
  const repo = await getDefaultRepo();
  return repo.invalidateWarmSession(sessionId, reason);
}

export async function invalidateActiveWarmSessions(args: {
  source: Exclude<StatefoxPortalSource, "unknown">;
  reason: string;
}): Promise<number> {
  const repo = await getDefaultRepo();
  return repo.invalidateActiveWarmSessions(args);
}
