import { NextResponse } from "next/server";
import { z } from "zod";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";
import { sendFollowUpDemandaToCommercial } from "@/lib/whatsapp/send";
import { withObservedRoute } from "@/lib/observability";

const PayloadSchema = z.object({
  visitSessionId: z.string().min(1),
  comercialId: z.string().min(1),
  demandId: z.string().trim().min(1).nullable().optional(),
  propertyCode: z.string().trim().min(1).nullable().optional(),
  visitorName: z.string().trim().default("Demanda"),
  visitorPhone: z.string().trim().default(""),
  sendAtIso: z.string().datetime().optional(),
});

function firstName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Comercial";
  const [head] = trimmed.split(/\s+/);
  return head || "Comercial";
}

function clean(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  const comercial = await prisma.comercial.findUnique({
    where: { id: payload.comercialId },
    select: { id: true, nombre: true, waId: true, telefono: true },
  });
  if (!comercial) {
    return NextResponse.json(
      { ok: false, error: "Comercial no encontrado" },
      { status: 404 },
    );
  }

  const to = normalizeWhatsAppDigits(comercial.waId || comercial.telefono || "");
  if (!to) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Comercial sin teléfono/waId válido",
    });
  }

  const alreadySent = await prisma.event.findFirst({
    where: {
      type: "WHATSAPP_ENVIADO",
      aggregateType: "WHATSAPP_CONVERSATION",
      aggregateId: to,
      payload: {
        path: ["visitSessionId"],
        equals: payload.visitSessionId,
      },
    },
    select: { id: true },
  });
  if (alreadySent) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Mensaje ya enviado para esta visita",
    });
  }

  const [demand, property] = await Promise.all([
    payload.demandId
      ? prisma.demandCurrent.findUnique({
          where: { codigo: payload.demandId },
          select: { nombre: true, telefono: true },
        })
      : Promise.resolve(null),
    payload.propertyCode
      ? prisma.propertyCurrent.findUnique({
          where: { codigo: payload.propertyCode },
          select: { ref: true, titulo: true, zona: true, ciudad: true },
        })
      : Promise.resolve(null),
  ]);

  const demandName = clean(demand?.nombre, clean(payload.visitorName, "Demanda"));
  const demandPhone = clean(
    normalizeWhatsAppDigits(payload.visitorPhone) ||
      normalizeWhatsAppDigits(demand?.telefono || ""),
    "No disponible",
  );
  const propertyName = clean(
    property?.titulo || property?.ref || [property?.zona, property?.ciudad].filter(Boolean).join(", "),
    payload.propertyCode || "propiedad asignada",
  );

  await sendFollowUpDemandaToCommercial(
    to,
    {
      comercialName: firstName(comercial.nombre),
      demandName,
      propertyName,
      demandPhone,
    },
    {
      trace: {
        source: "cron:visitas-follow-up-demanda",
        kind: "follow_up_demanda",
        aggregateId: to,
        payload: {
          visitSessionId: payload.visitSessionId,
          demandId: payload.demandId ?? null,
          propertyCode: payload.propertyCode ?? null,
          sendAtIso: payload.sendAtIso ?? null,
        },
      },
    },
  );

  return NextResponse.json({ ok: true, sentTo: to });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/visitas/follow-up-demanda" },
  postHandler,
);

export const maxDuration = 60;
