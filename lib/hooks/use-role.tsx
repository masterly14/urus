"use client";

/**
 * Backward-compatibility shim.
 *
 * New code should import from `@/lib/hooks/use-session` directly.
 * This file adapts the old `useRole()` API to the new session context
 * so that consumers not yet migrated keep working.
 */

import { useSession, CEO_USER, type SimulatedUser } from "./use-session";
import type { AppRole } from "@/lib/auth/session";

export { SessionProvider as RoleProvider } from "./use-session";

interface RoleContextValue {
  role: AppRole;
  setRole: (role: AppRole) => void;
  isCeo: boolean;
}

export function useRole(): RoleContextValue {
  const { session, setSession, isCeo } = useSession();

  const setRole = (role: AppRole) => {
    if (role === "ceo") {
      setSession(CEO_USER);
    } else {
      setSession({ role: "comercial", comercialId: null, nombre: "Comercial" } satisfies SimulatedUser);
    }
  };

  return { role: session.role, setRole, isCeo };
}
