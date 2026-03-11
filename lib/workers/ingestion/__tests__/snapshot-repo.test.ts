import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadPreviousSnapshot, saveCurrentSnapshot } from "../snapshot-repo";
import type { InmovillaProperty } from "@/lib/inmovilla/api/types";

const TEST_PREFIX = `snap-test-${Date.now()}`;

function makeProperty(
  codigo: string,
  overrides: Partial<InmovillaProperty> = {},
): InmovillaProperty {
  return {
    codigo,
    ref: `${TEST_PREFIX}-${codigo}`,
    titulo: "Test prop",
    tipoOfer: "Piso",
    precio: 100_000,
    metrosConstruidos: 50,
    habitaciones: 2,
    banyos: 1,
    ciudad: "Test",
    zona: "Test",
    estado: "Activo",
    fechaAlta: "2026-01-01 00:00:00",
    fechaActualizacion: "2026-03-01 00:00:00",
    numFotos: 5,
    agente: "Tester",
    raw: { test: true },
    ...overrides,
  };
}

const testCodigos: string[] = [];

function testCodigo(suffix: string): string {
  const id = `${TEST_PREFIX}-${suffix}`;
  testCodigos.push(id);
  return id;
}

beforeEach(async () => {
  if (testCodigos.length > 0) {
    await prisma.propertySnapshot.deleteMany({
      where: { codigo: { in: testCodigos } },
    });
  }
});

afterAll(async () => {
  if (testCodigos.length > 0) {
    await prisma.propertySnapshot.deleteMany({
      where: { codigo: { in: testCodigos } },
    });
  }
  await prisma.$disconnect();
});

describe("snapshot-repo", () => {
  it("debe guardar y cargar un snapshot de propiedades", async () => {
    const c1 = testCodigo("A");
    const c2 = testCodigo("B");

    await saveCurrentSnapshot([makeProperty(c1), makeProperty(c2)]);

    const loaded = await loadPreviousSnapshot();

    expect(loaded.has(c1)).toBe(true);
    expect(loaded.has(c2)).toBe(true);
    expect(loaded.get(c1)?.precio).toBe(100_000);
  });

  it("debe actualizar campos en upsert sin crear duplicados", async () => {
    const c = testCodigo("C");

    await saveCurrentSnapshot([makeProperty(c, { precio: 100_000 })]);
    await saveCurrentSnapshot([makeProperty(c, { precio: 150_000 })]);

    const rows = await prisma.propertySnapshot.findMany({
      where: { codigo: c },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].precio).toBe(150_000);
  });

  it("debe preservar firstSeenAt al actualizar", async () => {
    const c = testCodigo("D");
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-02-01T00:00:00Z");

    await saveCurrentSnapshot([makeProperty(c)], t1);
    await saveCurrentSnapshot([makeProperty(c, { precio: 200_000 })], t2);

    const row = await prisma.propertySnapshot.findUnique({
      where: { codigo: c },
    });
    expect(row?.firstSeenAt).toEqual(t1);
    expect(row?.lastSeenAt).toEqual(t2);
  });
});
