import "dotenv/config";
import { createWabaTemplatesClient } from "@/lib/whatsapp/templates/meta-client";

const TEMPLATE_NAME = "follow_up_demanda";
const TEMPLATE_LANGUAGE = "es_ES";
const TEMPLATE_CATEGORY = "MARKETING" as const;

async function main(): Promise<void> {
  const client = createWabaTemplatesClient();

  const created = await client.createTemplate({
    name: TEMPLATE_NAME,
    language: TEMPLATE_LANGUAGE,
    category: TEMPLATE_CATEGORY,
    components: [
      {
        type: "BODY",
        text: "Hola {{1}}\n\nAyer tuviste una visita con la demanda asociada a *{{2}}*, en la propiedad *{{3}}*. No olvides hacerle seguimiento a la demanda, te dejo el número acá:\n\nNúmero de contacto: *{{4}}*\n\nMuchas gracias por tu trabajo 🤝",
        example: {
          body_text: [
            [
              "Santiago",
              "Pedro Rojas",
              "Calle Mayor 123, Córdoba",
              "+34600111222",
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
