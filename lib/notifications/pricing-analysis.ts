import { prisma } from "@/lib/prisma";

const PUSHER_EVENT_NAME = "notification";

function userChannel(userId: string): string {
  return `private-notifications-user-${userId}`;
}

export async function notifyPricingAnalysisReady(params: {
  userId: string;
  propertyCode: string;
}): Promise<void> {
  const now = new Date();
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      channel: userChannel(params.userId),
      source: "pricing",
      severity: "info",
      title: "Análisis de pricing listo",
      description: `Propiedad ${params.propertyCode}`,
      eventType: "PRICING_ANALISIS_GENERADO",
      createdAt: now,
    },
  });

  try {
    const { getPusherServer } = await import("@/lib/pusher/server");
    const pusher = getPusherServer();
    await pusher.trigger(userChannel(params.userId), PUSHER_EVENT_NAME, {
      id: notification.id,
      source: "pricing",
      severity: "info",
      title: notification.title,
      description: notification.description,
      timestamp: now.toISOString(),
      read: false,
      eventType: "PRICING_ANALISIS_GENERADO",
    });
  } catch (err) {
    console.error(
      `[notifications:pricing] Error enviando notificación realtime READY: ${err instanceof Error ? err.message : err}`,
    );
  }
}

export async function notifyPricingAnalysisFailed(params: {
  userId: string;
  propertyCode: string;
  errorMessage: string;
}): Promise<void> {
  const now = new Date();
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      channel: userChannel(params.userId),
      source: "pricing",
      severity: "warning",
      title: "No se pudo completar el análisis",
      description: `Propiedad ${params.propertyCode}: ${params.errorMessage}`,
      eventType: "PRICING_ANALISIS_FALLIDO",
      createdAt: now,
    },
  });

  try {
    const { getPusherServer } = await import("@/lib/pusher/server");
    const pusher = getPusherServer();
    await pusher.trigger(userChannel(params.userId), PUSHER_EVENT_NAME, {
      id: notification.id,
      source: "pricing",
      severity: "warning",
      title: notification.title,
      description: notification.description,
      timestamp: now.toISOString(),
      read: false,
      eventType: "PRICING_ANALISIS_FALLIDO",
    });
  } catch (err) {
    console.error(
      `[notifications:pricing] Error enviando notificación realtime FAILED: ${err instanceof Error ? err.message : err}`,
    );
  }
}
