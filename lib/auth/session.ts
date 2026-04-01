/**
 * Simulated session abstraction for role-based access control.
 *
 * While real authentication (NextAuth) does not exist, sessions are
 * conveyed via HTTP headers set by the client-side session provider.
 *
 * When real auth arrives, **only this file** needs to change — swap the
 * header-reading logic for the actual session/token lookup.
 */

export type AppRole = "ceo" | "comercial";

export interface AppSession {
  role: AppRole;
  /** Set when role === "comercial"; null for CEO. */
  comercialId: string | null;
  nombre: string;
}

export const HEADER_ROLE = "x-simulated-role";
export const HEADER_COMERCIAL_ID = "x-simulated-comercial-id";
export const HEADER_NOMBRE = "x-simulated-nombre";

const VALID_ROLES = new Set<string>(["ceo", "comercial"]);

const DEFAULT_SESSION: AppSession = {
  role: "ceo",
  comercialId: null,
  nombre: "CEO",
};

/**
 * Extract the current user session from the request.
 *
 * Falls back to CEO when headers are missing or inconsistent
 * (e.g. role=comercial without a comercialId).
 */
export function getSession(request: Request): AppSession {
  const rawRole = request.headers.get(HEADER_ROLE)?.trim().toLowerCase();
  if (!rawRole || !VALID_ROLES.has(rawRole)) return DEFAULT_SESSION;

  const role = rawRole as AppRole;
  const rawComercialId = request.headers.get(HEADER_COMERCIAL_ID)?.trim() || null;
  const nombre = request.headers.get(HEADER_NOMBRE)?.trim() || (role === "ceo" ? "CEO" : "Comercial");

  if (role === "comercial" && !rawComercialId) {
    return DEFAULT_SESSION;
  }

  return {
    role,
    comercialId: role === "comercial" ? rawComercialId : null,
    nombre,
  };
}
