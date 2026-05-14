/**
 * Verifica si un MarketListing existe en la DB activa.
 * Uso: npx tsx scripts/diagnose-listing-by-id.ts <listingId>
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Uso: npx tsx scripts/diagnose-listing-by-id.ts <listingId>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const listing = await prisma.marketListing.findUnique({
      where: { id },
      select: {
        id: true,
        source: true,
        status: true,
        propertyId: true,
        operation: true,
        housingType: true,
        price: true,
        builtArea: true,
        rooms: true,
        bathrooms: true,
        zone: true,
        addressApprox: true,
        canonicalUrl: true,
        advertiserType: true,
        advertiserName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!listing) {
      console.log(`❌ MarketListing id=${id} NO existe en la DB`);
      const candidates = await prisma.marketListing.findMany({
        where: { id: { startsWith: id.slice(0, 6) } },
        take: 3,
        select: { id: true, source: true, city: true, priceEur: true },
      });
      if (candidates.length > 0) {
        console.log(`Candidatos con prefijo similar:`);
        console.table(candidates);
      }
      return;
    }
    console.log(`✅ MarketListing existe:`);
    console.log(JSON.stringify(listing, null, 2));
    if (!listing.propertyId) {
      console.log(`(sin propertyId → URL correcta = /platform/market/properties/virtual:${listing.id})`);
    } else {
      console.log(`(clusterizado → URL = /platform/market/properties/${listing.propertyId})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
