import type { StatefoxPortalSource } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { expiresAtForWarmSession } from "./policy";
import { createWarmSessionRepo, toWarmSession, type WarmSessionPrismaClient } from "./repo";
import { warmPortalSession } from "./warm";
import type { WarmSessionAcquireResult, WarmSessionRequest } from "./types";

function warmSessionLockKey(source: StatefoxPortalSource): string {
  return `portal-warm-session:${source}`;
}

/**
 * Construye un `acquireWarmSession` ligado al `PrismaClient` recibido.
 *
 * Invariante: la transaccion + advisory lock se ejecutan sobre el mismo
 * cliente que el repo. Esto es lo que permite al Market Worker (Railway)
 * usar su propio `PrismaClient` sin tocar el monolito.
 */
export function createWarmSessionAcquire(prisma: WarmSessionPrismaClient) {
  const repo = createWarmSessionRepo(prisma);

  return async function acquire(
    request: WarmSessionRequest,
  ): Promise<WarmSessionAcquireResult> {
    if (!request.policy.enabled) {
      return { status: "unavailable", reason: "STATEFOX_WARM_SESSION_ENABLED=false" };
    }

    await repo.expireStaleWarmSessions({ source: request.source });
    const active = await repo.getActiveWarmSession({ source: request.source });
    if (active) {
      return { status: "ready", session: active, warmed: false };
    }

    if (!request.brightDataUrl) {
      return {
        status: "unavailable",
        reason:
          "No hay warm session activa y BRIGHTDATA_SCRAPING_BROWSER_URL no está configurada",
      };
    }

    const warmed = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${warmSessionLockKey(
          request.source,
        )}))`;

        const now = new Date();
        await tx.portalWarmSession.updateMany({
          where: {
            source: request.source,
            status: "ACTIVE",
            expiresAt: { lte: now },
          },
          data: {
            status: "EXPIRED",
            invalidatedAt: now,
            invalidReason: "TTL vencido",
          },
        });
        await tx.portalWarmSession.updateMany({
          where: {
            source: request.source,
            status: "ACTIVE",
            requestCount: { gte: tx.portalWarmSession.fields.maxRequests },
          },
          data: {
            status: "EXHAUSTED",
            invalidatedAt: now,
            invalidReason: "Máximo de usos alcanzado",
          },
        });

        const existing = await tx.portalWarmSession.findFirst({
          where: {
            source: request.source,
            status: "ACTIVE",
            expiresAt: { gt: now },
            requestCount: { lt: tx.portalWarmSession.fields.maxRequests },
          },
          orderBy: { warmedAt: "desc" },
        });
        if (existing) {
          return { session: toWarmSession(existing), warmed: false };
        }

        const cookies = await warmPortalSession(request);
        const row = await tx.portalWarmSession.create({
          data: {
            source: request.source,
            cookieHeader: cookies.cookieHeader,
            userAgent: cookies.userAgent,
            proxySession: cookies.proxySession,
            maxRequests: request.policy.maxRequests,
            expiresAt: expiresAtForWarmSession(request.policy, now),
          },
        });
        return { session: toWarmSession(row), warmed: true };
      },
      { timeout: Math.max(90_000, request.brightDataConnectTimeoutMs ?? 0) },
    );

    return { status: "ready", ...warmed };
  };
}

/**
 * API legacy: usa el `prisma` singleton del monolito. Statefox y el CLI
 * legacy llaman aqui sin cambios. El Market Worker debe usar
 * `createWarmSessionAcquire(workerPrisma)` en su lugar.
 */
const defaultAcquire = createWarmSessionAcquire(
  defaultPrisma as unknown as WarmSessionPrismaClient,
);

export function acquireWarmSession(
  request: WarmSessionRequest,
): Promise<WarmSessionAcquireResult> {
  return defaultAcquire(request);
}
