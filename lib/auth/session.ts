/**
 * Server-side session abstraction for role-based access control.
 *
 * Uses Better Auth to resolve sessions from cookies.
 * Provides helper functions for API route guards.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export type AppRole = "ceo" | "admin" | "comercial";

export interface AppSession {
  userId: string;
  role: AppRole;
  comercialId: string | null;
  nombre: string;
  email: string;
}

/**
 * Resolves comercialId from Better Auth session, falling back to a
 * direct Prisma lookup when the session doesn't include it (e.g.
 * stale token, Better Auth not returning additionalFields).
 */
async function resolveComercialId(
  userId: string,
  role: string,
  sessionValue: unknown,
): Promise<string | null> {
  if (typeof sessionValue === "string" && sessionValue.length > 0) {
    return sessionValue;
  }
  if (role !== "comercial") return null;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { comercialId: true },
    });
    return dbUser?.comercialId ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the current session from the request headers (cookies).
 * Returns null if no valid session exists.
 */
export async function getSession(): Promise<AppSession | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  // Better Auth stores `banned` in DB but does not reject sessions automatically.
  const userRecord = session.user as Record<string, unknown>;
  if (userRecord.banned === true) {
    return null;
  }

  const role = (session.user.role as AppRole) ?? "comercial";
  const rawComercialId = userRecord.comercialId;
  const comercialId = await resolveComercialId(session.user.id, role, rawComercialId);

  return {
    userId: session.user.id,
    role,
    comercialId,
    nombre: session.user.name,
    email: session.user.email,
  };
}

/**
 * Get session from a raw Request object (for API routes that receive `request`).
 */
export async function getSessionFromRequest(request: Request): Promise<AppSession | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return null;
  }

  const userRecord = session.user as Record<string, unknown>;
  if (userRecord.banned === true) {
    return null;
  }

  const role = (session.user.role as AppRole) ?? "comercial";
  const rawComercialId = userRecord.comercialId;
  const comercialId = await resolveComercialId(session.user.id, role, rawComercialId);

  return {
    userId: session.user.id,
    role,
    comercialId,
    nombre: session.user.name,
    email: session.user.email,
  };
}

/**
 * Guard: returns 401 response if not authenticated.
 */
export function unauthorized() {
  return new Response(JSON.stringify({ ok: false, error: "No autenticado" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Guard: returns 403 response if not authorized.
 */
export function forbidden() {
  return new Response(JSON.stringify({ ok: false, error: "Sin permisos" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Check if a role is CEO or Admin (equivalent access).
 */
export function isCeoOrAdmin(role: AppRole): boolean {
  return role === "ceo" || role === "admin";
}
