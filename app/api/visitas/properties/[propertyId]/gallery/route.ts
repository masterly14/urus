import { NextResponse } from "next/server";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { resolveVisitPropertyGalleryUrls } from "@/lib/visitas/property-gallery";

const getHandler = async (
  request: Request,
  context: { params: Promise<{ propertyId: string }> },
) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const { propertyId } = await context.params;
  const url = new URL(request.url);
  const propertySource = url.searchParams.get("source")?.trim() || "internal";
  const selectionId = url.searchParams.get("selectionId")?.trim() || null;

  const imageUrls = await resolveVisitPropertyGalleryUrls({
    propertyId: decodeURIComponent(propertyId),
    propertySource,
    selectionId,
  });

  return NextResponse.json({ ok: true, imageUrls });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/visitas/properties/[propertyId]/gallery" },
  getHandler,
);
