"use client";

import { useState } from "react";
import { TopBar } from "./top-bar";
import { Sidebar } from "./sidebar";
import { WorkspaceTabsBar } from "./workspace-tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceTabsProvider } from "@/lib/stores/workspace-tabs";
import { cn } from "@/lib/utils";
import { KeepAliveProvider, KeepAliveOutlet } from "./keep-alive";

export function AppShell({
    children,
    logoSrc,
}: {
    children: React.ReactNode;
    logoSrc?: string;
}) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <WorkspaceTabsProvider>
            <KeepAliveProvider>
                <TooltipProvider delayDuration={200}>
                    <div className="min-h-screen bg-background text-foreground">
                        <TopBar logoSrc={logoSrc} />
                        <WorkspaceTabsBar sidebarCollapsed={sidebarCollapsed} />
                        <Sidebar
                            collapsed={sidebarCollapsed}
                            onToggle={() => setSidebarCollapsed((prev) => !prev)}
                        />
                        <main
                            className={cn(
                                "pt-20 transition-all duration-300",
                                sidebarCollapsed ? "pl-16" : "pl-64"
                            )}
                        >
                            <div className="p-6">
                                <KeepAliveOutlet>{children}</KeepAliveOutlet>
                            </div>
                        </main>
                    </div>
                </TooltipProvider>
            </KeepAliveProvider>
        </WorkspaceTabsProvider>
    );
}
