import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySigningToken } from "@/lib/firma/token";
import { withObservedRoute } from "@/lib/observability";

export const runtime = "nodejs";

/**
 * GET /api/firma/{token}/pdf
 * Proxy: descarga el PDF de Cloudinary y lo sirve con headers correctos
 * para que funcione en iframes de cualquier navegador (incluido móvil).
 */
const getHandler = async (
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;

  if (!verifySigningToken(token)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  const sigReq = await prisma.signatureRequest.findUnique({
    where: { signingToken: token },
    select: { cloudinaryUrl: true },
  });

  if (!sigReq?.cloudinaryUrl) {
    return NextResponse.json(
      { error: "Documento no encontrado" },
      { status: 404 },
    );
  }

  const upstream = await fetch(sigReq.cloudinaryUrl);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Error al obtener el documento (${upstream.status})` },
      { status: 502 },
    );
  }

  const buffer = await upstream.arrayBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, max-age=300",
    },
  });
};

export const GET = withObservedRoute(
  { method: "GET", route: "/api/firma/[token]/pdf" },
  getHandler,
);
