"use client";

import { useState } from "react";
import { TopBar } from "./top-bar";
import { Sidebar } from "./sidebar";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function AppShell({
    children,
    logoSrc,
}: {
    children: React.ReactNode;
    logoSrc?: string;
}) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <TooltipProvider delayDuration={200}>
            <div className="min-h-screen bg-background text-foreground">
                <TopBar logoSrc={logoSrc} />
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
    );
}
