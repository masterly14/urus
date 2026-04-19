import { NextResponse } from "next/server";
import { z } from "zod";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { listPostventaPipeline } from "@/lib/postventa/pipeline-read-model";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Query inválida",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const data = await listPostventaPipeline(parsed.data.limit);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/postventa/pipeline] GET error:", error);
    return NextResponse.json(
      { error: "Error al listar pipeline post-venta" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/postventa/pipeline" },
  getHandler,
);
