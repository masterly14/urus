import { describe, it, expect } from "vitest";
import { isCeoOrAdmin, unauthorized, forbidden, type AppRole } from "@/lib/auth/session";

describe("isCeoOrAdmin", () => {
  it("returns true for ceo", () => {
    expect(isCeoOrAdmin("ceo")).toBe(true);
  });

  it("returns true for admin", () => {
    expect(isCeoOrAdmin("admin")).toBe(true);
  });

  it("returns false for comercial", () => {
    expect(isCeoOrAdmin("comercial")).toBe(false);
  });

  it("returns false for unknown roles", () => {
    expect(isCeoOrAdmin("unknown" as AppRole)).toBe(false);
  });
});

describe("unauthorized", () => {
  it("returns 401 response with JSON body", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("No autenticado");
  });
});

describe("forbidden", () => {
  it("returns 403 response with JSON body", async () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Sin permisos");
  });
});
