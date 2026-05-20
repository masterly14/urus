import OpenAI from "openai";

function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY no está configurada");
  }
  return key;
}

function getOcrModel(): string {
  return process.env.OPENAI_EXPENSE_OCR_MODEL?.trim() || "gpt-4.1-mini";
}

export async function extractTextFromExpenseImage(input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const openai = new OpenAI({ apiKey: getOpenAiApiKey() });
  const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;
  const response = await openai.responses.create({
    model: getOcrModel(),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Extrae el texto completo de la imagen. Devuelve solo el texto leído, sin explicación.",
          },
          {
            type: "input_image",
            image_url: dataUrl,
            detail: "auto",
          },
        ],
      },
    ] as unknown as Record<string, unknown>[],
    max_output_tokens: 1200,
  });
  return (response.output_text || "").trim();
}

export async function extractTextFromExpensePdf(input: {
  buffer: Buffer;
  mimeType: string;
  filename?: string | null;
}): Promise<string> {
  const openai = new OpenAI({ apiKey: getOpenAiApiKey() });
  const fileData = `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;

  const response = await openai.responses.create({
    model: getOcrModel(),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Extrae el texto completo del PDF. Devuelve solo el texto leído, sin explicaciones.",
          },
          {
            type: "input_file",
            filename: input.filename || "factura.pdf",
            file_data: fileData,
          },
        ],
      },
    ] as unknown as Record<string, unknown>[],
    max_output_tokens: 1800,
  });

  return (response.output_text || "").trim();
}
