import "dotenv/config";
import { createWabaTemplatesClient } from "@/lib/whatsapp/templates/meta-client";

const TEMPLATE_NAME = "microsite_listo_comprador";
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
          "Hola {{1}}, somos Urus Capital Group.\n\n" +
          "Hace tiempo trabajaste con nosotros y hemos preparado una seleccion de propiedades del mercado que encajan con lo que buscas.\n\n" +
          "Puedes verlas aqui: {{2}}\n\n" +
          "En cada ficha encontraras un boton para marcar las que te encajen, y un agente se pondra en contacto contigo. " +
          "Si prefieres ajustar la busqueda (zona, precio, metros...), respondenos por aqui y la afinamos.",
        example: {
          body_text: [
            [
              "Pedro",
              "https://app.uruscapitalgroup.com/seleccion/abc123",
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
