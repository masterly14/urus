/**
 * Job + Event handlers for the Nota de Encargo flow.
 *
 * Jobs:
 *  - NOTA_ENCARGO_RECORDATORIO   → sends WhatsApp reminder 2h before visit
 *  - NOTA_ENCARGO_CHECK_CONFIRMACION → checks if owner confirmed; notifies comercial if not
 *  - NOTA_ENCARGO_ENVIAR_FORMULARIO  → sends WhatsApp Flow form at visit time
 *  - CREAR_PROSPECTO_INMOVILLA       → creates prospect in Inmovilla after signature
 *
 * Event:
 *  - NOTA_ENCARGO_FORMULARIO_COMPLETADO → generates PDF + initiates signature
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import {
  sendNotaEncargoRecordatorio,
  sendNotaEncargoNoConfirmada,
  sendNotaEncargoFlow,
} from "@/lib/nota-encargo/whatsapp";
import { handleNotaEncargoFlowResponse } from "@/lib/nota-encargo/send-to-signature";
import { lookupReferenciaCatastral } from "@/lib/catastro";
import { loginToInmovilla } from "@/lib/inmovilla/auth/login";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { searchClient, createClient } from "@/lib/inmovilla/rest/clients";
import {
  getKeyLocaByCiudad,
  getKeyTipoByNombre,
  getKeyZonaByZonaAndKeyLoca,
} from "@/lib/inmovilla/rest/catalogs";
import {
  createProspecto,
  changeProspectoStatus,
} from "@/lib/inmovilla/crm/create-prospecto";

// ---------------------------------------------------------------------------
// Job: NOTA_ENCARGO_RECORDATORIO
// ---------------------------------------------------------------------------

export async function handleNotaEncargoRecordatorio(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (session.state !== "PENDING") return { success: true };

  await sendNotaEncargoRecordatorio(session.propietarioPhone, {
    propertyRef: session.propertyRef,
    direccion: session.direccion,
    visitTime: session.visitDateTime,
  });

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "RECORDATORIO_ENVIADO" },
  });

  const checkAt = new Date(
    session.visitDateTime.getTime() - 30 * 60 * 1000,
  );
  await enqueueJob({
    type: "NOTA_ENCARGO_CHECK_CONFIRMACION",
    payload: { sessionId },
    availableAt: new Date(Math.max(checkAt.getTime(), Date.now() + 60_000)),
    idempotencyKey: `nota_encargo_check:${sessionId}`,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Job: NOTA_ENCARGO_CHECK_CONFIRMACION
// ---------------------------------------------------------------------------

export async function handleNotaEncargoCheckConfirmacion(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (
    session.state === "CONFIRMADA" ||
    session.state === "FORMULARIO_ENVIADO"
  ) {
    return { success: true };
  }

  if (session.state !== "RECORDATORIO_ENVIADO") return { success: true };

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });

  if (comercial?.telefono) {
    await sendNotaEncargoNoConfirmada(comercial.telefono, {
      propertyRef: session.propertyRef,
      direccion: session.direccion,
      visitTime: session.visitDateTime,
    });
  }

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "NO_CONFIRMADA" },
  });

  await appendEvent({
    type: "NOTA_ENCARGO_NO_CONFIRMADA",
    aggregateType: "PROPERTY",
    aggregateId: session.propertyCode,
    payload: { sessionId },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Job: NOTA_ENCARGO_ENVIAR_FORMULARIO
// ---------------------------------------------------------------------------

export async function handleNotaEncargoEnviarFormulario(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (session.state !== "CONFIRMADA") return { success: true };

  await sendNotaEncargoFlow(session.propietarioPhone, {
    sessionId: session.id,
    direccion: session.direccion,
    tipoOperacion: session.tipoOperacion,
    precio: session.precio,
    propertyRef: session.propertyRef,
  });

  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: { state: "FORMULARIO_ENVIADO" },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Event: NOTA_ENCARGO_FORMULARIO_COMPLETADO
// ---------------------------------------------------------------------------

export async function handleNotaEncargoFormularioCompletado(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as {
    sessionId: string;
    formData: Record<string, unknown>;
  } | null;

  if (!payload?.sessionId) {
    return {
      success: false,
      error: "NOTA_ENCARGO_FORMULARIO_COMPLETADO: missing sessionId",
      permanent: true,
    };
  }

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: payload.sessionId },
  });

  if (!session || session.state !== "FORMULARIO_ENVIADO") {
    return { success: true };
  }

  await handleNotaEncargoFlowResponse(session, payload.formData);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Job: CREAR_PROSPECTO_INMOVILLA
// ---------------------------------------------------------------------------

function splitFullName(fullName: string): { nombre: string; apellidos: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { nombre: parts[0] ?? "", apellidos: "" };
  return { nombre: parts[0], apellidos: parts.slice(1).join(" ") };
}

export async function handleCrearProspectoInmovilla(
  job: JobRecord,
): Promise<HandlerResult> {
  const { sessionId } = job.payload as { sessionId: string };
  const session = await prisma.notaEncargoSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (
    session.state !== "DOCUMENTO_ENVIADO" &&
    session.state !== "FIRMADA"
  ) {
    console.log(
      `[crear-prospecto] Session ${sessionId} in state ${session.state} — skipping`,
    );
    return { success: true };
  }

  if (session.inmovillaCodOfer) {
    console.log(
      `[crear-prospecto] Session ${sessionId} already has cod_ofer=${session.inmovillaCodOfer} — skipping`,
    );
    return { success: true };
  }

  // 1. Load property data
  const propertySnapshot = await prisma.propertySnapshot.findUnique({
    where: { codigo: session.propertyCode },
  });
  const propertyCurrent = await prisma.propertyCurrent.findFirst({
    where: { codigo: session.propertyCode },
  });

  if (!propertyCurrent) {
    return {
      success: false,
      error: `PropertyCurrent not found for ${session.propertyCode}`,
      permanent: true,
    };
  }

  const raw = (propertySnapshot?.raw ?? {}) as Record<string, unknown>;
  const calle = String(raw.calle ?? "").trim();
  const numero = Number(raw.numero) || 0;
  const cp = String(raw.cp ?? "").trim();
  const planta = String(raw.planta ?? "").trim() || undefined;

  // 2. Resolve provincia from Inmovilla enum catalogs
  const ciudadRow = await prisma.inmovillaEnumCiudad.findFirst({
    where: { ciudad: { equals: propertyCurrent.ciudad, mode: "insensitive" } },
    select: { provincia: true, key_loca: true },
  });
  // The `provincia` column can be "Desconocida" or empty — fall back to
  // the city name itself (in Spain, many cities share the province name,
  // e.g. Córdoba city → Córdoba province).
  const rawProv = ciudadRow?.provincia ?? "";
  const provincia =
    rawProv && rawProv.toLowerCase() !== "desconocida"
      ? rawProv
      : propertyCurrent.ciudad;

  // 3. Catastro lookup (best effort)
  let referenciaCatastral: string | undefined;
  if (calle && numero > 0 && provincia) {
    const catastroResult = await lookupReferenciaCatastral({
      provincia,
      municipio: propertyCurrent.ciudad,
      tipoVia: "CL",
      nomVia: calle,
      numero,
      planta,
    });

    if (catastroResult.found) {
      referenciaCatastral = catastroResult.referenciaCatastral;
      console.log(
        `[crear-prospecto] Catastro: ${referenciaCatastral}`,
      );
    } else {
      console.warn(
        `[crear-prospecto] Catastro lookup failed: ${catastroResult.error}`,
      );
    }
  } else {
    console.warn(
      `[crear-prospecto] Insufficient address data for catastro: calle="${calle}" numero=${numero} provincia="${provincia}"`,
    );
  }

  // 4. Resolve Inmovilla catalog keys
  const key_loca =
    ciudadRow?.key_loca ??
    (await getKeyLocaByCiudad(prisma, {
      ciudadNombre: propertyCurrent.ciudad,
    }));

  if (!key_loca) {
    return {
      success: false,
      error: `key_loca not found for ciudad=${propertyCurrent.ciudad}`,
      permanent: true,
    };
  }

  const key_zona =
    (await getKeyZonaByZonaAndKeyLoca(
      prisma,
      propertyCurrent.zona,
      key_loca,
    )) ?? 0;

  const tipoOfer = propertyCurrent.tipoOfer || "Piso";
  const key_tipo =
    (await getKeyTipoByNombre(prisma, tipoOfer)) ?? 2799;

  // 5. Search/create client (propietario) via REST v1
  const restClient = createInmovillaRestClient();
  let keycli = 0;

  try {
    const phone = session.propietarioPhone;
    const existing = await searchClient(restClient, { telefono: phone });

    if (existing.length > 0) {
      keycli = Number(existing[0].cod_cli) || 0;
      console.log(
        `[crear-prospecto] Found existing client: cod_cli=${keycli}`,
      );
    } else if (session.propietarioNombre) {
      const { nombre, apellidos } = splitFullName(session.propietarioNombre);
      const created = await createClient(restClient, {
        nombre,
        apellidos,
        nif: session.propietarioDni ?? undefined,
        email: "",
        telefono1: Number(phone) || undefined,
      });
      keycli = created.cod_cli;
      console.log(
        `[crear-prospecto] Created client: cod_cli=${keycli}`,
      );
    }
  } catch (err) {
    console.warn(
      `[crear-prospecto] Client search/create failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  // 6. Login to Inmovilla (CRM v2 session)
  let inmoSession = await loginToInmovilla({
    headless: true,
    persistSession: true,
  });

  const keyacci = session.tipoOperacion === "ALQUILER" ? 2 : 1;
  const precioinmo = keyacci === 1 ? session.precio : 0;
  const precioalq = keyacci === 2 ? session.precio : 0;

  // 7. Create prospecto via CRM v2 (retry once with fresh login on 401)
  const createParams: Parameters<typeof createProspecto>[1] = {
    key_loca,
    key_zona,
    key_tipo,
    calle,
    numero,
    cp,
    planta,
    referenciaCatastral,
    keyacci,
    precioinmo,
    precioalq,
    habitaciones: Number(raw.habitaciones ?? propertyCurrent.habitaciones ?? 0),
    banyos: Number(raw.banyos ?? propertyCurrent.banyos ?? 0),
    m_cons: Number(raw.m_cons ?? propertyCurrent.metrosConstruidos ?? 0),
    keyagente: session.comercialId,
    keycli,
    numagencia: inmoSession.numAgencia,
    keymedio: 12,
  };

  let prospectoResponse: Awaited<ReturnType<typeof createProspecto>>;
  try {
    prospectoResponse = await createProspecto(inmoSession, createParams);
  } catch (err) {
    const is401 =
      err instanceof Error && err.message.includes("401");
    if (!is401) throw err;

    console.warn(
      `[crear-prospecto] CRM v2 401 — forcing fresh login and retrying...`,
    );
    inmoSession = await loginToInmovilla({
      headless: true,
      persistSession: true,
      forceFreshLogin: true,
    });
    createParams.numagencia = inmoSession.numAgencia;
    prospectoResponse = await createProspecto(inmoSession, createParams);
  }

  const codOfer = prospectoResponse.cod_ofer;

  // 8. StatusChange — activate
  try {
    await changeProspectoStatus(inmoSession, codOfer, {
      estado: 1,
      subEstado: 1,
      comentario: "Agent Pilot AI - Nota de encargo firmada",
    });
  } catch (err) {
    console.warn(
      `[crear-prospecto] StatusChange failed (prospecto created but not activated): ${err instanceof Error ? err.message : err}`,
    );
  }

  // 9. Update session
  await prisma.notaEncargoSession.update({
    where: { id: sessionId },
    data: {
      state: "PROSPECTO_CREADO",
      inmovillaCodOfer: codOfer,
      refCatastral: referenciaCatastral ?? null,
    },
  });

  // 10. Emit event
  await appendEvent({
    type: "NOTA_ENCARGO_DETECTADA",
    aggregateType: "PROPERTY",
    aggregateId: session.propertyCode,
    payload: {
      sessionId,
      codOfer,
      ref: prospectoResponse.mainData?.ref,
      referenciaCatastral: referenciaCatastral ?? null,
    },
    metadata: { step: "PROSPECTO_CREADO" },
  });

  console.log(
    `[crear-prospecto] Done: session=${sessionId}, cod_ofer=${codOfer}, ref=${prospectoResponse.mainData?.ref}`,
  );

  return { success: true };
}
