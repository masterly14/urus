import type { BrowserContext, Cookie } from "playwright";

type ContextCookie = Parameters<BrowserContext["addCookies"]>[0][number];

export function serializeCookies(cookies: Pick<Cookie, "name" | "value">[]): string | undefined {
  if (cookies.length === 0) return undefined;
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function parseCookieHeader(cookieHeader: string, url: string): ContextCookie[] {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      const name = separatorIndex >= 0 ? part.slice(0, separatorIndex).trim() : part;
      const value = separatorIndex >= 0 ? part.slice(separatorIndex + 1).trim() : "";
      return {
        name,
        value,
        url,
        secure: url.startsWith("https://"),
        sameSite: "Lax" as const,
      };
    })
    .filter((cookie) => cookie.name);
}
