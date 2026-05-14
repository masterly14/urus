/**
 * /platform/market/identity/review
 *
 * Cola de revision manual de identidad cross-portal.
 *
 * Cuando el handler MARKET_RESOLVE_IDENTITY encuentra un candidato con
 * score en [0.70, 0.90), emite un MARKET_PROPERTY_REVIEW_REQUIRED.
 * Esta pagina los muestra side-by-side y permite a un admin marcar:
 *  - "Mismo inmueble" (M) -> merge: vincula los listings a la misma MarketProperty
 *  - "Distintos" (D)      -> split: deja como propiedades separadas
 *  - "Ignorar" (I)        -> no resolver pero remover de la cola
 *
 * Permisos: admin/CEO.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listReviewCandidates } from "@/lib/market/identity-review";
import { ReviewClient } from "./review-client";

export const dynamic = "force-dynamic";

export default async function IdentityReviewPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirectTo=/platform/market/identity/review");
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

  const initial = await listReviewCandidates(50);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Revision de identidad cross-portal</h1>
        <p className="text-sm text-muted-foreground">
          Score de similitud entre 0.70 y 0.90. Decide si el listing y el
          candidato son el mismo inmueble. Atajos: <kbd>M</kbd> mismo,{" "}
          <kbd>D</kbd> distinto, <kbd>I</kbd> ignorar.
        </p>
      </div>
      <ReviewClient initialItems={initial.items} initialPending={initial.totalPending} />
    </div>
  );
}
