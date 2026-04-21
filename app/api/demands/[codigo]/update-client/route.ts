/**
 * POST /api/demands/[codigo]/update-client
 *
 * Permite al comercial completar datos del comprador (nombre, apellidos,
 * teléfono, email) directamente en Inmovilla vía REST PUT /clientes/.
 * El cod_cli se extrae de DemandSnapshot.raw.keycli.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { updateClient, searchClient } from "@/lib/inmovilla/rest/clients";
import type { JsonValue } from "@/lib/event-store/types";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    nombre: z.string().min(1).optional(),
    apellidos: z.string().min(1).optional(),
    telefono1: z.number().int().positive().optional(),
    telefono2: z.number().int().positive().optional(),
    email: z.string().email().optional(),
    force: z.boolean().optional(),
  })
  .refine(
    (d) => {
      const { force: _f, ...fields } = d;
      return Object.values(fields).some((v) => v !== undefined);
    },
    { message: "Debe enviar al menos un campo a actualizar" },
  );

function pickString(
  raw: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && v > 0) return String(v);
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { codigo } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch = parsed.data;

  const token = process.env.INMOVILLA_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "INMOVILLA_API_TOKEN no configurado" },
      { status: 503 },
    );
  }

  const snapshot = await prisma.demandSnapshot.findUnique({
    where: { codigo },
    select: { raw: true },
  });

  if (!snapshot) {
    return NextResponse.json(
      { error: "Demanda no encontrada" },
      { status: 404 },
    );
  }

  const raw = (snapshot.raw as Record<string, unknown>) ?? {};
  const codCliStr = pickString(raw, [
    "keycli",
    "cod_cli",
    "clientes-cod_cli",
    "clientes-cod_clipriclave",
  ]);

  if (!codCliStr) {
    return NextResponse.json(
      { error: "No se encontró cod_cli del comprador en esta demanda. No se puede actualizar sin este dato." },
      { status: 422 },
    );
  }

  const codCli = Number(codCliStr);
  if (!codCli || codCli <= 0) {
    return NextResponse.json(
      { error: `cod_cli inválido: ${codCliStr}` },
      { status: 422 },
    );
  }

  const restClient = createInmovillaRestClient({ token });

  if ((patch.telefono1 || patch.email) && !patch.force) {
    try {
      const duplicates = await searchClient(restClient, {
        telefono: patch.telefono1 ? String(patch.telefono1) : undefined,
        email: patch.email,
      });

      const othersWithSameData = duplicates.filter(
        (c) => Number(c.cod_cli) !== codCli,
      );

      if (othersWithSameData.length > 0) {
        const dup = othersWithSameData[0];
        return NextResponse.json(
          {
            error: "duplicate",
            message: `Ya existe un cliente con este dato: ${dup.nombre ?? ""} ${dup.apellidos ?? ""} (cod_cli: ${dup.cod_cli})`,
            duplicate: {
              cod_cli: dup.cod_cli,
              nombre: dup.nombre,
              apellidos: dup.apellidos,
              telefono1: dup.telefono1,
              email: dup.email,
            },
          },
          { status: 409 },
        );
      }
    } catch (err) {
      console.warn(
        `[update-client] Error buscando duplicados (no bloqueante): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  try {
    const inmoPatch: Record<string, unknown> = {};
    if (patch.nombre !== undefined) inmoPatch.nombre = patch.nombre;
    if (patch.apellidos !== undefined) inmoPatch.apellidos = patch.apellidos;
    if (patch.telefono1 !== undefined) inmoPatch.telefono1 = patch.telefono1;
    if (patch.telefono2 !== undefined) inmoPatch.telefono2 = patch.telefono2;
    if (patch.email !== undefined) inmoPatch.email = patch.email;

    await updateClient(restClient, codCli, inmoPatch as Parameters<typeof updateClient>[2]);

    const changedFields = Object.keys(patch).filter(
      (k) => patch[k as keyof typeof patch] !== undefined,
    );

    // Optimistic local update — refleja los cambios inmediatamente en la
    // plataforma. La próxima ingesta (cada 5 min) re-sincronizará desde
    // Inmovilla como fuente de verdad.
    const localPatch: Record<string, unknown> = {};
    const fullName = [patch.nombre, patch.apellidos]
      .filter((v) => typeof v === "string" && v.trim())
      .join(" ")
      .trim();
    if (fullName) {
      localPatch.nombre = fullName;
    }
    if (patch.telefono1 !== undefined) {
      localPatch.telefono = String(patch.telefono1);
    }

    if (Object.keys(localPatch).length > 0) {
      try {
        await prisma.demandCurrent.update({
          where: { codigo },
          data: localPatch,
        });
      } catch (updateErr) {
        console.warn(
          `[update-client] No se pudo actualizar proyección local (no bloqueante): ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
        );
      }
    }

    await appendEvent({
      type: "DEMANDA_ACTUALIZADA",
      aggregateType: "DEMAND",
      aggregateId: codigo,
      payload: {
        source: "client-edit",
        codCli,
        changedFields,
        updatedBy: session.nombre ?? session.email ?? "unknown",
      } as unknown as JsonValue,
    });

    console.log(
      `[update-client] demanda=${codigo} cod_cli=${codCli} campos=[${changedFields.join(",")}] por ${session.email ?? "unknown"}`,
    );

    return NextResponse.json({ ok: true, updatedFields: changedFields });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[update-client] Error: ${message}`);

    const isRateLimit = /429|too many|rate limit/i.test(message);
    if (isRateLimit) {
      return NextResponse.json(
        {
          error: "Inmovilla ha alcanzado el límite de peticiones por minuto. Inténtalo en unos minutos.",
          code: "RATE_LIMIT",
          retryAfterSeconds: 60,
        },
        { status: 429 },
      );
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
