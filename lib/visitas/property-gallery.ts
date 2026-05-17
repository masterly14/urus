import { prisma } from "@/lib/prisma";
import { buildInmovillaPhotoUrlsFromRaw } from "@/lib/inmovilla/rest/photo-url";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";

export type ResolveVisitPropertyGalleryInput = {
  propertyId: string;
  propertySource: string;
  selectionId: string | null;
};

export async function resolveVisitPropertyGalleryUrls(
  input: ResolveVisitPropertyGalleryInput,
): Promise<string[]> {
  const propertyId = input.propertyId.trim();
  if (!propertyId) return [];

  if (input.propertySource === "internal") {
    const snapshot = await prisma.propertySnapshot.findUnique({
      where: { codigo: propertyId },
      select: { raw: true, mainPhotoUrl: true },
    });
    if (snapshot) {
      const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
      const fromRaw = buildInmovillaPhotoUrlsFromRaw(raw, { size: "full", maxPhotos: 30 });
      if (fromRaw.length > 0) return fromRaw;
      if (snapshot.mainPhotoUrl) return [snapshot.mainPhotoUrl];
    }

    const current = await prisma.propertyCurrent.findUnique({
      where: { codigo: propertyId },
      select: { mainPhotoUrl: true },
    });
    return current?.mainPhotoUrl ? [current.mainPhotoUrl] : [];
  }

  if (input.selectionId) {
    const selection = await prisma.micrositeSelection.findUnique({
      where: { id: input.selectionId },
      select: { properties: true },
    });
    if (selection) {
      const curated = coerceMicrositeCuratedProperties(selection.properties);
      const match = curated.find((p) => p.propertyId === propertyId);
      if (match?.images?.length) {
        return match.images.filter((url) => typeof url === "string" && url.trim().length > 0);
      }
    }
  }

  return [];
}
