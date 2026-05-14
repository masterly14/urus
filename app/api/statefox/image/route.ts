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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target || !isAllowedStatefoxImageUrl(target)) {
    console.warn(
      `[statefox:image-proxy] URL rechazada hasTarget=${Boolean(target)} host=${target ? hostOf(target) : null}`,
    );
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  if (isExpiredStatefoxImageUrl(target)) {
    console.warn(
      `[statefox:image-proxy] URL caducada host=${hostOf(target)} expiresAt=${getStatefoxImageExpiresAt(target)}`,
    );
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
      return NextResponse.json({ error: "Image unavailable" }, { status: 502 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    console.warn(
      `[statefox:image-proxy] fetch falló host=${hostOf(target)} error=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return NextResponse.json({ error: "Image fetch failed" }, { status: 502 });
  }
}
