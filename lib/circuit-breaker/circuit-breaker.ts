import { prisma } from "@/lib/prisma";
import { alertGeneric } from "@/lib/alerts";
import type { CircuitState, CircuitBreakerConfig } from "./types";

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 5 * 60 * 1000, // 5 min
};

export async function getCircuitState(id: string): Promise<CircuitState> {
  const row = await prisma.circuitBreaker.upsert({
    where: { id },
    create: { id },
    update: {},
  });
  return row;
}

export async function canExecute(
  id: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
): Promise<{ allowed: boolean; state: CircuitState }> {
  const state = await getCircuitState(id);

  if (state.status === "CLOSED") {
    return { allowed: true, state };
  }

  if (state.status === "HALF_OPEN") {
    return { allowed: true, state };
  }

  // OPEN — check if cooldown has elapsed
  if (state.openedAt) {
    const elapsed = now.getTime() - state.openedAt.getTime();
    if (elapsed >= config.cooldownMs) {
      const updated = await prisma.circuitBreaker.update({
        where: { id },
        data: { status: "HALF_OPEN", halfOpenAt: now },
      });
      return { allowed: true, state: updated };
    }
  }

  return { allowed: false, state };
}

export async function recordSuccess(id: string): Promise<CircuitState> {
  const now = new Date();
  return prisma.circuitBreaker.upsert({
    where: { id },
    create: { id, status: "CLOSED", failureCount: 0, closedAt: now },
    update: { status: "CLOSED", failureCount: 0, closedAt: now },
  });
}

export async function recordFailure(
  id: string,
  error: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG,
): Promise<CircuitState> {
  const now = new Date();
  const state = await getCircuitState(id);
  const newCount = state.failureCount + 1;

  if (newCount >= config.failureThreshold && state.status !== "OPEN") {
    const updated = await prisma.circuitBreaker.update({
      where: { id },
      data: {
        status: "OPEN",
        failureCount: newCount,
        lastFailedAt: now,
        openedAt: now,
      },
    });

    alertGeneric(
      `Circuit breaker OPEN: ${id}`,
      "critical",
      {
        circuitId: id,
        failureCount: newCount,
        threshold: config.failureThreshold,
        cooldownMs: config.cooldownMs,
        lastError: error,
      },
    ).catch((err) => {
      console.error(
        `[circuit-breaker] Error emitiendo alerta: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return updated;
  }

  // Still under threshold or already OPEN — just bump count
  return prisma.circuitBreaker.update({
    where: { id },
    data: {
      failureCount: newCount,
      lastFailedAt: now,
    },
  });
}
