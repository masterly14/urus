import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getLatestPricingReport } from "./report-repo";

export function getCachedPricingReport(code: string) {
  return unstable_cache(
    () => getLatestPricingReport(code),
    [`pricing-report-${code}`],
    { revalidate: 300, tags: [`pricing-report-${code}`, "pricing-report"] },
  )();
}

async function fetchPricingProperties(ciudad?: string, estado?: string) {
  const where: Record<string, unknown> = { nodisponible: false };
  if (ciudad) where.ciudad = ciudad;
  if (estado) where.estado = estado;

  return prisma.propertyCurrent.findMany({
    where,
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      tipoOfer: true,
      precio: true,
      metrosConstruidos: true,
      habitaciones: true,
      banyos: true,
      ciudad: true,
      zona: true,
      estado: true,
      numFotos: true,
      agente: true,
      fechaAlta: true,
      mainPhotoUrl: true,
      portalUrl: true,
      portalName: true,
      propietarioNombre: true,
      propietarioDni: true,
      propietarioPhone: true,
      propietarioDomicilioFiscal: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export const getCachedPricingProperties = unstable_cache(
  fetchPricingProperties,
  ["pricing-properties"],
  { revalidate: 120, tags: ["pricing-properties"] },
);
