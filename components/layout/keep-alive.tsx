"use client";

import { usePathname } from "next/navigation";
import {
    createContext,
    useCallback,
    useContext,
    useRef,
    useEffect,
    type ReactNode,
    type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";

// ── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry {
    pathname: string;
    node: ReactNode;
    host: HTMLDivElement;
}

interface KeepAliveApi {
    evict: (pathname: string) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const KeepAliveCtx = createContext<KeepAliveApi>({ evict: () => {} });

export function useKeepAlive() {
    return useContext(KeepAliveCtx);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function useLazyRef<T>(init: () => T): MutableRefObject<T> {
    const ref = useRef<T | null>(null);
    if (ref.current === null) ref.current = init();
    return ref as MutableRefObject<T>;
}

// ── Provider (wrap high in the tree so tabs bar can call evict) ──────────────

const CacheRef = createContext<MutableRefObject<CacheEntry[]> | null>(null);

export function KeepAliveProvider({ children }: { children: ReactNode }) {
    const cache = useLazyRef<CacheEntry[]>(() => []);

    const evict = useCallback(
        (target: string) => {
            const idx = cache.current.findIndex((e) => e.pathname === target);
            if (idx === -1) return;
            const entry = cache.current[idx];
            entry.host?.remove();
            cache.current.splice(idx, 1);
        },
        [cache],
    );

    return (
        <CacheRef.Provider value={cache}>
            <KeepAliveCtx.Provider value={{ evict }}>
                {children}
            </KeepAliveCtx.Provider>
        </CacheRef.Provider>
    );
}

// ── Outlet (renders the portals — place where `children` goes) ──────────────

/**
 * Keeps previously-visited platform pages mounted in the DOM.
 *
 * Each pathname gets a persistent host `<div>`. The current page's `children`
 * are portalled into it; old hosts stay hidden (`display:none`) so their React
 * subtree (state, effects, fetched data, scroll) survives across tab switches.
 */
export function KeepAliveOutlet({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const cache = useContext(CacheRef);
    const rootElRef = useRef<HTMLDivElement | null>(null);

    const entries = cache?.current;

    if (entries) {
        const existing = entries.find((e) => e.pathname === pathname);
        if (existing) {
            existing.node = children;
        } else if (typeof document !== "undefined") {
            const host = document.createElement("div");
            entries.push({ pathname, node: children, host });
        }

        for (const entry of entries) {
            if (entry.host) {
                entry.host.style.display =
                    entry.pathname === pathname ? "" : "none";
            }
        }
    }

    useEffect(() => {
        const root = rootElRef.current;
        if (!root || !entries) return;
        for (const entry of entries) {
            if (entry.host && !root.contains(entry.host)) {
                root.appendChild(entry.host);
            }
        }
    });

    if (!entries) return <>{children}</>;

    return (
        <>
            <div ref={rootElRef} />
            {entries
                .filter((e) => e.host)
                .map((entry) =>
                    createPortal(entry.node, entry.host, entry.pathname),
                )}
        </>
    );
}
