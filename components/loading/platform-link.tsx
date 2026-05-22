"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { type MouseEvent, forwardRef } from "react";
import { useGlobalLoader } from "@/lib/hooks/use-global-loader";
import { normalizePlatformHref, useWorkspaceTabs } from "@/lib/stores/workspace-tabs";

type AnchorProps = Omit<React.ComponentPropsWithoutRef<"a">, keyof LinkProps>;

export type PlatformLinkProps = LinkProps & AnchorProps;

function canStartNavigation(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false;
  return true;
}

export const PlatformLink = forwardRef<HTMLAnchorElement, PlatformLinkProps>(
  function PlatformLink({ href, onClick, ...props }, ref) {
    const pathname = usePathname();
    const { startNavigation } = useGlobalLoader();
    const { isHrefAlreadyOpened } = useWorkspaceTabs();

    const hrefString = typeof href === "string" ? href : href.pathname?.toString() ?? "";

    return (
      <Link
        ref={ref}
        href={href}
        onClick={(event) => {
          onClick?.(event);
          if (!canStartNavigation(event)) return;
          if (!hrefString.startsWith("/platform")) return;
          const isSamePage = normalizePlatformHref(pathname) === normalizePlatformHref(hrefString);
          if (isSamePage || isHrefAlreadyOpened(hrefString)) return;
          startNavigation(hrefString);
        }}
        {...props}
      />
    );
  },
);
