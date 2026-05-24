import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { getClient } from "@/lib/inmovilla/rest/clients";
import { canAccessOperacion, OPERACION_FORBIDDEN_ERROR } from "@/lib/operacion/access";
import { isTerminal } from "@/lib/operacion/stages";

type Params = { params: Promise<{ id: string }> };

const ImportarSchema = z.object({
  cod_cli: z.number().int().positive(),
});

/**
 * POST /api/operaciones/:id/importar-comprador
 *
 * Trae un cliente de Inmovilla REST por su cod_cli y lo asocia como
 * comprador de la operación. Emite evento COMPRADOR_ASOCIADO.
 */
const postHandler = async (request: Request, { params }: Params) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  const { id: operacionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = ImportarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const operacion = await prisma.operacion.findUnique({
    where: { id: operacionId },
    select: { id: true, codigo: true, propertyCode: true, estado: true, comercialId: true },
  });

  if (!operacion) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 });
  }

  if (!canAccessOperacion(session, operacion)) {
    return NextResponse.json({ error: OPERACION_FORBIDDEN_ERROR }, { status: 403 });
  }

  if (isTerminal(operacion.estado)) {
    return NextResponse.json(
      { error: `Operación ${operacion.codigo} ya está en estado terminal` },
      { status: 400 },
    );
  }

  const { cod_cli } = parsed.data;

  let cliente;
  try {
    const restClient = createInmovillaRestClient();
    cliente = await getClient(restClient, cod_cli);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[importar-comprador] Error fetching client ${cod_cli}:`, message);
    return NextResponse.json(
      { error: `No se pudo obtener el cliente ${cod_cli} de Inmovilla` },
      { status: 502 },
    );
  }

  const buyerClientId = String(cod_cli);

  await prisma.operacion.update({
    where: { id: operacionId },
    data: { buyerClientId },
  });

  await appendEvent({
    type: "COMPRADOR_ASOCIADO",
    aggregateType: "OPERACION",
    aggregateId: operacion.propertyCode,
    payload: {
      operacionId: operacion.id,
      operacionCodigo: operacion.codigo,
      buyerClientId,
      source: "inmovilla_import",
      clienteNombre: [cliente.nombre, cliente.apellidos].filter(Boolean).join(" "),
      clienteNif: cliente.nif ?? null,
      updatedBy: session.userId,
    } as unknown as JsonValue,
  });

  console.log(
    `[importar-comprador] ${operacion.codigo} — asociado cliente Inmovilla cod_cli=${cod_cli} por userId=${session.userId}`,
  );

  return NextResponse.json({
    operacion: { id: operacion.id, buyerClientId },
    cliente: {
      cod_cli: cliente.cod_cli,
      nombre: cliente.nombre,
      apellidos: cliente.apellidos,
      nif: cliente.nif,
      telefono1: cliente.telefono1,
      email: cliente.email,
    },
  });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/operaciones/[id]/importar-comprador" },
  postHandler,
);
