import { describe, expect, it, vi } from "vitest";
import {
  evaluateRobots,
  fetchPortalRobots,
  parseRobotsTxt,
  robotsPatternMatches,
} from "../index";

describe("parseRobotsTxt", () => {
  it("captura disallow para User-Agent: *", () => {
    const policy = parseRobotsTxt(
      ["User-Agent: *", "Disallow: /admin/", "Allow: /admin/login"].join("\n"),
    );
    expect(policy.verified).toBe(true);
    expect(policy.rules).toHaveLength(2);
    expect(policy.rules[0]).toEqual({ directive: "disallow", pattern: "/admin/" });
    expect(policy.rules[1]).toEqual({ directive: "allow", pattern: "/admin/login" });
  });

  it("ignora reglas de otros user-agents distintos al solicitado", () => {
    const policy = parseRobotsTxt(
      [
        "User-Agent: Googlebot",
        "Disallow: /private/",
        "",
        "User-Agent: *",
        "Disallow: /tmp/",
      ].join("\n"),
      "TestBot/1.0",
    );
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0]?.pattern).toBe("/tmp/");
  });

  it("aplica regla cuando UA solicitado contiene el del grupo", () => {
    const policy = parseRobotsTxt(
      ["User-Agent: TestBot", "Disallow: /private/"].join("\n"),
      "Mozilla/5.0 TestBot/1.0",
    );
    expect(policy.rules[0]?.pattern).toBe("/private/");
  });

  it("ignora comentarios", () => {
    const policy = parseRobotsTxt(
      ["# comment", "User-Agent: *", "Disallow: /a # inline"].join("\n"),
    );
    expect(policy.rules[0]?.pattern).toBe("/a");
  });
});

describe("robotsPatternMatches", () => {
  it("trata `/` como prefijo de toda ruta", () => {
    expect(robotsPatternMatches("/", "/cualquier/cosa")).toBe(true);
  });

  it("soporta wildcards `*` y anclaje `$`", () => {
    expect(robotsPatternMatches("/api/*.json", "/api/foo.json")).toBe(true);
    expect(robotsPatternMatches("/api/*.json", "/api/foo.html")).toBe(false);
    expect(robotsPatternMatches("/api/$", "/api/")).toBe(true);
    expect(robotsPatternMatches("/api/$", "/api/extra")).toBe(false);
  });
});

describe("evaluateRobots", () => {
  it("permite por defecto si no hay match", () => {
    const policy = parseRobotsTxt("User-Agent: *\nDisallow: /admin/");
    const decision = evaluateRobots(policy, "https://x.com/public/page");
    expect(decision.allowed).toBe(true);
  });

  it("bloquea cuando coincide un disallow", () => {
    const policy = parseRobotsTxt("User-Agent: *\nDisallow: /admin/");
    const decision = evaluateRobots(policy, "https://x.com/admin/users");
    expect(decision.allowed).toBe(false);
    expect(decision.matchedDirective).toBe("disallow");
  });

  it("regla más específica (más larga) gana", () => {
    const policy = parseRobotsTxt(
      ["User-Agent: *", "Disallow: /a/", "Allow: /a/public/"].join("\n"),
    );
    expect(evaluateRobots(policy, "https://x.com/a/secret").allowed).toBe(false);
    expect(evaluateRobots(policy, "https://x.com/a/public/page").allowed).toBe(true);
  });

  it("políticas no verificadas se consideran permisivas", () => {
    const policy = { rules: [], verified: false };
    expect(evaluateRobots(policy, "https://x.com/").allowed).toBe(true);
  });
});

describe("fetchPortalRobots", () => {
  function buildResponse(args: { status?: number; ok?: boolean; body: string }): Response {
    return {
      ok: args.ok ?? (args.status ?? 200) < 400,
      status: args.status ?? 200,
      statusText: "OK",
      text: async () => args.body,
    } as unknown as Response;
  }

  it("descarga y parsea con UA y headers correctos", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ body: "User-Agent: *\nDisallow: /no/" }),
    ) as unknown as typeof fetch;
    const policy = await fetchPortalRobots({
      host: "example.com",
      userAgent: "TestBot/1.0",
      fetchImpl,
    });
    expect(policy.verified).toBe(true);
    expect(policy.rules[0]?.pattern).toBe("/no/");
    const [endpoint, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(endpoint).toBe("https://example.com/robots.txt");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("TestBot/1.0");
  });

  it("lanza error en HTTP no-OK por defecto", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ status: 500, ok: false, body: "" }),
    ) as unknown as typeof fetch;
    await expect(
      fetchPortalRobots({
        host: "example.com",
        userAgent: "x",
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("devuelve policy permisiva si allowUnverified=true y HTTP no-OK", async () => {
    const fetchImpl = vi.fn(async () =>
      buildResponse({ status: 500, ok: false, body: "" }),
    ) as unknown as typeof fetch;
    const policy = await fetchPortalRobots({
      host: "example.com",
      userAgent: "x",
      fetchImpl,
      allowUnverified: true,
    });
    expect(policy.verified).toBe(false);
    expect(policy.rules).toEqual([]);
  });

  it("devuelve policy permisiva si fetch lanza y allowUnverified=true", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("ENETUNREACH");
    }) as unknown as typeof fetch;
    const policy = await fetchPortalRobots({
      host: "example.com",
      userAgent: "x",
      fetchImpl,
      allowUnverified: true,
    });
    expect(policy.verified).toBe(false);
  });
});
