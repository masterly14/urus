"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Role } from "@/lib/mock-data/types";

interface RoleContextValue {
    role: Role;
    setRole: (role: Role) => void;
    isCeo: boolean;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState<Role>("ceo");

    return (
        <RoleContext.Provider value= {{ role, setRole, isCeo: role === "ceo" }
}>
    { children }
    </RoleContext.Provider>
    );
}

export function useRole(): RoleContextValue {
    const ctx = useContext(RoleContext);
    if (!ctx) throw new Error("useRole must be used within a RoleProvider");
    return ctx;
}
