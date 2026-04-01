"use client";

import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import type { AppRole } from "@/lib/auth/session";
import { HEADER_ROLE, HEADER_COMERCIAL_ID, HEADER_NOMBRE } from "@/lib/auth/session";

export interface SimulatedUser {
  role: AppRole;
  comercialId: string | null;
  nombre: string;
}

export const CEO_USER: SimulatedUser = {
  role: "ceo",
  comercialId: null,
  nombre: "Miguel CEO",
};

interface SessionContextValue {
  session: SimulatedUser;
  setSession: (user: SimulatedUser) => void;
  isCeo: boolean;
  isComercial: boolean;
  comercialId: string | null;
  /** Headers that must be passed to every API fetch call. */
  sessionHeaders: Record<string, string>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SimulatedUser>(CEO_USER);

  const value = useMemo<SessionContextValue>(() => {
    const headers: Record<string, string> = {
      [HEADER_ROLE]: session.role,
    };
    if (session.comercialId) {
      headers[HEADER_COMERCIAL_ID] = session.comercialId;
    }
    if (session.nombre) {
      headers[HEADER_NOMBRE] = session.nombre;
    }

    return {
      session,
      setSession,
      isCeo: session.role === "ceo",
      isComercial: session.role === "comercial",
      comercialId: session.comercialId,
      sessionHeaders: headers,
    };
  }, [session]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
