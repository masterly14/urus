/**
 * Llama a getPropertyCluster con el id que da 404 en la UI para ver
 * exactamente qué retorna.
 *
 * Uso: npx tsx scripts/diagnose-cluster-by-id.ts virtual:<listingId>
 *      npx tsx scripts/diagnose-cluster-by-id.ts <propertyId>
 */
import "dotenv/config";
import { getPropertyCluster } from "@/lib/market/properties";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Uso: npx tsx scripts/diagnose-cluster-by-id.ts <id>");
    process.exit(1);
  }
  console.log(`[diagnose] llamando getPropertyCluster("${id}")`);
  try {
    const cluster = await getPropertyCluster(id);
    if (!cluster) {
      console.log(`❌ getPropertyCluster devolvió null → la página renderiza notFound() (404)`);
      return;
    }
    console.log(`✅ cluster encontrado:`);
    console.log(JSON.stringify({
      id: cluster.id,
      clustered: cluster.clustered,
      city: cluster.city,
      addressApprox: cluster.addressApprox,
      portalsCount: cluster.portals?.length,
      portals: cluster.portals?.map((p) => ({ source: p.source, price: p.price, url: p.url })),
    }, null, 2));
  } catch (err) {
    console.error(`❌ Excepción: ${err instanceof Error ? err.message : err}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
  }
}

main()
  .catch((err) => {
    console.error("error:", err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });
