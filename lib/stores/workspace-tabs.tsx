"use client";

import {
    createContext,
    useCallback,
    useContext,
    useState,
    type ReactNode,
} from "react";

export interface WorkspaceTab {
    id: string;
    label: string;
    href: string;
    closable: boolean;
}

interface WorkspaceTabsState {
    tabs: WorkspaceTab[];
    activeTabId: string;
    openTab: (tab: Omit<WorkspaceTab, "id">) => void;
    closeTab: (id: string) => void;
    clearTabsKeepCurrent: (currentHref: string, currentLabel: string) => void;
    setActive: (id: string) => void;
    isHrefAlreadyOpened: (href: string) => boolean;
}

/** Normaliza rutas /platform para comparar pestañas y destinos de navegación. */
export function normalizePlatformHref(href: string): string {
    const pathOnly = href.split("?")[0]?.split("#")[0] ?? href;
    if (pathOnly === "/platform" || pathOnly === "/platform/") return "/platform";
    return pathOnly.replace(/\/$/, "") || "/platform";
}

const HOME_TAB: WorkspaceTab = {
    id: "home",
    label: "Inicio",
    href: "/platform",
    closable: false,
};

const WorkspaceTabsContext = createContext<WorkspaceTabsState | null>(null);

function tabId(href: string) {
    return href.replace(/\//g, "-").replace(/^-/, "");
}

export function WorkspaceTabsProvider({ children }: { children: ReactNode }) {
    const [tabs, setTabs] = useState<WorkspaceTab[]>([HOME_TAB]);
    const [activeTabId, setActiveTabId] = useState(HOME_TAB.id);

    const openTab = useCallback(
        (incoming: Omit<WorkspaceTab, "id">) => {
            const id = tabId(incoming.href);
            setTabs((prev) => {
                const existing = prev.find((t) => t.id === id);
                if (existing) return prev;
                return [...prev, { ...incoming, id }];
            });
            setActiveTabId(id);
        },
        []
    );

    const closeTab = useCallback(
        (id: string) => {
            setTabs((prev) => {
                const next = prev.filter((t) => t.id !== id);
                if (next.length === 0) return [HOME_TAB];
                return next;
            });
            setActiveTabId((prev) => {
                if (prev === id) return HOME_TAB.id;
                return prev;
            });
        },
        []
    );

    const clearTabsKeepCurrent = useCallback((currentHref: string, currentLabel: string) => {
        const isHome = currentHref === HOME_TAB.href || currentHref === `${HOME_TAB.href}/`;
        if (isHome) {
            setTabs([HOME_TAB]);
            setActiveTabId(HOME_TAB.id);
            return;
        }

        const currentId = tabId(currentHref);
        setTabs([
            HOME_TAB,
            {
                id: currentId,
                label: currentLabel,
                href: currentHref,
                closable: true,
            },
        ]);
        setActiveTabId(currentId);
    }, []);

    const setActive = useCallback((id: string) => {
        setActiveTabId(id);
    }, []);

    const isHrefAlreadyOpened = useCallback(
        (href: string) => {
            const target = normalizePlatformHref(href);
            return tabs.some((tab) => normalizePlatformHref(tab.href) === target);
        },
        [tabs],
    );

    return (
        <WorkspaceTabsContext.Provider
            value={{
                tabs,
                activeTabId,
                openTab,
                closeTab,
                clearTabsKeepCurrent,
                setActive,
                isHrefAlreadyOpened,
            }}
        >
            {children}
        </WorkspaceTabsContext.Provider>
    );
}

export function useWorkspaceTabs() {
    const ctx = useContext(WorkspaceTabsContext);
    if (!ctx) {
        throw new Error("useWorkspaceTabs must be used within WorkspaceTabsProvider");
    }
    return ctx;
}
