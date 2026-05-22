"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { GlobalHouseLoaderOverlay } from "@/components/loading/global-house-loader-overlay";

type LoaderToken = string;

interface LoadingEntry {
  token: LoaderToken;
  reason: string;
  message?: string;
  startedAt: number;
}

interface GlobalLoaderTaskOptions {
  reason?: string;
  message?: string;
  suppressOverlay?: boolean;
}

interface GlobalLoaderContextValue {
  startLoading: (options?: { reason?: string; message?: string }) => LoaderToken;
  stopLoading: (token: LoaderToken) => void;
  suppressOverlay: (reason?: string) => () => void;
  withGlobalLoading: <T>(task: () => Promise<T>, options?: GlobalLoaderTaskOptions) => Promise<T>;
  startNavigation: (targetHref?: string) => LoaderToken | null;
  isOverlayVisible: boolean;
}

export const GlobalLoaderContext = createContext<GlobalLoaderContextValue | null>(null);

const OPEN_DELAY_MS = 120;
/** Duración de un ciclo completo del trazo de la casa (animate drawPath). */
const HOUSE_DRAW_CYCLE_MS = 3_800;
/** Mínimo para percibir la animación de la casa en cargas muy rápidas. */
const MIN_BRIEF_HOUSE_MS = 1_000;
/** Tras terminar la carga, margen breve antes de ocultar el overlay. */
const MIN_AFTER_LOAD_MS = 200;
const NAVIGATION_TIMEOUT_MS = 12_000;

function navigationVisibleRemainingMs(elapsedMs: number): number {
  if (elapsedMs >= HOUSE_DRAW_CYCLE_MS) return 0;
  const targetTotalMs =
    elapsedMs < 250
      ? HOUSE_DRAW_CYCLE_MS
      : Math.max(MIN_BRIEF_HOUSE_MS, elapsedMs);
  return Math.max(0, targetTotalMs - elapsedMs);
}

function token(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function GlobalLoaderProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loadingEntries, setLoadingEntries] = useState<Map<LoaderToken, LoadingEntry>>(new Map());
  const [suppressions, setSuppressions] = useState<Map<LoaderToken, string>>(new Map());
  const [visible, setVisible] = useState(false);

  const previousPathname = useRef(pathname);
  const openTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const navClearTimerRef = useRef<number | null>(null);
  const visibleSinceRef = useRef<number>(0);
  const navigationStartedAtRef = useRef<number | null>(null);
  const navigationTokensRef = useRef<Map<LoaderToken, number>>(new Map());

  const clearOpenTimer = useCallback(() => {
    if (!openTimerRef.current) return;
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  const clearHideTimer = useCallback(() => {
    if (!hideTimerRef.current) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const clearNavClearTimer = useCallback(() => {
    if (!navClearTimerRef.current) return;
    window.clearTimeout(navClearTimerRef.current);
    navClearTimerRef.current = null;
  }, []);

  const startLoading = useCallback((options?: { reason?: string; message?: string }) => {
    const nextToken = token("load");
    setLoadingEntries((current) => {
      const next = new Map(current);
      next.set(nextToken, {
        token: nextToken,
        reason: options?.reason ?? "task",
        message: options?.message,
        startedAt: Date.now(),
      });
      return next;
    });
    return nextToken;
  }, []);

  const stopLoading = useCallback((entryToken: LoaderToken) => {
    setLoadingEntries((current) => {
      if (!current.has(entryToken)) return current;
      const next = new Map(current);
      next.delete(entryToken);
      return next;
    });
  }, []);

  const clearNavigationTokens = useCallback(() => {
    for (const [navToken, timeoutId] of navigationTokensRef.current.entries()) {
      window.clearTimeout(timeoutId);
      stopLoading(navToken);
      navigationTokensRef.current.delete(navToken);
    }
    navigationStartedAtRef.current = null;
  }, [stopLoading]);

  const suppressOverlay = useCallback((reason = "suppressed") => {
    const suppressionToken = token("suppress");
    setSuppressions((current) => {
      const next = new Map(current);
      next.set(suppressionToken, reason);
      return next;
    });
    return () => {
      setSuppressions((current) => {
        if (!current.has(suppressionToken)) return current;
        const next = new Map(current);
        next.delete(suppressionToken);
        return next;
      });
    };
  }, []);

  const withGlobalLoading = useCallback(
    async <T,>(task: () => Promise<T>, options?: GlobalLoaderTaskOptions): Promise<T> => {
      const currentToken = startLoading({ reason: options?.reason, message: options?.message });
      const releaseSuppression = options?.suppressOverlay
        ? suppressOverlay(options.reason ?? "suppressed-task")
        : null;
      try {
        return await task();
      } finally {
        releaseSuppression?.();
        stopLoading(currentToken);
      }
    },
    [startLoading, stopLoading, suppressOverlay],
  );

  const startNavigation = useCallback(
    (targetHref?: string): LoaderToken | null => {
      if (typeof targetHref === "string" && !targetHref.startsWith("/platform")) {
        return null;
      }

      clearNavClearTimer();
      navigationStartedAtRef.current = Date.now();

      const navToken = startLoading({ reason: "navigation", message: "Abriendo siguiente vista..." });

      // Mostrar de inmediato: en rutas ligeras la navegación termina antes del OPEN_DELAY_MS.
      clearOpenTimer();
      clearHideTimer();
      setVisible(true);
      visibleSinceRef.current = Date.now();

      const timeoutId = window.setTimeout(() => {
        stopLoading(navToken);
        navigationTokensRef.current.delete(navToken);
      }, NAVIGATION_TIMEOUT_MS);
      navigationTokensRef.current.set(navToken, timeoutId);
      return navToken;
    },
    [startLoading, stopLoading, clearOpenTimer, clearHideTimer, clearNavClearTimer],
  );

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    if (navigationTokensRef.current.size === 0) return;

    const startedAt = navigationStartedAtRef.current ?? visibleSinceRef.current ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const remaining = navigationVisibleRemainingMs(elapsed);

    clearNavClearTimer();
    navClearTimerRef.current = window.setTimeout(() => {
      clearNavigationTokens();
      navClearTimerRef.current = null;
    }, remaining);
  }, [pathname, clearNavClearTimer, clearNavigationTokens]);

  useEffect(() => {
    const wantsVisible = loadingEntries.size > 0 && suppressions.size === 0;

    if (wantsVisible) {
      clearHideTimer();
      if (!visible && !openTimerRef.current) {
        openTimerRef.current = window.setTimeout(() => {
          setVisible(true);
          visibleSinceRef.current = Date.now();
          openTimerRef.current = null;
        }, OPEN_DELAY_MS);
      }
      return;
    }

    clearOpenTimer();
    if (!visible) return;

    const elapsed = Date.now() - visibleSinceRef.current;
    const remaining = Math.max(0, MIN_AFTER_LOAD_MS - elapsed);
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, remaining);
  }, [loadingEntries.size, suppressions.size, visible, clearHideTimer, clearOpenTimer]);

  useEffect(() => {
    return () => {
      clearOpenTimer();
      clearHideTimer();
      clearNavClearTimer();
      for (const timeoutId of navigationTokensRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      navigationTokensRef.current.clear();
    };
  }, [clearHideTimer, clearOpenTimer, clearNavClearTimer]);

  const overlayMessage = useMemo(() => {
    if (loadingEntries.size === 0) return null;
    const latest = Array.from(loadingEntries.values()).sort((a, b) => b.startedAt - a.startedAt)[0];
    return latest?.message ?? null;
  }, [loadingEntries]);

  const value = useMemo<GlobalLoaderContextValue>(
    () => ({
      startLoading,
      stopLoading,
      suppressOverlay,
      withGlobalLoading,
      startNavigation,
      isOverlayVisible: visible,
    }),
    [startLoading, stopLoading, suppressOverlay, withGlobalLoading, startNavigation, visible],
  );

  return (
    <GlobalLoaderContext.Provider value={value}>
      {children}
      <GlobalHouseLoaderOverlay visible={visible} message={overlayMessage} />
    </GlobalLoaderContext.Provider>
  );
}

export function useGlobalLoaderContext() {
  const context = useContext(GlobalLoaderContext);
  if (!context) {
    throw new Error("useGlobalLoaderContext debe usarse dentro de GlobalLoaderProvider");
  }
  return context;
}
