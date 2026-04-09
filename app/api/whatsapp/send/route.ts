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
import { sendTextMessage, sendTemplateMessage, sendInteractiveMessage } from "@/lib/whatsapp";
import type { TemplateObject, InteractiveObject } from "@/lib/whatsapp";
import { withObservedRoute } from "@/lib/observability";


type SendBody =
  | { to: string; type: "text"; text: { body: string; preview_url?: boolean } }
  | { to: string; type: "template"; template: TemplateObject }
  | { to: string; type: "interactive"; interactive: InteractiveObject };

const postHandler = async (request: NextRequest): Promise<NextResponse> => {
  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido en el body" }, { status: 400 });
  }

  if (!body?.to) {
    return NextResponse.json({ error: "Campo obligatorio: to" }, { status: 400 });
  }
  if (!body?.type) {
    return NextResponse.json({ error: "Campo obligatorio: type (text|template|interactive)" }, { status: 400 });
  }

  try {
    let result;

    if (body.type === "text") {
      if (!body.text?.body) {
        return NextResponse.json({ error: "Campo obligatorio: text.body" }, { status: 400 });
      }
      result = await sendTextMessage(body.to, body.text.body, {
        previewUrl: body.text.preview_url ?? false,
      });
    } else if (body.type === "template") {
      if (!body.template?.name) {
        return NextResponse.json({ error: "Campo obligatorio: template.name" }, { status: 400 });
      }
      result = await sendTemplateMessage(body.to, body.template);
    } else if (body.type === "interactive") {
      if (!body.interactive?.type) {
        return NextResponse.json(
          { error: "Campo obligatorio: interactive.type" },
          { status: 400 },
        );
      }
      result = await sendInteractiveMessage(body.to, body.interactive);
    } else {
      return NextResponse.json(
        { error: "Tipo de mensaje no soportado. Usa: text | template | interactive" },
        { status: 400 },
      );
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
