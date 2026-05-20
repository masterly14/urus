import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { appendEvent } from "@/lib/event-store";
import type { JsonValue } from "@/lib/event-store/types";
import { enqueueJob } from "@/lib/job-queue";
import { prisma } from "@/lib/prisma";
import {
  coerceMicrositeCuratedProperties,
  type MicrositeCuratedProperty,
} from "@/lib/microsite/selection";

const BRAND_NAME = process.env.AGENCY_NAME?.trim() || "Urus Capital Group";
const CONCURRENCY = 3;

export interface ApproveMicrositeByAiResult {
  ok: boolean;
  selectionId: string;
  propertiesProcessed: number;
  error?: string;
}

function buildDescriptionPrompt(
  property: MicrositeCuratedProperty,
  demandId: string,
  demandNombre: string,
): { system: string; user: string } {
  const cityZone = [property.city, property.zone].filter(Boolean).join(", ");
  const details = [
    typeof property.metersBuilt === "number" ? `${property.metersBuilt} m2 construidos` : null,
    typeof property.rooms === "number" ? `${property.rooms} habitaciones` : null,
    typeof property.baths === "number" ? `${property.baths} banos` : null,
    property.housing ? `tipologia: ${property.housing}` : null,
    typeof property.price === "number" ? `precio: ${property.price} EUR` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const existingDescription = property.description?.trim() || "Sin descripcion previa";

  return {
    system: [
      `Eres redactor inmobiliario senior en Espana, trabajando para ${BRAND_NAME}.`,
      "Reescribe descripciones para maximizar engagement y claridad, con tono profesional-comercial.",
      "Evita exageraciones, claims no verificables y lenguaje vacio.",
      "",
      "REGLA DE REBRANDING (obligatoria):",
      `- Si la descripcion original menciona otra agencia inmobiliaria,`,
      `  portal, o marca que no sea "${BRAND_NAME}", reemplazala por "${BRAND_NAME}" de forma`,
      "  coherente con el contexto.",
      `- Si no hay referencias de terceros, no anadas marcas.`,
      `- Nunca dejes visible el nombre de otra agencia en la descripcion final.`,
    ].join("\n"),
    user: [
      "Objetivo: generar una nueva descripcion para anuncio inmobiliario.",
      "Idioma: espanol natural (Espana).",
      "Longitud: 90-140 palabras.",
      "Incluye: propuesta de valor, ubicacion, caracteristicas clave y cierre con llamada a la accion sutil.",
      "No inventes datos que no esten en la ficha.",
      "",
      `Demanda: ${demandId} (${demandNombre || "sin nombre"})`,
      `Titulo propiedad: ${property.title}`,
      `Ubicacion: ${cityZone || "no indicada"}`,
      `Ficha tecnica: ${details || "no disponible"}`,
      `Descripcion original: ${existingDescription}`,
    ].join("\n"),
  };
}

async function generateDescriptionForProperty(
  client: OpenAI,
  model: string,
  property: MicrositeCuratedProperty,
  demandId: string,
  demandNombre: string,
): Promise<string | null> {
  const { system, user } = buildDescriptionPrompt(property, demandId, demandNombre);
  try {
    const response = await client.responses.create({
      model,
      max_output_tokens: 260,
      input: [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ],
    });
    return response.output_text?.trim() || null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[approve-by-ai] Error generando descripcion ${property.propertyId}: ${msg}`);
    return null;
  }
}

async function generateAllDescriptions(
  client: OpenAI,
  model: string,
  properties: MicrositeCuratedProperty[],
  demandId: string,
  demandNombre: string,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const queue = [...properties];

  async function worker() {
    while (queue.length > 0) {
      const prop = queue.shift();
      if (!prop) break;
      const desc = await generateDescriptionForProperty(client, model, prop, demandId, demandNombre);
      if (desc) results.set(prop.propertyId, desc);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, properties.length) }, () => worker()),
  );
  return results;
}

export async function approveMicrositeByAI(selectionId: string): Promise<ApproveMicrositeByAiResult> {
  const selection = await prisma.micrositeSelection.findUnique({
    where: { id: selectionId },
    select: {
      id: true,
      status: true,
      demandId: true,
      demandNombre: true,
      comercialId: true,
      properties: true,
      token: true,
    },
  });

  if (!selection) {
    return { ok: false, selectionId, propertiesProcessed: 0, error: "Seleccion no encontrada" };
  }
  if (selection.status === "APPROVED") {
    return { ok: true, selectionId, propertiesProcessed: 0 };
  }

  const properties = coerceMicrositeCuratedProperties(selection.properties as unknown);
  if (properties.length === 0) {
    return { ok: false, selectionId, propertiesProcessed: 0, error: "Sin propiedades en seleccion" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, selectionId, propertiesProcessed: 0, error: "OPENAI_API_KEY no configurada" };
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });
  const descriptions = await generateAllDescriptions(
    client,
    model,
    properties,
    selection.demandId,
    selection.demandNombre,
  );

  const updatedProperties = properties.map((p) => ({
    ...p,
    description: descriptions.get(p.propertyId) ?? p.description,
  }));

  const now = new Date();
  await prisma.micrositeSelection.update({
    where: { id: selectionId },
    data: {
      properties: updatedProperties as unknown as Prisma.InputJsonValue,
      status: "APPROVED",
    },
  });

  const event = await appendEvent({
    type: "SELECCION_VALIDADA",
    aggregateType: "DEMAND",
    aggregateId: selection.demandId,
    payload: {
      selectionId: selection.id,
      token: selection.token,
      comercialId: selection.comercialId,
      propertyIds: properties.map((p) => p.propertyId),
      validatedAt: now.toISOString(),
      source: "auto_validation",
      descriptionsGenerated: descriptions.size,
    } as JsonValue,
  });

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    sourceEventId: event.id,
    idempotencyKey: `process_event:${event.id}`,
  });
  await enqueueJob({
    type: "SEND_MICROSITE_TO_BUYER",
    payload: { selectionId: selection.id },
    priority: 30,
    idempotencyKey: `send_microsite_buyer:${selection.id}`,
  });

  return {
    ok: true,
    selectionId,
    propertiesProcessed: descriptions.size,
  };
}
