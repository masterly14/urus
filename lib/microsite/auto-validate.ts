/**
 * Auto-validación de microsites con IA.
 *
 * Cuando el comercial tiene activado `autoValidateMicrosite`, este módulo:
 *
 *  1. Genera descripciones con IA para cada propiedad de la selección.
 *  2. Aplica rebranding: reemplaza referencias a otras agencias inmobiliarias
 *     por "Urus Capital Group" de forma coherente.
 *  3. Persiste las descripciones actualizadas en la selección.
 *  4. Marca la selección como APPROVED (auto-validada).
 *  5. Emite evento SELECCION_VALIDADA con source "auto_validation".
 *  6. Encola SEND_MICROSITE_TO_BUYER para enviar al comprador.
 *
 * El prompt de generación reutiliza la misma lógica de calidad que la ruta
 * manual `/api/validar-seleccion/[validationToken]/generate-description`,
 * pero añade la instrucción de rebranding.
 */

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import {
  coerceMicrositeCuratedProperties,
  type MicrositeCuratedProperty,
} from "./selection";
import type { JsonValue } from "@/lib/event-store/types";

const BRAND_NAME = process.env.AGENCY_NAME?.trim() || "Urus Capital Group";
const CONCURRENCY = 3;

interface AutoValidateResult {
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
    typeof property.metersBuilt === "number" ? `${property.metersBuilt} m² construidos` : null,
    typeof property.rooms === "number" ? `${property.rooms} habitaciones` : null,
    typeof property.baths === "number" ? `${property.baths} baños` : null,
    property.housing ? `tipología: ${property.housing}` : null,
    typeof property.price === "number" ? `precio: ${property.price} EUR` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const existingDescription = property.description?.trim() || "Sin descripción previa";

  return {
    system: [
      `Eres redactor inmobiliario senior en España, trabajando para ${BRAND_NAME}.`,
      "Reescribe descripciones para maximizar engagement y claridad, con tono profesional-comercial.",
      "Evita exageraciones, claims no verificables y lenguaje vacío.",
      "",
      "REGLA DE REBRANDING (obligatoria):",
      `- Si la descripción original menciona el nombre de CUALQUIER otra agencia inmobiliaria,`,
      `  portal, o marca que no sea "${BRAND_NAME}", reemplázala por "${BRAND_NAME}" de forma`,
      `  coherente con el contexto de la frase. Ejemplos: "Idealista Inmobiliaria" → "${BRAND_NAME}",`,
      `  "presentado por Solvia" → "presentado por ${BRAND_NAME}", "exclusiva Engel & Völkers" →`,
      `  "exclusiva ${BRAND_NAME}".`,
      "- Si no hay ninguna referencia a otra agencia, simplemente no añadas ninguna marca.",
      "- NUNCA dejes visible el nombre de otra agencia en la descripción final.",
      `- Si la descripción original ya usa "${BRAND_NAME}", mantenla tal cual.`,
    ].join("\n"),
    user: [
      "Objetivo: generar una nueva descripción para anuncio inmobiliario.",
      "Idioma: español natural (España).",
      "Longitud: 90-140 palabras.",
      "Incluye: propuesta de valor, contexto de ubicación, características clave y cierre con llamada a la acción sutil.",
      "No inventes datos que no estén en la ficha.",
      "",
      `Demanda: ${demandId} (${demandNombre || "sin nombre"})`,
      `Título propiedad: ${property.title}`,
      `Ubicación: ${cityZone || "no indicada"}`,
      `Ficha técnica: ${details || "no disponible"}`,
      `Descripción original: ${existingDescription}`,
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

    const text = response.output_text?.trim();
    return text || null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[auto-validate] Error generando descripción para ${property.propertyId}: ${msg}`,
    );
    return null;
  }
}

/**
 * Procesa un batch de propiedades con concurrencia limitada para respetar
 * rate limits de la API de OpenAI.
 */
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
      const prop = queue.shift()!;
      const desc = await generateDescriptionForProperty(
        client,
        model,
        prop,
        demandId,
        demandNombre,
      );
      if (desc) {
        results.set(prop.propertyId, desc);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, properties.length) }, () =>
    worker(),
  );
  await Promise.all(workers);

  return results;
}

export async function autoValidateMicrosite(selectionId: string): Promise<AutoValidateResult> {
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
    return { ok: false, selectionId, propertiesProcessed: 0, error: "Selección no encontrada" };
  }

  if (selection.status !== "PENDING_VALIDATION") {
    return {
      ok: false,
      selectionId,
      propertiesProcessed: 0,
      error: `Estado inesperado: ${selection.status}`,
    };
  }

  const properties = coerceMicrositeCuratedProperties(selection.properties as unknown);
  if (properties.length === 0) {
    return { ok: false, selectionId, propertiesProcessed: 0, error: "Sin propiedades en selección" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, selectionId, propertiesProcessed: 0, error: "OPENAI_API_KEY no configurada" };
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  console.log(
    `[auto-validate] selectionId=${selectionId} — generando descripciones para ${properties.length} propiedades`,
  );

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
      validatedAt: now,
      validatedByComercialId: "auto_validation",
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
    } as unknown as JsonValue,
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

  console.log(
    `[auto-validate] selectionId=${selectionId} — auto-validado con ${descriptions.size}/${properties.length} descripciones generadas → SEND_MICROSITE_TO_BUYER encolado`,
  );

  return {
    ok: true,
    selectionId,
    propertiesProcessed: descriptions.size,
  };
}
