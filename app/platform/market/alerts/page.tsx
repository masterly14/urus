/**
 * /platform/market/alerts
 *
 * Gestion de alertas guardadas del usuario actual. Una alerta es una
 * "busqueda persistente" que se evalua periodicamente por el cron
 * `run-rules`. Cuando aparece un listing nuevo (o cambia precio o reaparece)
 * que matchea los filtros, se entrega por los canales configurados:
 *   - in_app (Notification + Pusher).
 *   - whatsapp (plantilla `WHATSAPP_TEMPLATE_MARKET_ALERT` al telefono del
 *     comercial; un solo mensaje por evaluacion con resumen agregado).
 *
 * Permisos: cualquier usuario autenticado.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listAlertsForUser } from "@/lib/market/alerts";
import { AlertsClient } from "./alerts-client";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirectTo=/platform/market/alerts");
  const initial = await listAlertsForUser(session.userId);
  return (
    <div className="p-6">
      <AlertsClient initial={initial} />
    </div>
  );
}
