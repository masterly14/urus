import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCeoCityPerformance } from "@/lib/dashboard/ceo/city-queries";

export async function GET(request: Request) {
  const session = getSession(request);

  if (session.role !== "ceo") {
    return NextResponse.json(
      { error: "Acceso restringido al CEO" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const range =
      fromParam && toParam
        ? { from: new Date(fromParam), to: new Date(toParam) }
        : undefined;

    const data = await getCeoCityPerformance(range);
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ceo/cities] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
