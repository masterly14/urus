import { prisma } from "@/lib/prisma";
import { processMentalHealthMessage } from "@/lib/agents/mental-health-graph";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const HISTORY_LIMIT = 12;

export type CoachChatMessageRole = "comercial" | "coach";

export interface CoachChatMessageView {
  id: string;
  role: CoachChatMessageRole;
  text: string;
  createdAt: string;
}

export interface CoachChatSessionView {
  id: string;
  isActive: boolean;
  turnCount: number;
  flujoActivo: string | null;
  nivelEnergia: number | null;
  lastMessageAt: string;
  messages: CoachChatMessageView[];
}

type SessionWithMessages = Awaited<ReturnType<typeof getOrCreateActiveSession>>;

const MS_PER_DAY = 86_400_000;

function mapSession(session: SessionWithMessages): CoachChatSessionView {
  return {
    id: session.id,
    isActive: session.isActive,
    turnCount: session.turnCount,
    flujoActivo: session.flujoActivo,
    nivelEnergia: session.nivelEnergia,
    lastMessageAt: session.lastMessageAt.toISOString(),
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role as CoachChatMessageRole,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

async function loadCrmContext(comercialId: string | null) {
  if (!comercialId) return null;
  try {
    const comercial = await prisma.comercial.findUnique({
      where: { id: comercialId },
      select: { nombre: true, ciudad: true },
    });

    if (!comercial) return null;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [visitasHoy, opsPendientes, opsCanceladas, cierresRecientes] =
      await Promise.all([
        prisma.commercialVisitFact.count({
          where: {
            comercialId,
            scheduledAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.operacion.count({
          where: {
            comercialId,
            estado: { in: ["ARRAS", "PENDIENTE_FIRMA"] },
          },
        }),
        prisma.operacion.count({
          where: {
            comercialId,
            estado: "CANCELADA",
            updatedAt: { gte: new Date(Date.now() - 14 * MS_PER_DAY) },
          },
        }),
        prisma.commercialOperationFact.count({
          where: {
            comercialId,
            closedAt: { gte: new Date(Date.now() - 30 * MS_PER_DAY) },
          },
        }),
      ]);

    return {
      nombreComercial: comercial.nombre,
      ciudad: comercial.ciudad ?? "desconocida",
      cierresPendientesHoy: visitasHoy + opsPendientes,
      operacionPerdidaReciente: opsCanceladas > 0,
      rachaPositiva: cierresRecientes >= 2,
    };
  } catch {
    return null;
  }
}

function isSessionExpired(lastMessageAt: Date): boolean {
  return Date.now() - lastMessageAt.getTime() > SESSION_TIMEOUT_MS;
}

async function getOrCreateActiveSession(userId: string, comercialId: string | null) {
  const existing = await prisma.coachChatSession.findFirst({
    where: { userId, isActive: true },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (existing) {
    if (isSessionExpired(existing.lastMessageAt)) {
      await prisma.coachChatSession.update({
        where: { id: existing.id },
        data: { isActive: false, closedAt: new Date() },
      });
    } else {
      return existing;
    }
  }

  return prisma.coachChatSession.create({
    data: { userId, comercialId, isActive: true },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getCoachChat(
  userId: string,
  comercialId: string | null,
): Promise<CoachChatSessionView> {
  const session = await getOrCreateActiveSession(userId, comercialId);
  return mapSession(session);
}

export async function closeCoachChat(userId: string): Promise<void> {
  await prisma.coachChatSession.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false, closedAt: new Date() },
  });
}

export async function sendCoachTurn(
  userId: string,
  comercialId: string | null,
  messageText: string,
): Promise<CoachChatSessionView> {
  const trimmedText = messageText.trim();
  if (!trimmedText) throw new Error("El mensaje no puede estar vacío");

  const session = await getOrCreateActiveSession(userId, comercialId);

  await prisma.coachChatMessage.create({
    data: {
      sessionId: session.id,
      role: "comercial",
      text: trimmedText,
    },
  });

  const recentTurns = await prisma.coachChatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  const conversationHistory = recentTurns
    .reverse()
    .map((turn) => ({
      role: turn.role as CoachChatMessageRole,
      text: turn.text,
      timestamp: turn.createdAt.toISOString(),
    }));

  const crmContext = await loadCrmContext(comercialId);

  const result = await processMentalHealthMessage({
    messageText: trimmedText,
    comercialId,
    waId: `coach-ui:${userId}`,
    conversationHistory,
    sessionContext: {
      flujoActivo: session.flujoActivo,
      flujoStep: session.flujoStep,
      turnCount: session.turnCount,
      nivelEnergia: session.nivelEnergia,
    },
    crmContext,
  });

  const flujoChanged = session.flujoActivo !== result.classification.flujo;
  const nextFlujoStep = flujoChanged ? 1 : (session.flujoStep ?? 0) + 1;

  await prisma.$transaction([
    prisma.coachChatMessage.create({
      data: {
        sessionId: session.id,
        role: "coach",
        text: result.responseText,
        metadata: result.classification,
      },
    }),
    prisma.coachChatSession.update({
      where: { id: session.id },
      data: {
        flujoActivo: result.classification.flujo,
        flujoStep: nextFlujoStep,
        subtipoBloqueo: result.classification.subtipoBloqueo,
        nivelEnergia: result.classification.nivelEnergia,
        turnCount: { increment: 1 },
        lastMessageAt: new Date(),
        isActive: true,
        closedAt: null,
      },
    }),
  ]);

  const freshSession = await prisma.coachChatSession.findUniqueOrThrow({
    where: { id: session.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return mapSession(freshSession);
}
