import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSessionFromRequest,
  forbidden,
  unauthorized,
} from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { getCoachChat, sendCoachTurn } from "@/lib/coach/chat/service";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
});

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (session.role !== "comercial" && session.role !== "ceo") return forbidden();

  const chat = await getCoachChat(session.userId, session.comercialId);
  return NextResponse.json({ ok: true, data: chat });
};

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (session.role !== "comercial" && session.role !== "ceo") return forbidden();

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Body inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const chat = await sendCoachTurn(
      session.userId,
      session.comercialId,
      parsed.data.message,
    );
    return NextResponse.json({ ok: true, data: chat });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/coach/chat" },
  getHandler,
);

export const POST = withObservedRoute(
  { method: "POST", route: "/api/coach/chat" },
  postHandler,
);
