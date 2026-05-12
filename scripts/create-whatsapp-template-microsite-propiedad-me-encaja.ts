import "dotenv/config";
import { createWabaTemplatesClient } from "@/lib/whatsapp/templates/meta-client";

const TEMPLATE_NAME = "microsite_propiedad_me_encaja";
const TEMPLATE_LANGUAGE = "es_ES";
const TEMPLATE_CATEGORY = "UTILITY" as const;

async function main(): Promise<void> {
  const client = createWabaTemplatesClient();

  const created = await client.createTemplate({
    name: TEMPLATE_NAME,
    language: TEMPLATE_LANGUAGE,
    category: TEMPLATE_CATEGORY,
    components: [
      {
        type: "BODY",
        text:
          "Buena eleccion {{1}}.\n\n" +
          "Acabas de marcar *{{2}}* como una propiedad que te encaja. " +
          "Ya hemos asignado a un agente de Urus Capital Group para gestionar todo lo necesario y que puedas visitarla pronto. " +
          "Se pondra en contacto contigo en breve.",
        example: {
          body_text: [
            [
              "Pedro",
              "Piso luminoso en Av. Diagonal 123",
            ],
          ],
        },
      },
    ],
    allow_category_change: true,
  });

  console.log("Plantilla creada/solicitada en Meta:");
  console.log(
    JSON.stringify(
      {
        name: TEMPLATE_NAME,
        language: TEMPLATE_LANGUAGE,
        category: TEMPLATE_CATEGORY,
        result: created,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ERROR] ${message}`);
  process.exitCode = 1;
});
