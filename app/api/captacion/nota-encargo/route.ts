import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, forbidden, isCeoOrAdmin } from "@/lib/auth/session";
import {
  extractDireccionFromRaw,
  resolveOperationType,
} from "@/lib/nota-encargo/utils";
import {
  buildCadastralRefWarning,
  normalizeCadastralRef,
} from "@/lib/nota-encargo/cadastral-ref";
import { normalizePhoneES } from "@/lib/whatsapp/phone";

const NOTA_ENCARGO_MAX_FUTURE_DAYS = Number(
  process.env.NOTA_ENCARGO_MAX_FUTURE_DAYS || "180",
);
const NOTA_ENCARGO_MATCHING_DEADLINE_DAYS = Number(
  process.env.NOTA_ENCARGO_MATCHING_DEADLINE_DAYS || "7",
);

const bodySchema = z.object({
  refCatastral: z
    .string()
    .min(1, "Referencia catastral obligatoria")
    .transform(normalizeCadastralRef),
  propietarioPhone: z.string().regex(/^\d{9,15}$/, "Teléfono inválido"),
  visitDateTime: z.string().datetime(),
  comercialId: z.string().min(1).optional(),
});

function startOfTodayMadrid(): Date {
  const now = new Date();
  const madridStr = now.toLocaleDateString("en-CA", {
    timeZone: "Europe/Madrid",
  });
  return new Date(`${madridStr}T00:00:00+02:00`);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!isCeoOrAdmin(session.role) && !session.comercialId) {
    return forbidden();
  }

  const requiredEnvs = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];
  const missingEnvs = requiredEnvs.filter((k) => !process.env[k]);
  if (missingEnvs.length > 0) {
    console.error(
      `[captacion/nota-encargo] Missing critical env vars: ${missingEnvs.join(", ")}`,
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "Configuración de envío WhatsApp incompleta. Contacta al administrador.",
      },
      { status: 503 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { refCatastral, visitDateTime } = parsed.data;
  const propietarioPhone = normalizePhoneES(parsed.data.propietarioPhone);
  const visitDate = new Date(visitDateTime);
  const now = Date.now();
  const warnings: string[] = [];
  const cadastralWarning = buildCadastralRefWarning(refCatastral);
  if (cadastralWarning) warnings.push(cadastralWarning);

  if (visitDate.getTime() <= now) {
    return NextResponse.json(
      { ok: false, error: "La fecha de visita debe estar en el futuro" },
      { status: 400 },
    );
  }

  if (visitDate < startOfTodayMadrid()) {
    return NextResponse.json(
      {
        ok: false,
        error: "La fecha de visita no puede ser anterior a hoy",
      },
      { status: 400 },
    );
  }

  const maxFutureMs = NOTA_ENCARGO_MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
  if (visitDate.getTime() > now + maxFutureMs) {
    return NextResponse.json(
      {
        ok: false,
        error: `La fecha de visita no puede ser más de ${NOTA_ENCARGO_MAX_FUTURE_DAYS} días en el futuro`,
      },
      { status: 400 },
    );
  }

  let comercialId: string;
  if (isCeoOrAdmin(session.role)) {
    const selectedComercialId = parsed.data.comercialId?.trim();
    if (!selectedComercialId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Debe seleccionar el comercial responsable al crear la nota de encargo",
        },
        { status: 400 },
      );
    }
    const selectedComercial = await prisma.comercial.findFirst({
      where: { id: selectedComercialId, activo: true },
      select: { id: true },
    });
    if (!selectedComercial) {
      return NextResponse.json(
        {
          ok: false,
          error: "El comercial seleccionado no existe o está inactivo",
        },
        { status: 400 },
      );
    }
    comercialId = selectedComercial.id;
  } else {
    if (!session.comercialId) return forbidden();
    comercialId = session.comercialId;
  }

  const existingActiveByRef = await prisma.notaEncargoSession.findFirst({
    where: {
      refCatastral,
      state: { notIn: ["CANCELADA", "FIRMADA", "DOCUMENTO_ENVIADO"] },
      NOT: {
        visitDateTime: visitDate,
        comercialId,
      },
    },
    select: { id: true },
  });

  if (existingActiveByRef) {
    return NextResponse.json(
      {
        ok: false,
        error: "Ya existe una nota de encargo activa para esta referencia catastral",
        sessionId: existingActiveByRef.id,
      },
      { status: 409 },
    );
  }

  const propertyCurrent = await prisma.propertyCurrent.findFirst({
    where: { refCatastral: { equals: refCatastral, mode: "insensitive" } },
  });

  if (propertyCurrent?.nodisponible) {
    return NextResponse.json(
      { ok: false, error: "La propiedad no está disponible" },
      { status: 400 },
    );
  }

  const propertySnapshot = propertyCurrent
    ? await prisma.propertySnapshot.findUnique({
        where: { codigo: propertyCurrent.codigo },
      })
    : null;
  const raw = (propertySnapshot?.raw ?? {}) as Record<string, unknown>;

  const direccion = propertyCurrent
    ? extractDireccionFromRaw(raw, propertyCurrent)
    : "";
  if (propertyCurrent && !direccion) {
    console.warn(
      `[captacion/nota-encargo] Empty direccion for property ${propertyCurrent.codigo} — using city/zone fallback`,
    );
  }

  const tipoOperacion = propertyCurrent
    ? resolveOperationType(propertyCurrent.tipoOfer)
    : "";
  const precio = propertyCurrent?.precio ?? 0;

  // --- Idempotency: check for existing active session with same key ---
  const existingSession = await prisma.notaEncargoSession.findFirst({
    where: {
      refCatastral,
      visitDateTime: visitDate,
      comercialId,
      state: { not: "CANCELADA" },
    },
  });

  if (existingSession) {
    return NextResponse.json(
      {
        ok: true,
        sessionId: existingSession.id,
        deduplicated: true,
        warnings,
      },
      { status: 200 },
    );
  }

  // --- Atomic creation: session + event + job ---
  let notaSessionId: string;
  try {
    notaSessionId = await prisma.$transaction(async (tx) => {
      const notaSession = await tx.notaEncargoSession.create({
        data: {
          propertyCode: propertyCurrent?.codigo ?? null,
          propertyRef: propertyCurrent?.ref ?? null,
          refCatastral,
          comercialId,
          propietarioPhone,
          visitDateTime: visitDate,
          state: propertyCurrent ? "PENDING" : "PENDIENTE_PROPIEDAD",
          direccion: propertyCurrent
            ? direccion || `${propertyCurrent.zona}, ${propertyCurrent.ciudad}`
            : "",
          tipoOperacion,
          precio,
        },
      });

      await tx.event.create({
        data: {
          type: "NOTA_ENCARGO_DETECTADA",
          aggregateType: "PROPERTY",
          aggregateId: propertyCurrent?.codigo ?? refCatastral,
          payload: {
            sessionId: notaSession.id,
            propertyRef: propertyCurrent?.ref ?? null,
            refCatastral,
            propertyCode: propertyCurrent?.codigo ?? null,
            comercialId,
            source: "platform",
          },
        },
      });

      const twoHoursBefore = new Date(
        visitDate.getTime() - 2 * 60 * 60 * 1000,
      );
      const availableAt = new Date(
        Math.max(twoHoursBefore.getTime(), Date.now() + 60_000),
      );

      await tx.jobQueue.create({
        data: {
          type: "NOTA_ENCARGO_RECORDATORIO",
          payload: { sessionId: notaSession.id },
          availableAt,
          idempotencyKey: `nota_encargo_recordatorio:${notaSession.id}`,
        },
      });

      if (!propertyCurrent) {
        const matchingDeadline = new Date(
          visitDate.getTime() +
            NOTA_ENCARGO_MATCHING_DEADLINE_DAYS * 24 * 60 * 60 * 1000,
        );
        await tx.jobQueue.create({
          data: {
            type: "NOTA_ENCARGO_MATCHING_CHECK",
            payload: { sessionId: notaSession.id, refCatastral },
            availableAt: matchingDeadline,
            idempotencyKey: `nota_encargo_matching:${notaSession.id}`,
          },
        });
      }

      return notaSession.id;
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const fallback = await prisma.notaEncargoSession.findFirst({
        where: {
          refCatastral,
          visitDateTime: visitDate,
          comercialId,
          state: { not: "CANCELADA" },
        },
      });
      if (fallback) {
        return NextResponse.json(
          {
            ok: true,
            sessionId: fallback.id,
            deduplicated: true,
            warnings,
          },
          { status: 200 },
        );
      }
    }
    throw err;
  }

  return NextResponse.json(
    {
      ok: true,
      sessionId: notaSessionId,
      linked: Boolean(propertyCurrent),
      warnings,
    },
    { status: 201 },
  );
}
