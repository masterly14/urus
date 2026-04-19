/**
 * POST /api/whatsapp/send
 *
 * Envía un mensaje de WhatsApp vía WhatsApp Cloud API (Meta).
 * Soporta mensajes de texto, plantillas aprobadas y mensajes interactivos.
 *
 * Body:
 * ```json
 * {
 *   "to": "34600000000",
 *   "type": "text" | "template" | "interactive",
 *   "text": { "body": "...", "preview_url": false },
 *   "template": { "name": "...", "language": { "code": "es_ES" }, "components": [...] },
 *   "interactive": { "type": "button", "body": { "text": "..." }, "action": { ... } }
 * }
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, isCeoOrAdmin, unauthorized, forbidden } from "@/lib/auth/session";
import { sendTextMessage, sendTemplateMessage, sendInteractiveMessage } from "@/lib/whatsapp";
import type { TemplateObject, InteractiveObject } from "@/lib/whatsapp";
import { withObservedRoute } from "@/lib/observability";

const SendBodySchema = z.discriminatedUnion("type", [
  z.object({
    to: z.string(),
    type: z.literal("text"),
    text: z.object({
      body: z.string(),
      preview_url: z.boolean().optional(),
    }),
  }),
  z.object({
    to: z.string(),
    type: z.literal("template"),
    template: z.any(),
  }),
  z.object({
    to: z.string(),
    type: z.literal("interactive"),
    interactive: z.any(),
  }),
]);

const postHandler = async (request: NextRequest) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido en el body" }, { status: 400 });
  }

  const parsed = SendBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Input inválido",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const body = parsed.data;

  try {
    let result;

    if (body.type === "text") {
      result = await sendTextMessage(body.to, body.text.body, {
        previewUrl: body.text.preview_url ?? false,
      });
    } else if (body.type === "template") {
      const template = body.template as TemplateObject;
      if (!template?.name) {
        return NextResponse.json({ error: "Campo obligatorio: template.name" }, { status: 400 });
      }
      result = await sendTemplateMessage(body.to, template);
    } else {
      const interactive = body.interactive as InteractiveObject;
      if (!interactive?.type) {
        return NextResponse.json(
          { error: "Campo obligatorio: interactive.type" },
          { status: 400 },
        );
      }
      result = await sendInteractiveMessage(body.to, interactive);
    }

    return NextResponse.json(
      {
        messageId: result.messages[0]?.id ?? null,
        waId: result.contacts[0]?.wa_id ?? null,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/whatsapp/send" }, postHandler);
