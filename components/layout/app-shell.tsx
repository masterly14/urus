"use client";

import { useState } from "react";
import { TopBar } from "./top-bar";
import { Sidebar } from "./sidebar";
import { WorkspaceTabsBar } from "./workspace-tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceTabsProvider } from "@/lib/stores/workspace-tabs";
import { cn } from "@/lib/utils";
import { GlobalLoaderProvider } from "@/components/loading/global-loader-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <WorkspaceTabsProvider>
            <TooltipProvider delayDuration={200}>
                <GlobalLoaderProvider>
                    <div className="min-h-screen bg-background text-foreground">
                        <TopBar />
                        <WorkspaceTabsBar sidebarCollapsed={sidebarCollapsed} />
                        <Sidebar
                            collapsed={sidebarCollapsed}
                            onToggle={() => setSidebarCollapsed((prev) => !prev)}
                        />
                        <main
                            className={cn(
                                "pt-20 transition-all duration-300",
                                sidebarCollapsed ? "pl-16" : "pl-60"
                            )}
                        >
                            <div className="p-6">{children}</div>
                        </main>
                    </div>
                </GlobalLoaderProvider>
            </TooltipProvider>
        </WorkspaceTabsProvider>
    );
}
