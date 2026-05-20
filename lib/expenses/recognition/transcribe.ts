import OpenAI, { toFile } from "openai";

function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY no está configurada");
  }
  return key;
}

export async function transcribeExpenseAudio(input: {
  buffer: Buffer;
  mimeType: string;
  fileName?: string | null;
}): Promise<string> {
  const openai = new OpenAI({ apiKey: getOpenAiApiKey() });
  const model = process.env.OPENAI_STT_MODEL?.trim() || "whisper-1";
  const fileName = input.fileName?.trim() || "whatsapp-expense-audio.ogg";
  const audioFile = await toFile(input.buffer, fileName, {
    type: input.mimeType || "audio/ogg",
  });

  const result = await openai.audio.transcriptions.create({
    file: audioFile,
    model,
    language: "es",
  });

  const text = typeof result === "string" ? result : result.text;
  return text.trim();
}
