import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromRequest,
  isCeoOrAdmin,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { createManualVisitWorkItem, serializeVisitWorkItem } from "@/lib/visitas/work-items";
import { normalizePhoneES } from "@/lib/whatsapp/phone";
import { normalizeCadastralRef } from "@/lib/nota-encargo/cadastral-ref";
import { appendEvent } from "@/lib/event-store";

const BodySchema = z.object({
  demandMode: z.enum(["existing", "draft"]).default("existing"),
  propertyMode: z.enum(["existing", "draft"]).default("existing"),
  comercialId: z.string().min(1).optional(),
  demandId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  buyerPhone: z.string().optional(),
  buyerName: z.string().optional(),
  demandPropertyType: z.string().optional(),
  demandBudgetMax: z.number().int().positive().optional(),
  ownerPhone: z.string().optional(),
  cadastralRef: z.string().optional(),
  draftPropertyKeyTipo: z.number().int().positive().optional(),
  draftPropertyKeyLoca: z.number().int().positive().optional(),
  draftPropertyOperationType: z.enum(["VENTA", "ALQUILER"]).optional(),
  nluSummary: z.string().optional(),
});

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Input inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.demandMode === "existing" && !parsed.data.demandId) {
    return NextResponse.json({ ok: false, error: "Debes seleccionar una demanda existente" }, { status: 400 });
  }
  if (parsed.data.demandMode === "draft" && !parsed.data.buyerPhone) {
    return NextResponse.json({ ok: false, error: "Debes indicar teléfono para la demanda provisional" }, { status: 400 });
  }
  if (parsed.data.propertyMode === "existing" && !parsed.data.propertyId) {
    return NextResponse.json({ ok: false, error: "Debes seleccionar una propiedad existente" }, { status: 400 });
  }
  if (parsed.data.propertyMode === "draft" && (!parsed.data.ownerPhone || !parsed.data.cadastralRef)) {
    return NextResponse.json({ ok: false, error: "Para propiedad provisional debes indicar teléfono y referencia catastral" }, { status: 400 });
  }

  const demand = parsed.data.demandId
    ? await prisma.demandCurrent.findUnique({
        where: { codigo: parsed.data.demandId },
        select: { comercialId: true, telefono: true },
      })
    : null;
  if (parsed.data.demandMode === "existing" && !demand) {
    return NextResponse.json({ ok: false, error: "Demanda no encontrada" }, { status: 404 });
  }

  if (
    parsed.data.demandMode === "existing" &&
    demand &&
    !isCeoOrAdmin(session.role) &&
    demand.comercialId !== session.comercialId
  ) {
    return NextResponse.json(
      { ok: false, error: "No puedes crear visitas para otra demanda" },
      { status: 403 },
    );
  }

  const comercialId =
    parsed.data.demandMode === "existing"
      ? demand?.comercialId ?? (isCeoOrAdmin(session.role) ? parsed.data.comercialId : undefined)
      : parsed.data.comercialId ?? session.comercialId;
  if (!comercialId) {
    return NextResponse.json({ ok: false, error: "Sin comercial asociado" }, { status: 400 });
  }
  if (!isCeoOrAdmin(session.role) && comercialId !== session.comercialId) {
    return NextResponse.json(
      { ok: false, error: "No puedes crear visitas para otra demanda" },
      { status: 403 },
    );
  }
  const comercial = await prisma.comercial.findUnique({
    where: { id: comercialId },
    select: { id: true, ciudad: true },
  });
  if (!comercial) {
    return NextResponse.json({ ok: false, error: "Comercial asignado no encontrado" }, { status: 400 });
  }
  if (parsed.data.demandMode === "existing" && demand && !demand.telefono?.trim()) {
    return NextResponse.json(
      { ok: false, error: "La demanda no tiene teléfono. Completa el teléfono antes de crear la visita manual." },
      { status: 400 },
    );
  }

  const [defaultDemandType, defaultKeyLoca] = await Promise.all([
    prisma.inmovillaEnumTipo.findFirst({
      where: { tipo: "key_tipo" },
      orderBy: { nombre: "asc" },
      select: { valor: true },
    }),
    prisma.inmovillaEnumCiudad.findFirst({
      where: { ciudad: { equals: comercial.ciudad, mode: "insensitive" } },
      select: { key_loca: true },
    }),
  ]);

  try {
    let draftDemandId: string | undefined;
    if (parsed.data.demandMode === "draft" && parsed.data.buyerPhone) {
      const buyerPhone = normalizePhoneES(parsed.data.buyerPhone);
      const draftDemand = await prisma.draftDemand.findFirst({
        where: {
          buyerPhone,
          comercialId,
          status: { in: ["OPEN", "PROMOTING"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (draftDemand) {
        draftDemandId = draftDemand.id;
        await prisma.draftDemand.update({
          where: { id: draftDemand.id },
          data: {
            buyerName: parsed.data.buyerName?.trim() || undefined,
            demandPropertyTypes: parsed.data.demandPropertyType || undefined,
            budgetMax: parsed.data.demandBudgetMax || undefined,
          },
        });
      } else {
        const created = await prisma.draftDemand.create({
          data: {
            buyerPhone,
            buyerName: parsed.data.buyerName?.trim() || null,
            comercialId,
            demandPropertyTypes: parsed.data.demandPropertyType || String(defaultDemandType?.valor ?? 2799),
            budgetMax: parsed.data.demandBudgetMax ?? 9999999,
            status: "OPEN",
          },
        });
        draftDemandId = created.id;
        await appendEvent({
          type: "DEMANDA_PROVISIONAL_CREADA",
          aggregateType: "LEAD",
          aggregateId: created.id,
          payload: {
            draftId: created.id,
            phone: created.buyerPhone,
            comercialId,
            source: "visitas_manual",
          },
        });
      }
    }

    let draftPropertyId: string | undefined;
    if (
      parsed.data.propertyMode === "draft" &&
      parsed.data.ownerPhone &&
      parsed.data.cadastralRef
    ) {
      const ownerPhone = normalizePhoneES(parsed.data.ownerPhone);
      const cadastralRef = normalizeCadastralRef(parsed.data.cadastralRef);
      const draftProperty = await prisma.draftProperty.findFirst({
        where: {
          cadastralRef,
          comercialId,
          status: { in: ["OPEN", "PROMOTING"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (draftProperty) {
        draftPropertyId = draftProperty.id;
        await prisma.draftProperty.update({
          where: { id: draftProperty.id },
          data: {
            keyTipo: parsed.data.draftPropertyKeyTipo ?? undefined,
            keyLoca: parsed.data.draftPropertyKeyLoca ?? undefined,
            operationType: parsed.data.draftPropertyOperationType ?? undefined,
          },
        });
      } else {
        const created = await prisma.draftProperty.create({
          data: {
            ownerPhone,
            cadastralRef,
            comercialId,
            keyTipo: parsed.data.draftPropertyKeyTipo ?? defaultDemandType?.valor ?? 2799,
            keyLoca: parsed.data.draftPropertyKeyLoca ?? defaultKeyLoca?.key_loca ?? null,
            operationType: parsed.data.draftPropertyOperationType ?? "VENTA",
            status: "OPEN",
          },
        });
        draftPropertyId = created.id;
        await appendEvent({
          type: "PROPIEDAD_PROVISIONAL_CREADA",
          aggregateType: "PROPERTY",
          aggregateId: created.id,
          payload: {
            draftId: created.id,
            phone: created.ownerPhone,
            comercialId,
            source: "visitas_manual",
          },
        });
      }
    }

    const { workItem, created } = await createManualVisitWorkItem({
      demandId: parsed.data.demandMode === "existing" ? parsed.data.demandId : undefined,
      draftDemandId,
      propertyId: parsed.data.propertyMode === "existing" ? parsed.data.propertyId : undefined,
      draftPropertyId,
      comercialId,
      nluSummary: parsed.data.nluSummary,
    });

    return NextResponse.json({
      ok: true,
      created,
      workItem: serializeVisitWorkItem(workItem),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error creando visita manual";
    const status = message.includes("no encontrada") ? 404 : 409;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/visitas/manual" },
  postHandler,
);
