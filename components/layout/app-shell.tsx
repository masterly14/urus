"use client";

import { useState } from "react";
import { SessionProvider } from "@/lib/hooks/use-session";
import { TopBar } from "./top-bar";
import { Sidebar } from "./sidebar";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <SessionProvider>
            <TooltipProvider delayDuration={200}>
                <div className="min-h-screen bg-background text-foreground">
                    <TopBar />
                    <Sidebar
                        collapsed={sidebarCollapsed}
                        onToggle={() => setSidebarCollapsed((prev) => !prev)}
                    />
                    <main
                        className={cn(
                            "pt-16 transition-all duration-300",
                            sidebarCollapsed ? "pl-16" : "pl-64"
                        )}
                    >
                        <div className="px-6 py-4">
                            <BreadcrumbNav />
                        </div>
                        <div className="px-6 pb-8">{children}</div>
                    </main>
                </div>
            </TooltipProvider>
        </SessionProvider>
    );
}
