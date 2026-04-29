import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/lib/auth/session";

const { propertyFindFirst } = vi.hoisted(() => ({
  propertyFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyCurrent: {
      findFirst: propertyFindFirst,
    },
  },
}));

import { canAccessPricingProperty } from "../access-control";

function session(overrides: Partial<AppSession>): AppSession {
  return {
    userId: "user-1",
    role: "comercial",
    comercialId: "COM-1",
    nombre: "Comercial",
    email: "comercial@example.com",
    ...overrides,
  };
}

describe("canAccessPricingProperty", () => {
  beforeEach(() => {
    propertyFindFirst.mockReset();
  });

  it("permite acceso global a CEO/admin sin consultar propiedad", async () => {
    await expect(canAccessPricingProperty(session({ role: "ceo", comercialId: null }), "PROP-1")).resolves.toBe(true);
    await expect(canAccessPricingProperty(session({ role: "admin", comercialId: null }), "PROP-1")).resolves.toBe(true);
    expect(propertyFindFirst).not.toHaveBeenCalled();
  });

  it("bloquea comerciales sin ficha vinculada", async () => {
    await expect(canAccessPricingProperty(session({ comercialId: null }), "PROP-1")).resolves.toBe(false);
    expect(propertyFindFirst).not.toHaveBeenCalled();
  });

  it("permite al comercial gestor acceder por codigo o referencia", async () => {
    propertyFindFirst.mockResolvedValueOnce({ comercialId: "COM-1" });

    await expect(canAccessPricingProperty(session({}), "PROP-1")).resolves.toBe(true);

    expect(propertyFindFirst).toHaveBeenCalledWith({
      where: { OR: [{ codigo: "PROP-1" }, { ref: "PROP-1" }] },
      select: { comercialId: true },
    });
  });

  it("bloquea propiedades de otro comercial", async () => {
    propertyFindFirst.mockResolvedValueOnce({ comercialId: "COM-2" });

    await expect(canAccessPricingProperty(session({}), "PROP-2")).resolves.toBe(false);
  });

  it("bloquea propiedades inexistentes", async () => {
    propertyFindFirst.mockResolvedValueOnce(null);

    await expect(canAccessPricingProperty(session({}), "PROP-404")).resolves.toBe(false);
  });
});
