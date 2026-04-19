import { Vonage } from "@vonage/server-sdk";
import { Channels } from "@vonage/messages";
import { getObservabilityContext } from "@/lib/observability/context";
import { createLogger } from "@/lib/observability/logger";
import { maskPhone } from "./mask-phone";

function getVonageClient(): Vonage {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("VONAGE_API_KEY and VONAGE_API_SECRET are required");
  }
  return new Vonage({ apiKey, apiSecret });
}

function vonageDebugLogger() {
  const ctx = getObservabilityContext();
  if (ctx) {
    return createLogger(ctx).child({ operation: `${ctx.operation} › vonage` });
  }
  return createLogger({
    scope: "api",
    source: "api",
    operation: "firma/vonage",
  });
}

/** Extrae status/cuerpo típicos de axios u otros clientes HTTP usados por el SDK. */
function upstreamHttpDetails(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== "object") {
    return { detail: String(err) };
  }
  const o = err as Record<string, unknown>;
  const out: Record<string, unknown> = {
    errorName: o.name,
    errorMessage: o.message,
  };
  const resp = o.response as Record<string, unknown> | undefined;
  if (resp && typeof resp === "object") {
    out.upstreamHttpStatus = resp.status;
    out.upstreamStatusText = resp.statusText;
    const data = resp.data;
    if (typeof data === "string") {
      out.upstreamBodyPreview = data.length > 800 ? `${data.slice(0, 800)}…` : data;
    } else if (data != null) {
      out.upstreamBody = data;
    }
  }
  if (typeof o.status === "number") out.httpStatus = o.status;
  if (typeof o.statusCode === "number") out.httpStatusCode = o.statusCode;
  const cfg = o.config as Record<string, unknown> | undefined;
  if (cfg?.url != null) out.requestUrl = String(cfg.url);
  const code = o.code;
  if (code != null) out.errorCode = code;
  return out;
}

export async function sendOtpSms(phone: string, code: string): Promise<string> {
  const log = vonageDebugLogger();
  const from = process.env.VONAGE_SMS_FROM ?? "Urus";
  const vonage = getVonageClient();
  const apiKey = process.env.VONAGE_API_KEY!;
  const apiSecret = process.env.VONAGE_API_SECRET!;

  log.info("Vonage Messages API: enviando SMS OTP", {
    channel: "sms",
    messageType: "text",
    toMasked: maskPhone(phone),
    from,
    apiKeyLen: apiKey.length,
    apiSecretLen: apiSecret.length,
    apiKeyPrefix: `${apiKey.slice(0, 4)}…`,
  });

  const started = Date.now();

  try {
    const { messageUUID } = await vonage.messages.send({
      messageType: "text",
      channel: Channels.SMS,
      text: `Tu código de verificación para firmar el documento es: ${code}. Válido por 5 minutos.`,
      to: phone,
      from,
    });

    log.info("Vonage Messages API: SMS aceptado", {
      messageUUID,
      toMasked: maskPhone(phone),
      durationMs: Date.now() - started,
    });
    return messageUUID;
  } catch (err) {
    const http = upstreamHttpDetails(err);
    log.error(
      "Vonage Messages API: rechazó el envío (revisar credenciales, saldo y permisos SMS/Messages)",
      err,
      {
        toMasked: maskPhone(phone),
        durationMs: Date.now() - started,
        ...http,
      },
    );
    throw err;
  }
}
