import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized, isCeoOrAdmin } from "@/lib/auth/session";
import { getPusherServer } from "@/lib/pusher/server";

/**
 * POST /api/pusher/auth
 *
 * Pusher private channel authentication endpoint.
 * Validates session and enforces RBAC:
 *   - private-notifications-user-{userId}: only the owning user
 *   - private-notifications-org: any authenticated user
 *   - private-notifications-management: ceo or admin only
 */
export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id");
  const channelName = params.get("channel_name");

  if (!socketId || !channelName) {
    return NextResponse.json(
      { error: "Faltan socket_id o channel_name" },
      { status: 400 },
    );
  }

  if (channelName.startsWith("private-notifications-user-")) {
    const channelUserId = channelName.replace(
      "private-notifications-user-",
      "",
    );
    if (channelUserId !== session.userId) {
      return NextResponse.json(
        { error: "No puedes suscribirte a notificaciones de otro usuario" },
        { status: 403 },
      );
    }
  }

  if (
    channelName === "private-notifications-management" &&
    !isCeoOrAdmin(session.role)
  ) {
    return NextResponse.json(
      { error: "Canal restringido a CEO/Admin" },
      { status: 403 },
    );
  }

  const pusher = getPusherServer();
  const authResponse = pusher.authorizeChannel(socketId, channelName);

  return NextResponse.json(authResponse);
}
