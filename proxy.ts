import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth",
  "/api/invitations/validate",
  "/api/invitations/accept",
  "/api/whatsapp/webhook",
  "/api/cron",
  "/api/events",
  "/api/leads",
  "/api/referidos",
  "/api/workers",
  "/api/firma",
  "/api/seleccion",
  "/api/validar-seleccion",
  "/api/postventa",
  "/api/comerciales/activos",
  "/api/parte-visita/send",
  "/api/nota-encargo/recordatorio",
  "/api/nota-encargo/check-confirmacion",
  "/api/nota-encargo/formulario",
  "/api/nota-encargo/matching-check",
  "/api/admin/parte-visita/migrate-to-qstash",
  "/api/admin/nota-encargo/migrate-to-qstash",
  "/seleccion",
  "/validar-seleccion",
  "/firma",
  "/referidos",
  "/postventa",
  "/platform/postventa",
];

const AUTH_PAGES = ["/login", "/register"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
}

const STATIC_EXTENSIONS = /\.(ico|png|jpe?g|svg|webp|gif|css|js|woff2?|ttf|eot)$/i;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (STATIC_EXTENSIONS.test(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (AUTH_PAGES.some((p) => pathname.startsWith(p)) && sessionCookie) {
    return NextResponse.redirect(new URL("/platform", request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
