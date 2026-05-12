import "dotenv/config";
import { createWabaTemplatesClient } from "@/lib/whatsapp/templates/meta-client";

const TEMPLATE_NAME = "visita_contexto_propiedad";
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
          "Hola, somos Urus Capital Group. " +
          "Vemos que estas interesado en la propiedad {{1}}. " +
          "Puedes ver el detalle aqui: {{2}}. Gracias.",
        example: {
          body_text: [
            [
              "Piso en Santa Rosa, Cordoba",
              "https://www.idealista.com/inmueble/123456789/",
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
