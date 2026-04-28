import { NextResponse } from "next/server";
import { isAllowedStatefoxImageUrl } from "@/lib/statefox/image-url";
import { getStatefoxImageExpiresAt, isExpiredStatefoxImageUrl } from "@/lib/statefox/image-expiry";

export const runtime = "nodejs";

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function logImageProxy(message: string, data: Record<string, unknown>, hypothesisId = "H3"): void {
  // #region agent log
  fetch("http://127.0.0.1:7478/ingest/3a86774c-7051-4ca6-b6e8-a92160972b21", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "bfe3e0" }, body: JSON.stringify({ sessionId: "bfe3e0", runId: "post-fix", hypothesisId, location: "app/api/statefox/image/route.ts:GET", message, data, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target || !isAllowedStatefoxImageUrl(target)) {
    logImageProxy("Statefox image proxy rejected URL", {
      hasTarget: Boolean(target),
      host: target ? hostOf(target) : null,
    });
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  if (isExpiredStatefoxImageUrl(target)) {
    logImageProxy("Statefox image proxy rejected expired URL", {
      host: hostOf(target),
      expiresAt: getStatefoxImageExpiresAt(target),
    });
    return NextResponse.json({ error: "Expired image URL" }, { status: 410 });
  }

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!response.ok || !contentType.startsWith("image/")) {
      logImageProxy("Statefox image proxy upstream failed", {
        host: hostOf(target),
        status: response.status,
        contentType,
      });
      return NextResponse.json({ error: "Image unavailable" }, { status: 502 });
    }

    logImageProxy("Statefox image proxy served image", {
      host: hostOf(target),
      status: response.status,
      contentType,
    });

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    logImageProxy("Statefox image proxy request failed", {
      host: hostOf(target),
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Image fetch failed" }, { status: 502 });
  }
}
