/**
 * Smoke: confirma que listOpportunityListings({ city: "cordoba" }) devuelve
 * tanto Fotocasa (city="cordoba") como Pisos.com (city="cordoba_capital").
 *
 * Uso: npx tsx scripts/smoke-city-filter.ts
 */
import "dotenv/config";
import { listOpportunityListings } from "@/lib/market/listings";

async function main(): Promise<void> {
  const result = await listOpportunityListings({ city: "cordoba", limit: 100 });
  const bySource: Record<string, number> = {};
  for (const item of result.items) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }
  console.log("totalEstimated:", result.meta.totalEstimated);
  console.log("items por source:", bySource);
  console.log("primer item de cada source:");
  const seen = new Set<string>();
  for (const item of result.items) {
    if (seen.has(item.source)) continue;
    seen.add(item.source);
    console.log(`- ${item.source}:`, {
      city: item.city,
      zone: item.zone,
      price: item.price,
      builtArea: item.builtArea,
      mainImageUrl: item.mainImageUrl?.slice(0, 60) + "...",
      addressApprox: item.addressApprox,
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });
