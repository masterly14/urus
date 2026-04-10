/**
 * Server-side session abstraction for role-based access control.
 *
 * Uses Better Auth to resolve sessions from cookies.
 * Provides helper functions for API route guards.
 */

import { auth } from "@/lib/auth";
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

  return {
    userId: session.user.id,
    role: (session.user.role as AppRole) ?? "comercial",
    comercialId: (session.user as Record<string, unknown>).comercialId as string | null ?? null,
    nombre: session.user.name,
    email: session.user.email,
  };
}

/**
 * Get session from a raw Request object (for API routes that receive `request`).
 * Falls back to the headers-based approach.
 */
export async function getSessionFromRequest(request: Request): Promise<AppSession | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return null;
  }

  return {
    userId: session.user.id,
    role: (session.user.role as AppRole) ?? "comercial",
    comercialId: (session.user as Record<string, unknown>).comercialId as string | null ?? null,
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
