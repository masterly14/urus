/**
 * /platform/market/listings/[id]
 *
 * Redirect server-side a la ficha de propiedad del cluster al que pertenece
 * el listing. Mantenemos la URL para compatibilidad con enlaces existentes y
 * para que un comercial pueda llegar desde un externalId conocido.
 *
 * Si el listing no esta clusterizado todavia (sin propertyId asignado),
 * redirigimos a la ficha "virtual:" para que la UI muestre la informacion
 * del unico portal disponible mientras el pipeline de identidad procesa.
 */

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MarketListingPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await prisma.marketListing.findUnique({
    where: { id },
    select: { id: true, propertyId: true },
  });
  if (!listing) notFound();
  const target = listing.propertyId ?? `virtual:${listing.id}`;
  redirect(`/platform/market/properties/${encodeURIComponent(target)}`);
}
