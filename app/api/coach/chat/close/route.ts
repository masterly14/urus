import { NextResponse } from "next/server";
import {
  getSessionFromRequest,
  forbidden,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { closeCoachChat } from "@/lib/coach/chat/service";

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (session.role !== "comercial" && session.role !== "ceo") return forbidden();

  await closeCoachChat(session.userId);
  return NextResponse.json({ ok: true });
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/coach/chat/close" },
  postHandler,
);
