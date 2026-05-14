import type { WarmSession, WarmSessionPolicy } from "./types";

export const DEFAULT_WARM_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_WARM_SESSION_MAX_REQUESTS = 40;

export function isWarmSessionUsable(session: WarmSession, now = new Date()): boolean {
  return (
    session.status === "ACTIVE" &&
    session.expiresAt.getTime() > now.getTime() &&
    session.requestCount < session.maxRequests
  );
}

export function expiresAtForWarmSession(policy: Pick<WarmSessionPolicy, "ttlMs">, now = new Date()): Date {
  return new Date(now.getTime() + Math.max(1_000, policy.ttlMs));
}

export function resolveWarmSessionStatus(
  session: WarmSession,
  now = new Date(),
): "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "INVALIDATED" {
  if (session.status === "INVALIDATED") return "INVALIDATED";
  if (session.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  if (session.requestCount >= session.maxRequests) return "EXHAUSTED";
  return "ACTIVE";
}
