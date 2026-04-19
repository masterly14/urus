/**
 * Inmovilla task fetcher: listing via paginación API + detail via REST v2.
 */

import type { InmovillaSession } from "@/lib/inmovilla/auth/types";
import {
  parseTaskRow,
  type RawTask,
  type TaskDetail,
} from "./tasks-parser";

const BASE_URL = "https://crm.inmovilla.com";

const VISTAS = [
  "tareasresultados_atrasadas",
  "tareasresultados_hoy",
  "tareasresultados_manyana",
  "tareasresultados_proximos",
] as const;

const PAGE_SIZE = 30;

function buildCookieHeader(session: InmovillaSession): string {
  return session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

// ---------------------------------------------------------------------------
// Listing (POST paginación)
// ---------------------------------------------------------------------------

async function postPaginacion(
  session: InmovillaSession,
  paramjson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    paramjson: JSON.stringify(paramjson),
    soyajax: "1",
    miid: session.miid,
    l: session.l,
    id_pestanya: session.idPestanya,
  });

  const res = await fetch(
    `${BASE_URL}/new/app/api/v1/paginacion/?cache=${Date.now()}.2`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: buildCookieHeader(session),
      },
      body: body.toString(),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Paginacion request failed: ${res.status} ${res.statusText}`,
    );
  }

  return (await res.json()) as Record<string, unknown>;
}

export async function fetchTaskList(
  session: InmovillaSession,
): Promise<RawTask[]> {
  const allTasks: RawTask[] = [];

  for (const vista of VISTAS) {
    let posicion = 0;

    while (true) {
      const paramjson = {
        general: {
          info: {
            lostags: "",
            numvistas: 1,
            ventana: "tareas-pendientes",
            data: vista,
          },
        },
        [vista]: {
          info: {
            ficha: "tareas-pendientes",
            data: vista,
            posicion,
            paginacion: String(PAGE_SIZE),
            jsonvista: "1",
            totalreg: "0",
          },
        },
      };

      const response = await postPaginacion(session, paramjson);

      const vistaData = (
        response["tareas-pendientes"] as Record<string, unknown> | undefined
      )?.[vista] as { datos?: unknown } | undefined;
      const datos = vistaData?.datos;

      if (!datos || (Array.isArray(datos) && datos.length === 0)) break;

      const rows = Array.isArray(datos)
        ? datos
        : Object.values(datos as Record<string, unknown>);

      for (const row of rows) {
        const r = row as { fields?: Array<{ campo: string; value: string }> };
        if (r.fields) {
          allTasks.push(parseTaskRow(r.fields));
        }
      }

      if (rows.length < PAGE_SIZE) break;
      posicion += PAGE_SIZE;
    }
  }

  return allTasks;
}

// ---------------------------------------------------------------------------
// Detail (GET REST v2)
// ---------------------------------------------------------------------------

export async function fetchTaskDetail(
  session: InmovillaSession,
  codseg: string,
): Promise<TaskDetail> {
  const res = await fetch(
    `${BASE_URL}/new/app/api/v2/seguimientos/${codseg}`,
    {
      method: "GET",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Cookie: buildCookieHeader(session),
      },
    },
  );

  if (!res.ok) {
    throw new Error(
      `Seguimiento ${codseg} fetch failed: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    success: boolean;
    data: Record<string, unknown>;
  };

  if (!json.success) {
    throw new Error(`Seguimiento ${codseg}: API returned success=false`);
  }

  const d = json.data;
  return {
    codseg: d["seguimiento.codseg"] as number,
    asunto: (d["seguimiento.asunto"] as string) ?? "",
    descrip: (d["seguimiento.descrip"] as string) ?? "",
    keyagente: d["seguimiento.keyagente"] as number,
    keytiposeg: d["seguimiento.keytiposeg"] as number,
    fechaaviso: (d["seguimiento.fechaaviso"] as string) ?? "",
    fechaalta: (d["seguimiento.fechaalta"] as string) ?? "",
    tareacerrada: (d["seguimiento.tareacerrada"] as number) ?? 0,
    keyofe: (d["seguimiento.keyofe"] as number) ?? 0,
    duracion: (d["seguimiento.duracion"] as number) ?? 0,
    confirmado: (d["seguimiento.confirmado"] as number) ?? 0,
    altaagente: (d["seguimiento.altaagente"] as number) ?? 0,
    keyagente_nombre: (d["seguimiento.keyagente_nombre"] as string) ?? "",
    keyagente_apellidos:
      (d["seguimiento.keyagente_apellidos"] as string) ?? "",
  };
}
