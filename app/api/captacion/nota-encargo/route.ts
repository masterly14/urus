import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized } from "@/lib/auth/session";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { extractPropertyDataFromRaw } from "@/lib/nota-encargo/utils";

const bodySchema = z.object({
  propertyCode: z.string().min(1),
  propietarioPhone: z.string().regex(/^\d{9,15}$/, "Teléfono inválido"),
  visitDateTime: z.string().datetime(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { propertyCode, propietarioPhone, visitDateTime } = parsed.data;
  const visitDate = new Date(visitDateTime);

  if (visitDate.getTime() <= Date.now()) {
    return NextResponse.json(
      { ok: false, error: "La fecha de visita debe estar en el futuro" },
      { status: 400 },
    );
  }

  const propertyCurrent = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyCode },
  });

  if (!propertyCurrent) {
    return NextResponse.json(
      { ok: false, error: "Propiedad no encontrada" },
      { status: 404 },
    );
  }

  if (propertyCurrent.nodisponible) {
    return NextResponse.json(
      { ok: false, error: "La propiedad no está disponible" },
      { status: 400 },
    );
  }

  const propertySnapshot = await prisma.propertySnapshot.findUnique({
    where: { codigo: propertyCode },
  });

  const raw = (propertySnapshot?.raw ?? {}) as Record<string, unknown>;
  const { direccion, tipoOperacion, precio } = extractPropertyDataFromRaw(
    raw,
    propertyCurrent,
  );

  const comercialId =
    session.comercialId ?? propertyCurrent.comercialId ?? session.userId;

  const notaSession = await prisma.notaEncargoSession.create({
    data: {
      propertyCode,
      propertyRef: propertyCurrent.ref,
      comercialId,
      propietarioPhone,
      visitDateTime: visitDate,
      state: "PENDING",
      direccion,
      tipoOperacion,
      precio,
    },
  });

  await appendEvent({
    type: "NOTA_ENCARGO_DETECTADA",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    payload: {
      sessionId: notaSession.id,
      propertyRef: propertyCurrent.ref,
      comercialId,
      source: "platform",
    },
  });

  const twoHoursBefore = new Date(visitDate.getTime() - 2 * 60 * 60 * 1000);
  const availableAt = new Date(
    Math.max(twoHoursBefore.getTime(), Date.now() + 60_000),
  );

  await enqueueJob({
    type: "NOTA_ENCARGO_RECORDATORIO",
    payload: { sessionId: notaSession.id },
    availableAt,
    idempotencyKey: `nota_encargo_recordatorio:${notaSession.id}`,
  });

  return NextResponse.json(
    { ok: true, sessionId: notaSession.id },
    { status: 201 },
  );
}
