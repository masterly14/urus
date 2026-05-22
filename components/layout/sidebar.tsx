"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Award,
  Brain,
  Briefcase,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileSignature,
  FileText,
  FlaskConical,
  Folder,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Rocket,
  Settings,
  Shuffle,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  Users2,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useSession } from "@/lib/hooks/use-session";
import { PlatformLink } from "@/components/loading/platform-link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavChild {
  label: string;
  href: string;
  icon: React.ElementType;
  ceoOnly?: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  ceoOnly?: boolean;
  children?: NavChild[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Navegación",
    items: [
      { label: "Panel", href: "/platform", icon: LayoutDashboard },
      { label: "Demandas", href: "/platform/demandas", icon: Users2 },
      { label: "Visitas", href: "/platform/visitas", icon: CalendarCheck },
      { label: "Operaciones", href: "/platform/operaciones", icon: Briefcase },
      { label: "Conversaciones", href: "/platform/conversaciones", icon: MessageSquare },
    ],
  },
  {
    label: "Procesos IA",
    items: [
      {
        label: "Captación",
        href: "/platform/captacion",
        icon: ClipboardList,
        children: [
          { label: "Notas de encargo", href: "/platform/captacion", icon: FileSignature },
          { label: "Oportunidades de mercado", href: "/platform/captacion/oportunidades", icon: Target },
          { label: "Prospectos enviados", href: "/platform/captacion/prospectos", icon: Users2 },
        ],
      },
      {
        label: "Cruces Automáticos",
        href: "/platform/matching/cruces",
        icon: Shuffle,
        badge: "IA",
      },
      {
        label: "Cartera interna",
        href: "/platform/pricing",
        icon: DollarSign,
        badge: "IA",
      },
      {
        label: "Coach Emocional",
        href: "/platform/coach",
        icon: Brain,
        badge: "IA",
        children: [
          { label: "Panel", href: "/platform/coach", icon: Brain },
          { label: "Métricas", href: "/platform/coach/metricas", icon: TrendingUp },
          { label: "Chat", href: "/platform/coach/chat", icon: MessagesSquare },
        ],
      },
    ],
  },
  {
    label: "Herramientas",
    items: [
      {
        label: "Colaboradores",
        href: "/platform/colaboradores",
        icon: Users,
        children: [
          { label: "Vista general", href: "/platform/colaboradores", icon: Users },
          { label: "Clasificación", href: "/platform/colaboradores/ranking", icon: Trophy },
        ],
      },
      {
        label: "Legal",
        href: "/platform/legal",
        icon: FileText,
        children: [
          { label: "Contratos", href: "/platform/legal/contratos", icon: FileSignature },
          { label: "Documentos", href: "/platform/legal/documentos", icon: Folder },
        ],
      },
    ],
  },
  {
    label: "Análisis",
    items: [
      {
        label: "Inteligencia de Negocio",
        href: "/platform/bi",
        icon: PieChart,
        ceoOnly: true,
        children: [
          { label: "Financiero", href: "/platform/bi/financiero", icon: Wallet },
          { label: "Operativo", href: "/platform/bi/operativo", icon: UserCheck },
          { label: "Capital humano", href: "/platform/bi/capital-humano", icon: Users },
          { label: "Diagnóstico estratégico", href: "/platform/bi/prescriptivo", icon: Target },
          { label: "Expansión", href: "/platform/bi/expansion", icon: Rocket },
        ],
      },
      {
        label: "Rendimiento",
        href: "/platform/rendimiento",
        icon: Award,
        children: [
          { label: "Equipo", href: "/platform/rendimiento/equipo", icon: UsersRound },
          { label: "Comerciales", href: "/platform/rendimiento/comerciales", icon: TrendingUp },
          { label: "Alertas", href: "/platform/rendimiento/alertas", icon: AlertTriangle, ceoOnly: true },
        ],
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        label: "Banco de Pruebas",
        href: "/platform/test-nlu-microsite",
        icon: FlaskConical,
        ceoOnly: true,
        children: [
          { label: "Prueba de asistente", href: "/platform/test-nlu-microsite", icon: Sparkles },
          { label: "Chat con agente", href: "/platform/chat-agente", icon: MessagesSquare },
          { label: "Visita agendada", href: "/platform/test-visit", icon: CalendarCheck },
        ],
      },
      { label: "Configuración", href: "/platform/configuracion", icon: Settings },
    ],
  },
];

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  return trimmed || "/platform";
}

function isNavActive(href: string, pathname: string): boolean {
  const path = normalizePath(pathname);
  const target = normalizePath(href);
  if (target === "/platform") return path === "/platform";
  return path === target || path.startsWith(`${target}/`);
}

function isChildNavActive(
  childHref: string,
  pathname: string,
  siblings: { href: string }[],
): boolean {
  const path = normalizePath(pathname);
  const target = normalizePath(childHref);
  if (path !== target && !path.startsWith(`${target}/`)) return false;

  const bestMatch = siblings
    .filter((sibling) => {
      const href = normalizePath(sibling.href);
      return path === href || path.startsWith(`${href}/`);
    })
    .sort((a, b) => b.href.length - a.href.length)[0];

  return bestMatch?.href === childHref;
}

function navLinkClass(active: boolean, collapsed?: boolean) {
  return cn(
    "relative flex w-full items-center gap-2.5 rounded-lg text-sm font-medium transition-colors outline-none",
    collapsed ? "justify-center px-2 py-2" : "px-2.5 py-2",
    "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
    active && [
      "bg-sidebar-accent text-sidebar-accent-foreground shadow-none",
      "before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-r-full before:bg-sidebar-primary",
    ],
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { isCeoOrAdmin } = useSession();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const filterItem = (item: NavItem) => !item.ceoOnly || isCeoOrAdmin;

  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(filterItem),
        }))
        .filter((group) => group.items.length > 0),
    [isCeoOrAdmin],
  );

  useEffect(() => {
    const autoOpen = new Set<string>();
    for (const group of navGroups) {
      for (const item of group.items) {
        if (!item.children?.length) continue;
        const children = item.children.filter((c) => !c.ceoOnly || isCeoOrAdmin);
        const childActive = children.some((c) => isChildNavActive(c.href, pathname, children));
        if (childActive || isNavActive(item.href, pathname)) {
          autoOpen.add(item.label);
        }
      }
    }
    if (autoOpen.size === 0) return;
    setExpandedSections((prev) => new Set([...prev, ...autoOpen]));
  }, [pathname, isCeoOrAdmin]);

  return (
    <aside
      className={cn(
        "fixed left-0 top-12 bottom-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="border-b border-sidebar-border p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className={cn(
            "h-8 w-full text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-0" : "justify-between px-2.5",
          )}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <span className="text-xs font-medium">Contraer menú</span>
              <PanelLeftClose className="size-4" />
            </>
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegación principal">
        {visibleGroups.map((group, groupIndex) => (
          <div
            key={group.label}
            className={cn(groupIndex > 0 && "mt-4 border-t border-sidebar-border/80 pt-4")}
          >
            {!collapsed ? (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
                {group.label}
              </p>
            ) : null}

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const children = item.children?.filter((c) => !c.ceoOnly || isCeoOrAdmin) ?? [];
                const hasChildren = children.length > 0;
                const itemActive = isNavActive(item.href, pathname);
                const childActive = hasChildren
                  ? children.some((c) => isChildNavActive(c.href, pathname, children))
                  : false;
                const active = itemActive || childActive;
                const isOpen = expandedSections.has(item.label) || childActive;

                if (collapsed) {
                  return (
                    <li key={item.label}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <PlatformLink
                            href={hasChildren ? (children.find((c) => isChildNavActive(c.href, pathname, children))?.href ?? item.href) : item.href}
                            className={navLinkClass(active, true)}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                          </PlatformLink>
                        </TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    </li>
                  );
                }

                if (!hasChildren) {
                  return (
                    <li key={item.label}>
                      <PlatformLink
                        href={item.href}
                        className={navLinkClass(itemActive)}
                        aria-current={itemActive ? "page" : undefined}
                      >
                        <Icon className="size-4 shrink-0" strokeWidth={itemActive ? 2.25 : 1.75} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <Badge
                            variant="outline"
                            className="h-5 shrink-0 border-primary/20 bg-primary/5 px-1.5 text-[10px] font-semibold text-primary"
                          >
                            {item.badge}
                          </Badge>
                        ) : null}
                      </PlatformLink>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Collapsible
                      open={isOpen}
                      onOpenChange={(open) => {
                        setExpandedSections((prev) => {
                          const next = new Set(prev);
                          if (open) next.add(item.label);
                          else next.delete(item.label);
                          return next;
                        });
                      }}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-0.5 rounded-lg",
                          active && "bg-sidebar-accent",
                        )}
                      >
                        <PlatformLink
                          href={item.href}
                          className={cn(
                            navLinkClass(itemActive),
                            "min-w-0 flex-1 before:hidden",
                            active && !itemActive && "bg-transparent text-sidebar-accent-foreground",
                          )}
                          aria-current={itemActive ? "page" : undefined}
                        >
                          <Icon className="size-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge ? (
                            <Badge
                              variant="outline"
                              className="h-5 shrink-0 border-primary/20 bg-primary/5 px-1.5 text-[10px] font-semibold text-primary"
                            >
                              {item.badge}
                            </Badge>
                          ) : null}
                        </PlatformLink>
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={cn(
                              "mr-0.5 size-7 shrink-0 text-muted-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
                              active && "text-sidebar-accent-foreground",
                            )}
                            aria-label={isOpen ? `Contraer ${item.label}` : `Expandir ${item.label}`}
                          >
                            <ChevronRight
                              className={cn(
                                "size-4 transition-transform duration-200",
                                isOpen && "rotate-90",
                              )}
                            />
                          </Button>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
                        <ul className="mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3.5 ml-3.5">
                          {children.map((child) => {
                            const ChildIcon = child.icon;
                            const childIsActive = isChildNavActive(child.href, pathname, children);
                            return (
                              <li key={child.href}>
                                <PlatformLink
                                  href={child.href}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                                    "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground",
                                    childIsActive &&
                                      "bg-sidebar-accent/90 font-medium text-sidebar-accent-foreground",
                                  )}
                                  aria-current={childIsActive ? "page" : undefined}
                                >
                                  <ChildIcon
                                    className="size-3.5 shrink-0"
                                    strokeWidth={childIsActive ? 2.25 : 1.75}
                                  />
                                  <span className="truncate">{child.label}</span>
                                </PlatformLink>
                              </li>
                            );
                          })}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
