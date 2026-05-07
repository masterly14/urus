import { NextResponse } from "next/server";
import { z } from "zod";
import { withObservedRoute } from "@/lib/observability";
import { getSessionFromRequest, unauthorized } from "@/lib/auth/session";
import { getStatefoxImageCacheStatusByIds } from "@/lib/statefox/image-cache";

export const runtime = "nodejs";

const MAX_IDS_PER_REQUEST = 100;

const PostSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_IDS_PER_REQUEST),
});

function parseIdsFromUrl(request: Request): string[] | null {
  const url = new URL(request.url);
  const raw = url.searchParams.get("ids");
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) return null;
  if (ids.length > MAX_IDS_PER_REQUEST) return ids.slice(0, MAX_IDS_PER_REQUEST);
  return ids;
}

async function buildResponse(ids: string[]): Promise<Response> {
  const map = await getStatefoxImageCacheStatusByIds(ids);
  return NextResponse.json({
    items: ids.map((id) => map.get(id)),
    count: ids.length,
    timestamp: new Date().toISOString(),
  });
}

const getHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  const ids = parseIdsFromUrl(request);
  if (!ids) {
    return NextResponse.json(
      { error: "Falta query param 'ids' (lista separada por comas)" },
      { status: 400 },
    );
  }
  return buildResponse(ids);
};

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return buildResponse(parsed.data.ids);
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/statefox/image-cache/status" },
  getHandler,
);
export const POST = withObservedRoute(
  { method: "POST", route: "/api/statefox/image-cache/status" },
  postHandler,
);
