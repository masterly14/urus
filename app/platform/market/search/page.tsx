/**
 * /platform/market/search
 *
 * Herramienta INTERNA de QA, no producto. Inspecciona MarketListing
 * canonico filtrando por city/housingType/operation/precio/metros/zone
 * con paginacion cursor. Util para detectar regresiones de extractor,
 * bugs de normalizacion y calibrar umbrales de identidad.
 *
 * Decision: NO enlazado en sidebar ni workspace-tabs (ver
 * `components/layout/sidebar.tsx`). Solo accesible por URL directa.
 * Ver `docs/core-mvp-status.md` §1 y `docs/market-worker-deploy.md`.
 *
 * Solo accesible para admin/CEO.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SearchView } from "./search-view";

export const dynamic = "force-dynamic";

export default async function MarketSearchPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirectTo=/platform/market/search");
  if (session.role !== "admin" && session.role !== "ceo") {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Sin permisos</h1>
        <p className="text-sm text-muted-foreground">
          Esta vista esta restringida a roles admin/CEO.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>Herramienta interna · QA del Core de Mercado.</strong> No
        enlazada en navegacion; accesible solo por URL directa. Lectura
        sobre <code>MarketListing</code> canonico para detectar
        regresiones de extractor, bugs de normalizacion y calibrar
        umbrales de identidad. No usar como producto end-user.
      </div>
      <SearchView />
    </div>
  );
}
