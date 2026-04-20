/**
 * POST /api/matching/rematch/[runId]/cancel
 *
 * Marca un rematch RUNNING como FAILED para desbloquear la UI y permitir un nuevo POST.
 * Útil si el consumer no está levantado y la ejecución no avanza.
 * Solo CEO.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";

const postHandler = async (
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) => {
  const session = await getSessionFromRequest(_request);
  if (!session) return unauthorized();
  if (session.role !== "ceo") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { runId } = await params;

  const run = await prisma.rematchRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Run no encontrado" }, { status: 404 });
  }

  if (run.status !== "RUNNING") {
    return NextResponse.json(
      { error: "El rematch no está en ejecución", status: run.status },
      { status: 409 },
    );
  }

  await prisma.rematchRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      errorMessage: "Cancelado manualmente desde la plataforma.",
    },
  });

  return NextResponse.json({ ok: true });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/matching/rematch/[runId]/cancel" },
  postHandler,
);
