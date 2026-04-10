"use client";

/**
 * @deprecated Use `useSession()` from `@/lib/hooks/use-session` directly.
 */

import { useSession } from "./use-session";
import type { AppRole } from "@/lib/auth/session";

export function useRole(): { role: AppRole; isCeo: boolean } {
  const { session, isCeo } = useSession();
  return { role: session.role, isCeo };
}
