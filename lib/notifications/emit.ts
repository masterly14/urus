import type { EventType } from "@prisma/client";
import type { Event } from "@/types/domain";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_MAP, type NotificationChannel } from "./notification-map";

const PUSHER_CHANNEL_ORG = "private-notifications-org";
const PUSHER_CHANNEL_MANAGEMENT = "private-notifications-management";
const PUSHER_EVENT_NAME = "notification";

function userChannel(userId: string): string {
  return `private-notifications-user-${userId}`;
}

export interface EmitNotificationInput {
  event: Event;
  comercialId?: string | null;
}

async function resolveUserIdFromComercial(
  comercialId: string,
): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { comercialId },
      select: { id: true },
    });
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function resolvePusherChannels(
  configChannels: NotificationChannel[],
  userId: string | null,
): string[] {
  const channels: string[] = [];

  for (const ch of configChannels) {
    switch (ch) {
      case "org":
        channels.push(PUSHER_CHANNEL_ORG);
        break;
      case "management":
        channels.push(PUSHER_CHANNEL_MANAGEMENT);
        break;
      case "user":
        if (userId) channels.push(userChannel(userId));
        break;
    }
  }

  return channels;
}

/**
 * Emits a real-time notification for a processed domain event.
 *
 * 1. Looks up the event type in the notification map.
 * 2. Resolves which Pusher channels to target (org, management, user-specific).
 * 3. Persists a Notification row per channel.
 * 4. Triggers Pusher on all resolved channels.
 *
 * Designed to be called fire-and-forget from the consumer — errors are logged, never thrown.
 */
export async function emitNotification(
  input: EmitNotificationInput,
): Promise<void> {
  const { event, comercialId } = input;
  const config = NOTIFICATION_MAP[event.type as EventType];

  if (!config) return;

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const title = config.title(payload);
  const description = config.description(payload);

  let userId: string | null = null;
  if (comercialId) {
    userId = await resolveUserIdFromComercial(comercialId);
  }

  const pusherChannels = resolvePusherChannels(config.channels, userId);
  if (pusherChannels.length === 0) return;

  const now = new Date();
  const notifBase = {
    source: config.source,
    severity: config.severity,
    title,
    description,
    eventId: event.id,
    eventType: event.type,
    createdAt: now,
  };

  const rows = pusherChannels.map((channel) => ({
    ...notifBase,
    channel,
    userId: channel.startsWith("private-notifications-user-")
      ? channel.replace("private-notifications-user-", "")
      : null,
  }));

  try {
    await prisma.notification.createMany({ data: rows });
  } catch (err) {
    console.error(
      `[notifications] Error persisting notifications for ${event.type}: ${err instanceof Error ? err.message : err}`,
    );
  }

  const pusherPayload = {
    id: rows[0]?.channel ? `${event.id}:${rows[0].channel}` : event.id,
    source: config.source,
    severity: config.severity,
    title,
    description,
    timestamp: now.toISOString(),
    read: false,
    eventId: event.id,
    eventType: event.type,
  };

  try {
    const { getPusherServer } = await import("@/lib/pusher/server");
    const pusher = getPusherServer();

    // Pusher limits trigger to max 10 channels per call
    const batches: string[][] = [];
    for (let i = 0; i < pusherChannels.length; i += 10) {
      batches.push(pusherChannels.slice(i, i + 10));
    }

    for (const batch of batches) {
      await pusher.trigger(batch, PUSHER_EVENT_NAME, pusherPayload);
    }
  } catch (err) {
    console.error(
      `[notifications] Error triggering Pusher for ${event.type}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Emits a management-only notification (DLQ alerts, system warnings).
 * Does not require an Event — used for system-level alerts.
 */
export async function emitManagementAlert(params: {
  source: string;
  severity: string;
  title: string;
  description: string;
}): Promise<void> {
  const now = new Date();

  try {
    await prisma.notification.create({
      data: {
        channel: PUSHER_CHANNEL_MANAGEMENT,
        source: params.source,
        severity: params.severity,
        title: params.title,
        description: params.description,
        createdAt: now,
      },
    });
  } catch (err) {
    console.error(
      `[notifications] Error persisting management alert: ${err instanceof Error ? err.message : err}`,
    );
  }

  try {
    const { getPusherServer } = await import("@/lib/pusher/server");
    const pusher = getPusherServer();

    await pusher.trigger(PUSHER_CHANNEL_MANAGEMENT, PUSHER_EVENT_NAME, {
      id: `mgmt:${Date.now()}`,
      source: params.source,
      severity: params.severity,
      title: params.title,
      description: params.description,
      timestamp: now.toISOString(),
      read: false,
    });
  } catch (err) {
    console.error(
      `[notifications] Error triggering management Pusher alert: ${err instanceof Error ? err.message : err}`,
    );
  }
}
