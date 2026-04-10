import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth",
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
  "/seleccion",
  "/validar-seleccion",
  "/firma",
  "/referidos",
  "/postventa",
  "/platform/postventa",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
}

const STATIC_EXTENSIONS = /\.(_next|favicon|.*\.(ico|png|jpg|jpeg|svg|css|js|woff2?|ttf))$/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (STATIC_EXTENSIONS.test(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

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
