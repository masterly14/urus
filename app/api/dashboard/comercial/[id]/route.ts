import { NextResponse } from "next/server";
import {
  getComercialDashboardDetail,
  getDefaultDashboardRange,
} from "@/lib/dashboard/comercial/queries";

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(
  request: Request,
  context: { params: { id: string } },
) {
  const comercialId = context.params.id;
  const url = new URL(request.url);

  const from = parseIsoDate(url.searchParams.get("from"));
  const to = parseIsoDate(url.searchParams.get("to"));

  const defaultRange = getDefaultDashboardRange();
  const range = {
    from: from ?? defaultRange.from,
    to: to ?? defaultRange.to,
  };

  if (from && to && range.from >= range.to) {
    return NextResponse.json(
      { error: "'from' debe ser menor que 'to'" },
      { status: 400 },
    );
  }

  try {
    const result = await getComercialDashboardDetail(comercialId, range);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard/comercial/:id] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

