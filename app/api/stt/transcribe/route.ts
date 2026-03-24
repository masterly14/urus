import OpenAI, { APIError, toFile } from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

  /** Alineado con Vercel Pro (ajusta en dashboard o vercel.json si usas otro máximo). */
export const maxDuration = 60;

/** Límite de audio de la API de transcripción de OpenAI (Whisper). */
const OPENAI_AUDIO_MAX_BYTES = 25 * 1024 * 1024;

const VERCEL_FUNCTION_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);

function maxAudioBytesForRuntime(): number {
  if (process.env.VERCEL) {
    return Math.min(OPENAI_AUDIO_MAX_BYTES, VERCEL_FUNCTION_BODY_LIMIT_BYTES);
  }
  return OPENAI_AUDIO_MAX_BYTES;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY no está configurada" },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo inválido: se esperaba multipart/form-data" },
      { status: 400 }
    );
  }

  const entry = formData.get("audio");
  if (!entry || typeof entry === "string") {
    return NextResponse.json(
      { error: "Falta el campo de archivo `audio`" },
      { status: 400 }
    );
  }

  if (!(entry instanceof File)) {
    return NextResponse.json(
      { error: "El campo `audio` debe ser un archivo" },
      { status: 400 }
    );
  }

  if (entry.size === 0) {
    return NextResponse.json(
      { error: "El archivo de audio está vacío" },
      { status: 400 }
    );
  }

  const maxAudioBytes = maxAudioBytesForRuntime();
  if (entry.size > maxAudioBytes) {
    return NextResponse.json(
      {
        error: `El audio supera el tamaño máximo permitido (${maxAudioBytes / (1024 * 1024)} MB)`,
      },
      { status: 413 }
    );
  }

  const languageRaw = formData.get("language");
  const language =
    typeof languageRaw === "string" && languageRaw.length > 0
      ? languageRaw
      : undefined;

  const model =
    process.env.OPENAI_STT_MODEL?.trim() || "whisper-1";

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const buffer = Buffer.from(await entry.arrayBuffer());
    const file = await toFile(buffer, entry.name || "audio.webm", {
      type: entry.type || undefined,
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model,
      ...(language ? { language } : {}),
    });

    const text =
      typeof transcription === "string"
        ? transcription
        : transcription.text;

    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof APIError) {
      console.error("OpenAI STT:", error.status, error.message);
      return NextResponse.json(
        { error: error.message },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
      );
    }
    console.error("Error en /api/stt/transcribe:", error);
    return NextResponse.json(
      { error: "Error al transcribir el audio" },
      { status: 500 }
    );
  }
}
