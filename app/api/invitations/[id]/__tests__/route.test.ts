import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const mockGetSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

import { DELETE } from "../route";

const TEST_PREFIX = `inv-delete-${Date.now()}`;

async function cleanup() {
  await prisma.invitation.deleteMany({
    where: { email: { startsWith: TEST_PREFIX } },
  });
}

async function createInvitation(opts: { used?: boolean; expired?: boolean } = {}) {
  const expiresAt = opts.expired
    ? new Date(Date.now() - 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);
  return prisma.invitation.create({
    data: {
      email: `${TEST_PREFIX}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      role: "comercial",
      token: `${TEST_PREFIX}-${Math.random().toString(36).slice(2, 12)}`,
      expiresAt,
      invitedBy: `${TEST_PREFIX}-user`,
      invitedName: "Invitado Test",
      invitedPhone: "34600111222",
      used: opts.used ?? false,
    },
  });
}

function makeRequest(id: string) {
  return new Request(`http://localhost/api/invitations/${id}`, { method: "DELETE" });
}

beforeEach(async () => {
  mockGetSession.mockResolvedValue({
    user: { id: `${TEST_PREFIX}-ceo`, role: "ceo", name: "CEO Test" },
  });
  await cleanup();
});

afterAll(cleanup);

describe("DELETE /api/invitations/[id]", () => {
  it("borra una invitación pendiente y devuelve 200", async () => {
    const inv = await createInvitation();

    const response = await DELETE(makeRequest(inv.id), {
      params: Promise.resolve({ id: inv.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe(inv.id);

    const refreshed = await prisma.invitation.findUnique({ where: { id: inv.id } });
    expect(refreshed).toBeNull();
  });

  it("también puede borrar invitaciones expiradas o ya utilizadas", async () => {
    const usada = await createInvitation({ used: true });
    const expirada = await createInvitation({ expired: true });

    for (const inv of [usada, expirada]) {
      const response = await DELETE(makeRequest(inv.id), {
        params: Promise.resolve({ id: inv.id }),
      });
      expect(response.status).toBe(200);
    }

    const survivors = await prisma.invitation.findMany({
      where: { id: { in: [usada.id, expirada.id] } },
    });
    expect(survivors).toHaveLength(0);
  });

  it("rechaza con 404 si la invitación no existe", async () => {
    const response = await DELETE(makeRequest("inexistente"), {
      params: Promise.resolve({ id: "inexistente" }),
    });
    expect(response.status).toBe(404);
  });

  it("rechaza con 401 si no hay sesión", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const inv = await createInvitation();

    const response = await DELETE(makeRequest(inv.id), {
      params: Promise.resolve({ id: inv.id }),
    });

    expect(response.status).toBe(401);

    const refreshed = await prisma.invitation.findUnique({ where: { id: inv.id } });
    expect(refreshed).not.toBeNull();
  });

  it("rechaza con 403 si el usuario es comercial", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: `${TEST_PREFIX}-comercial`, role: "comercial", name: "Comercial" },
    });
    const inv = await createInvitation();

    const response = await DELETE(makeRequest(inv.id), {
      params: Promise.resolve({ id: inv.id }),
    });

    expect(response.status).toBe(403);

    const refreshed = await prisma.invitation.findUnique({ where: { id: inv.id } });
    expect(refreshed).not.toBeNull();
  });
});
