import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { syncWhatsAppTemplates } from "@/lib/whatsapp/templates/sync";

async function main() {
  console.log("Sincronizando plantillas WhatsApp desde WABA -> Neon...");
  const result = await syncWhatsAppTemplates();
  console.log(
    `Sincronización completada. fetched=${result.fetched} upserted=${result.upserted} syncedAt=${result.syncedAt}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
