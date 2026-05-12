"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { MicrositeCuratedProperty } from "@/lib/microsite/selection";
import { isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";
import { proxiedStatefoxImageUrl } from "@/lib/statefox/image-url";

export type PropertyCardProps = {
  selectionToken: string;
  property: MicrositeCuratedProperty;
  alreadyInterested: boolean;
  demoMode?: boolean;
};

function formatPrice(n: number | null): string {
  if (n === null) return "Precio N/D";
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n} €`;
  }
}

type FeedbackState = "idle" | "submitting" | "recorded" | "error";

export function PropertyCard({
  selectionToken,
  property,
  alreadyInterested,
  demoMode = false,
}: PropertyCardProps) {
  const [state, setState] = useState<FeedbackState>(
    alreadyInterested ? "recorded" : "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isLocked = state === "recorded";

  const hero = property.images.find((url) => !isExpiredStatefoxImageUrl(url)) ?? null;
  const heroSrc = hero ? proxiedStatefoxImageUrl(hero) : null;
  const detailHref = `/seleccion/${selectionToken}/propiedad/${property.propertyId}`;

  const handleMeEncaja = (
    e: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLocked || state === "submitting" || isPending) return;

    if (demoMode) {
      setState("recorded");
      setErrorMsg(null);
      return;
    }

    setState("submitting");
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/seleccion/${selectionToken}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: property.propertyId,
            decision: "ME_INTERESA",
          }),
        });

        if (res.ok || res.status === 409) {
          setState("recorded");
          setErrorMsg(null);
          return;
        }

        setState("error");
        const text = await res.text().catch(() => "");
        setErrorMsg(
          text && text.length < 200
            ? text
            : "No pudimos registrar tu interés. Inténtalo de nuevo.",
        );
      } catch (err) {
        setState("error");
        setErrorMsg(
          err instanceof Error && err.message
            ? err.message
            : "No pudimos registrar tu interés. Inténtalo de nuevo.",
        );
      }
    });
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <Link href={detailHref} className="block">
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 relative">
          {heroSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroSrc}
              alt={property.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-400 font-medium">
              Sin imagen
            </div>
          )}
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-md shadow-sm border border-white/20">
            <span className="font-bold text-slate-900 text-sm">
              {formatPrice(property.price)}
            </span>
          </div>
          {isLocked ? (
            <div className="absolute top-3 right-3 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm">
              Ya elegida
            </div>
          ) : null}
        </div>
      </Link>

      <div className="p-5 flex flex-col flex-1">
        <Link href={detailHref} className="block">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {property.city ?? "Ciudad N/D"}
            {property.zone ? ` · ${property.zone}` : ""}
          </div>
          <h2 className="mt-1.5 line-clamp-2 text-base font-semibold text-slate-900 group-hover:text-blue-700 transition-colors leading-tight">
            {property.title}
          </h2>
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600 font-medium">
          {typeof property.metersBuilt === "number" ? (
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
              {property.metersBuilt} m²
            </span>
          ) : null}
          {typeof property.rooms === "number" ? (
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v6h18V2" />
                <path d="M3 13v9" />
                <path d="M21 13v9" />
                <path d="M3 13h18" />
                <path d="M12 13v9" />
              </svg>
              {property.rooms} hab
            </span>
          ) : null}
          {typeof property.baths === "number" ? (
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
                <line x1="10" x2="8" y1="5" y2="7" />
                <line x1="2" x2="22" y1="12" y2="12" />
                <line x1="7" x2="7" y1="19" y2="21" />
                <line x1="17" x2="17" y1="19" y2="21" />
              </svg>
              {property.baths} baños
            </span>
          ) : null}
        </div>

        {property.extras.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-1.5">
            {property.extras.slice(0, 3).map((extra) => (
              <span
                key={`${property.propertyId}:${extra}`}
                className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600"
              >
                {extra}
              </span>
            ))}
            {property.extras.length > 3 ? (
              <span className="rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                +{property.extras.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <Link
            href={detailHref}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            Ver ficha completa
            <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          {isLocked ? (
            <div
              role="status"
              aria-live="polite"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Ya elegida — un agente te contactará
            </div>
          ) : (
            <button
              type="button"
              onClick={handleMeEncaja}
              disabled={state === "submitting" || isPending}
              aria-busy={state === "submitting" || isPending}
              aria-label={`Me encaja: ${property.title}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-wait disabled:opacity-70"
            >
              {state === "submitting" || isPending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Registrando…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 21s-7.5-4.6-9.8-9.2C.6 8.2 2.4 4.5 6 4.5c1.9 0 3.6 1 4.5 2.4C11.4 5.5 13.1 4.5 15 4.5c3.6 0 5.4 3.7 3.8 7.3C19.5 16.4 12 21 12 21z" />
                  </svg>
                  Me encaja
                </>
              )}
            </button>
          )}
          {state === "error" && errorMsg ? (
            <div
              role="alert"
              className="mt-2 text-xs font-medium text-red-600"
            >
              {errorMsg}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
