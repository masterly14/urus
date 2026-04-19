"use client";

import { useSession as useBetterAuthSession } from "@/lib/auth/client";

export type AppRole = "ceo" | "admin" | "comercial";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  comercialId: string | null;
  image: string | null;
}

export interface SessionContextValue {
  user: AppUser | null;
  isPending: boolean;
  isCeo: boolean;
  isAdmin: boolean;
  isComercial: boolean;
  isCeoOrAdmin: boolean;
  comercialId: string | null;
}

const EMPTY_SESSION: SessionContextValue = {
  user: null,
  isPending: true,
  isCeo: false,
  isAdmin: false,
  isComercial: false,
  isCeoOrAdmin: false,
  comercialId: null,
};

/** Misma referencia en todos los renders (Better Auth manda cookies; sin headers extra). */
const STABLE_EMPTY_HEADERS: Record<string, string> = {};

export function useAppSession(): SessionContextValue {
  const { data: session, isPending } = useBetterAuthSession();

  if (isPending || !session?.user) {
    return { ...EMPTY_SESSION, isPending };
  }

  const user: AppUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: (session.user.role as AppRole) ?? "comercial",
    comercialId: (session.user as Record<string, unknown>).comercialId as string | null ?? null,
    image: session.user.image ?? null,
  };

  const isCeo = user.role === "ceo";
  const isAdmin = user.role === "admin";
  const isComercial = user.role === "comercial";

  return {
    user,
    isPending: false,
    isCeo,
    isAdmin,
    isComercial,
    isCeoOrAdmin: isCeo || isAdmin,
    comercialId: user.comercialId,
  };
}

/**
 * Backward-compatible alias.
 * Old code calls `useSession()` expecting `{ isCeo, isComercial, session, sessionHeaders, ... }`.
 * This bridges the gap so existing components keep working.
 *
 * `sessionHeaders` is now an empty object because Better Auth uses cookies
 * (sent automatically by the browser). Kept for API compatibility.
 */
export function useSession() {
  const s = useAppSession();
  return {
    ...s,
    session: s.user
      ? { role: s.user.role, comercialId: s.user.comercialId, nombre: s.user.name }
      : { role: "comercial" as AppRole, comercialId: null, nombre: "" },
    sessionHeaders: STABLE_EMPTY_HEADERS,
  };
}
