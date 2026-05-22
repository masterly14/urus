"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPricingMarketStudyUiEnabled } from "@/lib/pricing/ui-feature-flags";

const allTabs = [
  {
    key: "cartera",
    label: "Cartera interna",
    href: "/platform/pricing",
    icon: Building2,
    isActive: (pathname: string) =>
      pathname === "/platform/pricing" || pathname.startsWith("/platform/pricing/informe/"),
  },
  {
    key: "mercado",
    label: "Mercado",
    href: "/platform/pricing/mercado",
    icon: BarChart3,
    isActive: (pathname: string) => pathname.startsWith("/platform/pricing/mercado"),
  },
];

export function PricingTabs() {
  const pathname = usePathname();
  const tabs = isPricingMarketStudyUiEnabled()
    ? allTabs
    : allTabs.filter((tab) => tab.key !== "mercado");

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-accent/20 p-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.isActive(pathname);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
