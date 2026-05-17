import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized, isCeoOrAdmin, type AppRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isUserFacingNotification } from "@/lib/notifications/visibility";

const MAX_NOTIFICATIONS = 50;

function getAccessibleChannels(userId: string, role: AppRole): string[] {
  const channels = [
    "private-notifications-org",
    `private-notifications-user-${userId}`,
  ];

  if (isCeoOrAdmin(role)) {
    channels.push("private-notifications-management");
  }

  return channels;
}

/**
 * GET /api/notifications
 *
 * Returns the latest notifications for the authenticated user,
 * filtered by channels their role grants access to.
 */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const channels = getAccessibleChannels(session.userId, session.role);

  const notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { channel: { in: channels } },
        { userId: session.userId },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: MAX_NOTIFICATIONS,
  });

  const mapped = notifications.map((n) => ({
    id: n.id,
    source: n.source,
    severity: n.severity,
    title: n.title,
    description: n.description,
    timestamp: n.createdAt.toISOString(),
    read: n.read,
    eventId: n.eventId,
    eventType: n.eventType,
  }));

  return NextResponse.json({
    ok: true,
    notifications: mapped.filter(isUserFacingNotification),
  });
}

/**
 * PATCH /api/notifications
 *
 * Mark notifications as read.
 * Body: { ids: string[] } or { all: true }
 */
export async function PATCH(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json() as { ids?: string[]; all?: boolean };
  const channels = getAccessibleChannels(session.userId, session.role);

  if (body.all) {
    await prisma.notification.updateMany({
      where: {
        read: false,
        OR: [
          { channel: { in: channels } },
          { userId: session.userId },
        ],
      },
      data: { read: true },
    });

    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await prisma.notification.updateMany({
      where: {
        id: { in: body.ids },
        OR: [
          { channel: { in: channels } },
          { userId: session.userId },
        ],
      },
      data: { read: true },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { ok: false, error: "Se requiere 'ids' (string[]) o 'all: true'" },
    { status: 400 },
  );
}
