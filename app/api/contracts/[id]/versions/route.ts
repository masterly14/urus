import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getEventsByAggregate } from "@/lib/event-store";
import { normalizeSmartClosingVersionEvent } from "@/lib/legal/smart-closing/contracts-api";
import { prisma } from "@/lib/prisma";
import { withObservedRoute } from "@/lib/observability";

type RouteParams = { params: Promise<{ id: string }> };

const getHandler = async (request: Request, { params }: RouteParams) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;

  const legalDocument = await prisma.legalDocument.findUnique({
    where: { id },
    select: {
      id: true,
      propertyCode: true,
      contractInput: true,
      templateVersion: true,
      createdAt: true,
    },
  });

  if (!legalDocument) {
    return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
  }

  const events = await getEventsByAggregate("PROPERTY", legalDocument.propertyCode, { limit: 200 });
  const versionEvents = events
    .filter((event) => event.type === "CONTRATO_VERSIONADO")
    .map(normalizeSmartClosingVersionEvent)
    .filter((event): event is NonNullable<typeof event> => event !== null);

  return NextResponse.json({
    versions: versionEvents,
  });
}

export const GET = withObservedRoute({ method: "GET", route: "/api/contracts/[id]/versions" }, getHandler);
