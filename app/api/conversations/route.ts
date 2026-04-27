import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { listConversations } from "@/lib/conversations/queries";
import { withObservedRoute } from "@/lib/observability";

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) || n < 1 ? undefined : n;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDirection(value: string | null) {
  if (value === "inbound" || value === "outbound") return value;
  return "all";
}

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));

  if (from && to && from > to) {
    return NextResponse.json(
      { ok: false, error: "`from` debe ser anterior a `to`" },
      { status: 400 },
    );
  }

  try {
    const result = await listConversations({
      limit: parsePositiveInt(url.searchParams.get("limit")),
      cursor: url.searchParams.get("cursor"),
      search: url.searchParams.get("q"),
      from,
      to,
      direction: parseDirection(url.searchParams.get("direction")),
      agentOnly: url.searchParams.get("agent") === "1",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[GET /api/conversations]", err);
    return NextResponse.json(
      { ok: false, error: "Error cargando conversaciones" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/conversations" },
  getHandler,
);

