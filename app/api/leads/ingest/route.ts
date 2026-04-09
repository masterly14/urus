import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { emitLeadIngestado } from "@/lib/leads";
import type { LeadIngestPayload } from "@/lib/leads";
import { withObservedRoute } from "@/lib/observability";


const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON inválido" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body debe ser un objeto JSON" },
      { status: 400 },
    );
  }

  const data = body as Record<string, unknown>;

  if (!data.tipo || (data.tipo !== "comprador" && data.tipo !== "propietario")) {
    return NextResponse.json(
      { error: "Campo 'tipo' requerido: 'comprador' | 'propietario'" },
      { status: 400 },
    );
  }

  if (!data.ciudad || typeof data.ciudad !== "string") {
    return NextResponse.json(
      { error: "Campo 'ciudad' requerido (string)" },
      { status: 400 },
    );
  }

  const payload: LeadIngestPayload = {
    tipo: data.tipo as "comprador" | "propietario",
    ciudad: data.ciudad as string,
    ...(typeof data.nombre === "string" && { nombre: data.nombre }),
    ...(typeof data.email === "string" && { email: data.email }),
    ...(typeof data.telefono === "string" && { telefono: data.telefono }),
    ...(typeof data.source === "string" && { source: data.source }),
    ...(typeof data.preaprobacionHipotecaria === "boolean" && {
      preaprobacionHipotecaria: data.preaprobacionHipotecaria,
    }),
    ...(typeof data.presupuestoDefinido === "boolean" && {
      presupuestoDefinido: data.presupuestoDefinido,
    }),
    ...(typeof data.plazoDias === "number" && { plazoDias: data.plazoDias }),
    ...(typeof data.mensajeConDetalles === "boolean" && {
      mensajeConDetalles: data.mensajeConDetalles,
    }),
    ...(typeof data.referido === "boolean" && { referido: data.referido }),
    ...(typeof data.soloMirando === "boolean" && {
      soloMirando: data.soloMirando,
    }),
    ...(typeof data.urgenciaVenta === "boolean" && {
      urgenciaVenta: data.urgenciaVenta,
    }),
    ...(typeof data.precioCercanoMercado === "boolean" && {
      precioCercanoMercado: data.precioCercanoMercado,
    }),
    ...(typeof data.exclusivaAceptable === "boolean" && {
      exclusivaAceptable: data.exclusivaAceptable,
    }),
    ...(typeof data.documentacionDisponible === "boolean" && {
      documentacionDisponible: data.documentacionDisponible,
    }),
    ...(typeof data.probarSinAgencia === "boolean" && {
      probarSinAgencia: data.probarSinAgencia,
    }),
    ...(typeof data.especialidad === "string" && {
      especialidad: data.especialidad,
    }),
  };

  try {
    const result = await emitLeadIngestado(payload);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error(
      "[api/leads/ingest] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al ingestar lead" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/leads/ingest" }, postHandler);
