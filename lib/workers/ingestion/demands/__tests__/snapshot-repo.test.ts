import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { InmovillaDemand } from "@/lib/inmovilla/api/types-demands";
import {
  loadPreviousDemandSnapshot,
  saveCurrentDemandSnapshot,
} from "../snapshot-repo";

const TEST_RUN_ID = `demand-snapshot-test-${Date.now()}`;
const tracked: string[] = [];

function id(suffix: string): string {
  const value = `${TEST_RUN_ID}-${suffix}`;
  tracked.push(value);
  return value;
}

function makeDemand(
  codigo: string,
  overrides: Partial<InmovillaDemand> = {},
): InmovillaDemand {
  return {
    codigo,
    ref: `REF-${codigo}`,
    nombre: "Demanda",
    estadoId: "20",
    estadoNombre: "Buscando",
    presupuestoMin: 120000,
    presupuestoMax: 220000,
    habitacionesMin: 2,
    tipos: "Piso",
    zonas: "Centro",
    fechaActualizacion: "2026-03-11 12:00:00",
    agente: "Agente",
    raw: {},
    ...overrides,
  };
}

beforeEach(async () => {
  if (tracked.length > 0) {
    await prisma.demandSnapshot.deleteMany({
      where: { codigo: { in: tracked } },
    });
  }
});

afterAll(async () => {
  if (tracked.length > 0) {
    await prisma.demandSnapshot.deleteMany({
      where: { codigo: { in: tracked } },
    });
  }
  await prisma.$disconnect();
});

describe("demand snapshot repo", () => {
  it("guarda y carga snapshots de demandas", async () => {
    const c1 = id("A");
    const c2 = id("B");
    await saveCurrentDemandSnapshot([makeDemand(c1), makeDemand(c2)]);

    const loaded = await loadPreviousDemandSnapshot();
    expect(loaded.has(c1)).toBe(true);
    expect(loaded.has(c2)).toBe(true);
  });
});
