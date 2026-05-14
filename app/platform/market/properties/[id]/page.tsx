/**
 * /platform/market/properties/[id]
 *
 * Ficha de propiedad cross-portal: equivalente a la ficha de Statefox para
 * el comercial. Agrupa todos los anuncios del cluster (Idealista + Fotocasa +
 * Pisos.com del mismo inmueble fisico = 1 ficha) y expone:
 *  - Galeria deduplicada con lightbox.
 *  - Caracteristicas (m², hab, baños, planta, advertiser, refs).
 *  - Mapa cuando hay lat/lng.
 *  - Anuncios por portal con precio y "primera vez visto".
 *  - Timeline cronologico de cambios (alta, baja, rebaja, reaparicion).
 *  - CTAs: enviar a CRM, crear prospecto, dar de alta propiedad,
 *    asignar comercial, llamar publicante, ver en portal, nota de encargo.
 *
 * Acepta tambien id "virtual:<listingId>" para listings huerfanos (sin
 * propertyId asignado todavia). En ese caso se renderiza la ficha con un
 * solo portal.
 *
 * Permisos: cualquier usuario autenticado.
 */

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPropertyCluster, getPropertyClusterTimeline } from "@/lib/market/properties";
import { PropertyDetail } from "./property-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MarketPropertyPage({ params }: PageProps) {
  const { id: rawId } = await params;
  // Next.js 15 no decodifica el dynamic segment ('%3A' llega tal cual). Para los
  // ids virtuales (`virtual:<listingId>`) hay que decodificar manualmente.
  const id = decodeURIComponent(rawId);
  const session = await getSession();
  if (!session) {
    redirect(
      `/login?redirectTo=${encodeURIComponent(
        `/platform/market/properties/${id}`,
      )}`,
    );
  }

  const [cluster, timeline] = await Promise.all([
    getPropertyCluster(id),
    getPropertyClusterTimeline(id, 100),
  ]);
  if (!cluster) notFound();

  return (
    <div className="p-6">
      <PropertyDetail cluster={cluster} initialTimeline={timeline} />
    </div>
  );
}
