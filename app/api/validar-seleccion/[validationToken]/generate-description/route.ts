import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import { withObservedRoute } from "@/lib/observability";

const bodySchema = z.object({
  propertyId: z.string().min(1),
});

function requireOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY no está configurada");
  }
  return key;
}

const postHandler = async (request: Request, context: { params: Promise<{ validationToken: string }> }) => {
  const { validationToken } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const selection = await prisma.micrositeSelection.findUnique({
    where: { validationToken },
    select: {
      status: true,
      properties: true,
      demandId: true,
      demandNombre: true,
    },
  });

  if (!selection) {
    return NextResponse.json({ error: "Selección no encontrada" }, { status: 404 });
  }

  if (selection.status !== "PENDING_VALIDATION") {
    return NextResponse.json(
      { error: "La selección ya no está pendiente de validación", status: selection.status },
      { status: 409 },
    );
  }

  const property = coerceMicrositeCuratedProperties(selection.properties as unknown).find(
    (p) => p.propertyId === parsed.data.propertyId,
  );
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada en la selección" }, { status: 404 });
  }

  let apiKey: string;
  try {
    apiKey = requireOpenAiApiKey();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OPENAI_API_KEY no está configurada" },
      { status: 503 },
    );
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  const cityZone = [property.city, property.zone].filter(Boolean).join(", ");
  const details = [
    typeof property.metersBuilt === "number" ? `${property.metersBuilt} m² construidos` : null,
    typeof property.rooms === "number" ? `${property.rooms} habitaciones` : null,
    typeof property.baths === "number" ? `${property.baths} baños` : null,
    property.housing ? `tipología: ${property.housing}` : null,
    typeof property.price === "number" ? `precio: ${property.price} EUR` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const existingDescription = property.description?.trim() || "Sin descripción previa";

  try {
    const response = await client.responses.create({
      model,
      max_output_tokens: 260,
      input: [
        {
          role: "system",
          content:
            "Eres redactor inmobiliario senior en España. Reescribe descripciones para maximizar engagement y claridad, con tono profesional-comercial. Evita exageraciones, claims no verificables y lenguaje vacío.",
        },
        {
          role: "user",
          content: [
            `Objetivo: generar una nueva descripción para anuncio inmobiliario.`,
            `Idioma: español natural (España).`,
            `Longitud: 90-140 palabras.`,
            `Incluye: propuesta de valor, contexto de ubicación, características clave y cierre con llamada a la acción sutil.`,
            `No inventes datos que no estén en la ficha.`,
            "",
            `Demanda: ${selection.demandId} (${selection.demandNombre || "sin nombre"})`,
            `Título propiedad: ${property.title}`,
            `Ubicación: ${cityZone || "no indicada"}`,
            `Ficha técnica: ${details || "no disponible"}`,
            `Descripción original: ${existingDescription}`,
          ].join("\n"),
        },
      ],
    });

    const generated = response.output_text?.trim();
    if (!generated) {
      return NextResponse.json(
        { error: "No se pudo generar descripción con IA" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      propertyId: property.propertyId,
      description: generated,
      model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/validar-seleccion/generate-description] ${message}`);
    return NextResponse.json({ error: "Error al generar descripción con IA" }, { status: 500 });
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/validar-seleccion/[validationToken]/generate-description" },
  postHandler,
);
