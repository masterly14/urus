import { prisma } from "@/lib/prisma";
import type { JobRecord } from "@/lib/job-queue/types";
import { normalizePhones } from "@/lib/market";
import type { HandlerResult } from "@/lib/workers/consumer/types";

interface ResolveAdvertiserPayload {
  listingId?: string;
}

interface ListingAdvertiserInput {
  id: string;
  city: string;
  advertiserType: string | null;
  advertiserName: string | null;
  phones: string[];
  advertiserId: string | null;
  lastSeenAt: Date;
}

function normalizeName(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

function canonicalName(raw: string | null): string | null {
  const normalized = normalizeName(raw);
  return normalized ? normalized.toLocaleLowerCase("es-ES") : null;
}

function isGenericDisplayName(raw: string | null): boolean {
  const value = canonicalName(raw);
  if (!value) return true;

  const asciiValue = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (
    asciiValue === "particular" ||
    asciiValue === "anunciante particular" ||
    asciiValue === "anunciante" ||
    asciiValue === "propietario"
  );
}

function resolveAdvertiserType(raw: string | null): string | null {
  const normalized = canonicalName(raw);
  if (normalized === "agency" || normalized === "particular") return normalized;
  return null;
}

async function linkListingToAdvertiser(
  listing: ListingAdvertiserInput,
  advertiserId: string,
): Promise<void> {
  if (listing.advertiserId === advertiserId) return;

  await prisma.marketListing.update({
    where: { id: listing.id },
    data: { advertiserId },
  });
}

function shouldUpdateLastSeen(current: Date, listingLastSeenAt: Date): boolean {
  return listingLastSeenAt.getTime() > current.getTime();
}

async function resolveByPhone(
  listing: ListingAdvertiserInput,
  phoneCanonical: string,
): Promise<"linked" | "noop"> {
  const listingName = normalizeName(listing.advertiserName);
  const listingType = resolveAdvertiserType(listing.advertiserType);

  let advertiser = await prisma.marketAdvertiser.findFirst({
    where: { phoneCanonical },
    select: {
      id: true,
      displayName: true,
      advertiserType: true,
      lastSeenAt: true,
    },
  });

  if (!advertiser) {
    try {
      advertiser = await prisma.marketAdvertiser.create({
        data: {
          phoneCanonical,
          displayName: listingName,
          advertiserType: listingType,
          lastSeenAt: listing.lastSeenAt,
        },
        select: {
          id: true,
          displayName: true,
          advertiserType: true,
          lastSeenAt: true,
        },
      });
    } catch (err) {
      // Dos handlers concurrentes pueden chocar en el unique parcial.
      if (!/Unique constraint|P2002/i.test(err instanceof Error ? err.message : String(err))) {
        throw err;
      }
      advertiser = await prisma.marketAdvertiser.findFirst({
        where: { phoneCanonical },
        select: {
          id: true,
          displayName: true,
          advertiserType: true,
          lastSeenAt: true,
        },
      });
    }
  }

  if (!advertiser) return "noop";

  const advertiserUpdate: Record<string, unknown> = {};
  if (listingName && isGenericDisplayName(advertiser.displayName)) {
    advertiserUpdate.displayName = listingName;
  }
  if (listingType && !advertiser.advertiserType) {
    advertiserUpdate.advertiserType = listingType;
  }
  if (shouldUpdateLastSeen(advertiser.lastSeenAt, listing.lastSeenAt)) {
    advertiserUpdate.lastSeenAt = listing.lastSeenAt;
  }

  if (Object.keys(advertiserUpdate).length > 0) {
    await prisma.marketAdvertiser.update({
      where: { id: advertiser.id },
      data: advertiserUpdate,
    });
  }

  await linkListingToAdvertiser(listing, advertiser.id);
  return "linked";
}

async function resolveAgencyWithoutPhone(
  listing: ListingAdvertiserInput,
): Promise<"linked" | "noop"> {
  if (resolveAdvertiserType(listing.advertiserType) !== "agency") return "noop";

  const normalizedName = normalizeName(listing.advertiserName);
  if (!normalizedName) return "noop";

  const existing = await prisma.marketAdvertiser.findFirst({
    where: {
      phoneCanonical: null,
      advertiserType: "agency",
      displayName: {
        equals: normalizedName,
        mode: "insensitive",
      },
      listings: {
        some: { city: listing.city },
      },
    },
    select: { id: true, lastSeenAt: true },
  });

  if (existing) {
    if (shouldUpdateLastSeen(existing.lastSeenAt, listing.lastSeenAt)) {
      await prisma.marketAdvertiser.update({
        where: { id: existing.id },
        data: { lastSeenAt: listing.lastSeenAt },
      });
    }
    await linkListingToAdvertiser(listing, existing.id);
    return "linked";
  }

  const created = await prisma.marketAdvertiser.create({
    data: {
      phoneCanonical: null,
      displayName: normalizedName,
      advertiserType: "agency",
      lastSeenAt: listing.lastSeenAt,
    },
    select: { id: true },
  });
  await linkListingToAdvertiser(listing, created.id);
  return "linked";
}

export async function handleMarketResolveAdvertiser(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = (job.payload ?? {}) as ResolveAdvertiserPayload;
  const listingId =
    typeof payload.listingId === "string" ? payload.listingId.trim() : "";

  if (!listingId) {
    return {
      success: false,
      error: "MARKET_RESOLVE_ADVERTISER requiere payload.listingId",
      permanent: true,
    };
  }

  const listing = await prisma.marketListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      city: true,
      advertiserType: true,
      advertiserName: true,
      phones: true,
      advertiserId: true,
      lastSeenAt: true,
    },
  });

  if (!listing) {
    return {
      success: false,
      error: `MarketListing ${listingId} no existe`,
      permanent: true,
    };
  }

  const normalizedPhones = normalizePhones(listing.phones ?? []);
  const phoneCanonical = normalizedPhones[0] ?? null;

  if (phoneCanonical) {
    await resolveByPhone(listing, phoneCanonical);
    return { success: true };
  }

  await resolveAgencyWithoutPhone(listing);
  return { success: true };
}
