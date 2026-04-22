import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const BodySchema = z.object({
  tags: z.array(z.string().min(1)).min(1).max(50),
});

/**
 * POST /api/cron/revalidate-cache
 *
 * Allows external workers (running outside the Next.js server) to trigger
 * cache invalidation by tag.  Protected by CRON_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const auth =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { tags } = parsed.data;
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }

  return NextResponse.json({ ok: true, revalidated: tags });
}
