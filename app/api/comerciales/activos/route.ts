import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  try {
    const url = new URL(request.url);
    const onlyUnlinked = url.searchParams.get("unlinked") === "1";

    const comerciales = await prisma.comercial.findMany({
      where: {
        activo: true,
        ...(onlyUnlinked ? { user: { is: null } } : {}),
      },
      select: { id: true, nombre: true, ciudad: true, email: true },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, comerciales });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/comerciales/activos] Error:", message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
};

export const GET = withObservedRoute({ method: "GET", route: "/api/comerciales/activos" }, getHandler);
