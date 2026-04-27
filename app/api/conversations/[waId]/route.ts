import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getConversation } from "@/lib/conversations/queries";
import { withObservedRoute } from "@/lib/observability";

type RouteParams = { params: Promise<{ waId: string }> };

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) || n < 1 ? undefined : n;
}

function parseOffset(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) || n < 0 ? undefined : n;
}

function parseDirection(value: string | null) {
  if (value === "inbound" || value === "outbound") return value;
  return "all";
}

const getHandler = async (request: Request, { params }: RouteParams) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { waId } = await params;
  if (!/^\d{6,20}$/.test(waId)) {
    return NextResponse.json(
      { ok: false, error: "Identificador de WhatsApp invalido" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);

  try {
    const result = await getConversation(waId, {
      limit: parsePositiveInt(url.searchParams.get("limit")),
      offset: parseOffset(url.searchParams.get("offset")),
      direction: parseDirection(url.searchParams.get("direction")),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[GET /api/conversations/:waId]", err);
    return NextResponse.json(
      { ok: false, error: "Error cargando la conversacion" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/conversations/[waId]" },
  getHandler,
);

