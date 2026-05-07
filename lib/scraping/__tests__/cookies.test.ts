import { describe, expect, it } from "vitest";
import { parseCookieHeader, serializeCookies } from "../cookies";

describe("cookies", () => {
  it("serializa cookies para header HTTP", () => {
    expect(
      serializeCookies([
        { name: "datadome", value: "abc" },
        { name: "session", value: "123" },
      ]),
    ).toBe("datadome=abc; session=123");
  });

  it("parsea cookieHeader a cookies de Playwright", () => {
    expect(parseCookieHeader("datadome=abc; session=123", "https://www.idealista.com/")).toEqual([
      {
        name: "datadome",
        value: "abc",
        url: "https://www.idealista.com/",
        secure: true,
        sameSite: "Lax",
      },
      {
        name: "session",
        value: "123",
        url: "https://www.idealista.com/",
        secure: true,
        sameSite: "Lax",
      },
    ]);
  });
});
