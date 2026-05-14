/**
 * /platform/market/captacion/kanban
 *
 * Pipeline visual del estado de captacion por listing. Reemplaza la tabla
 * plana de oportunidades cuando el comercial ya esta trabajando un set
 * concreto de leads.
 *
 * Columnas = MarketCaptacionStage. Drag & drop entre columnas dispara:
 *  - FAILED: prompt de razon, PATCH captacion-stage.
 *  - NEW (desde FAILED): reabrir.
 *  - PROSPECT_CREATED <-> ENCARGO_ATTACHED <-> READY_FOR_PROPERTY: PATCH directo.
 *  - PROSPECT_CREATING / PROPERTY_CREATING: redirige a oportunidades para
 *    abrir el modal del flujo correspondiente (no se forzan desde aqui).
 *
 * Filtros: portal, comercial (default mías).
 *
 * Permisos: cualquier usuario autenticado.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { KanbanClient, type KanbanCard, type ComercialOption } from "./kanban-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ comercial?: string; source?: string }>;
}

const VISIBLE_STAGES = [
  "NEW",
  "PROSPECT_CREATING",
  "PROSPECT_CREATED",
  "ENCARGO_ATTACHED",
  "READY_FOR_PROPERTY",
  "PROPERTY_CREATING",
  "PROPERTY_CREATED",
  "FAILED",
] as const;

export default async function KanbanPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login?redirectTo=/platform/market/captacion/kanban");
  }
  const params = (await searchParams) ?? {};

  // Default: filtrar por mi comercialId si soy comercial; "all" si admin/CEO.
  const requestedComercial =
    params.comercial ??
    (session.role === "comercial" && session.comercialId
      ? session.comercialId
      : "all");

  const where: import("@prisma/client").Prisma.MarketListingWhereInput = {
    status: { in: ["active", "unknown"] },
  };
  if (requestedComercial && requestedComercial !== "all") {
    where.assignedComercialId = requestedComercial;
  }
  if (params.source && params.source !== "all") {
    where.source = params.source as import("@prisma/client").MarketSource;
  }

  const [rows, comerciales] = await Promise.all([
    prisma.marketListing.findMany({
      where,
      orderBy: [{ captacionUpdatedAt: "desc" }],
      take: 500,
      select: {
        id: true,
        propertyId: true,
        source: true,
        externalId: true,
        canonicalUrl: true,
        addressApprox: true,
        city: true,
        zone: true,
        price: true,
        builtArea: true,
        rooms: true,
        bathrooms: true,
        mainImageUrl: true,
        captacionStage: true,
        captacionFailureReason: true,
        captacionLastError: true,
        captacionUpdatedAt: true,
        inmovillaProspectRef: true,
        inmovillaPropertyCodOfer: true,
        assignedComercialId: true,
        assignedAt: true,
        assignedComercial: { select: { id: true, nombre: true } },
        lastSeenAt: true,
      },
    }),
    prisma.comercial.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  const cards: KanbanCard[] = rows.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    source: r.source,
    externalId: r.externalId,
    canonicalUrl: r.canonicalUrl,
    addressApprox: r.addressApprox,
    city: r.city,
    zone: r.zone,
    price: r.price,
    builtArea: r.builtArea,
    rooms: r.rooms,
    bathrooms: r.bathrooms,
    mainImageUrl: r.mainImageUrl,
    stage: r.captacionStage,
    captacionFailureReason: r.captacionFailureReason,
    captacionLastError: r.captacionLastError,
    captacionUpdatedAt: r.captacionUpdatedAt.toISOString(),
    inmovillaProspectRef: r.inmovillaProspectRef,
    inmovillaPropertyCodOfer: r.inmovillaPropertyCodOfer,
    assignedComercialId: r.assignedComercialId,
    assignedComercialNombre: r.assignedComercial?.nombre ?? null,
    lastSeenAt: r.lastSeenAt.toISOString(),
  }));

  const comercialOptions: ComercialOption[] = comerciales.map((c) => ({
    id: c.id,
    nombre: c.nombre,
  }));

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex flex-col gap-1 pb-4">
        <h1 className="text-2xl font-bold">Pipeline de captacion</h1>
        <p className="text-sm text-muted-foreground">
          Mueve cada oportunidad entre estados arrastrandola. Para crear un
          prospecto en Inmovilla o dar de alta una propiedad, abre la ficha
          (boton en la card).
        </p>
      </div>
      <KanbanClient
        initialCards={cards}
        stages={[...VISIBLE_STAGES]}
        comerciales={comercialOptions}
        selectedComercial={requestedComercial}
        selectedSource={params.source ?? "all"}
        canAssignAny={session.role === "admin" || session.role === "ceo"}
      />
    </div>
  );
}
