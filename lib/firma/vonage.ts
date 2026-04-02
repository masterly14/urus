import { Vonage } from "@vonage/server-sdk";
import { Channels } from "@vonage/messages";

function getVonageClient(): Vonage {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("VONAGE_API_KEY and VONAGE_API_SECRET are required");
  }
  return new Vonage({ apiKey, apiSecret });
}

export async function sendOtpSms(phone: string, code: string): Promise<string> {
  const vonage = getVonageClient();
  const from = process.env.VONAGE_SMS_FROM ?? "Urus";

  const { messageUUID } = await vonage.messages.send({
    messageType: "text",
    channel: Channels.SMS,
    text: `Tu código de verificación para firmar el documento es: ${code}. Válido por 5 minutos.`,
    to: phone,
    from,
  });

  console.log(`[vonage] OTP SMS enviado a ${phone.slice(0, -4)}****: messageUUID=${messageUUID}`);
  return messageUUID;
}
