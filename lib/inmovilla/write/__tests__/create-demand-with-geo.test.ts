/**
 * Test del Egestion Worker: creación de demanda vía RPA legacy con datos de geolocalización.
 *
 * Basado en plan.md Día 3 (18:00–19:30): "Crear demanda vía RPA legacy con polígono válido
 * (usando lib/geo/) y verificar que aparece con zona definida en Inmovilla."
 *
 * - Tests de integración: payload construido con buildCreateDemandPayload contiene campos geo
 *   y el operation-registry los pasa al body de guardar.php.
 * - Test E2E (opcional): ejecuta writeToInmovilla con payload con geo; se salta si no hay
 *   credenciales legacy (INMOVILLA_USER, etc.).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { buildCreateDemandPayload } from "@/lib/geo";
import { writeOperationRegistry } from "../operation-registry";
import { writeToInmovilla } from "../write-to-inmovilla";

const MOCK_SESSION = {
  l: "token-l",
  idPestanya: "210504_123",
  miid: "11636.210504.x.y_11636",
  idUsuario: "210504",
  numAgencia: "11636",
  cookies: [] as unknown[],
};

const GEO_FIELDS = [
  "selpoli-selpoli",
  "poli",
  "demandas-centrolatitud",
  "demandas-centroaltitud",
  "demandas-zoom",
  "demandas-porarea",
] as const;

function hasLegacyCredentials(): boolean {
  return Boolean(
    process.env.INMOVILLA_USER &&
      process.env.INMOVILLA_PASSWORD &&
      process.env.INMOVILLA_OFFICE_KEY &&
      process.env.INMOVILLA_CLIENT_EMAIL,
  );
}

describe("createDemand con geolocalización (lib/geo + Egestion)", () => {
  describe("buildCreateDemandPayload con zona y ciudad", () => {
    it("incluye polígono predefinido cuando se pasan zone y city", async () => {
      const { payload, geo } = await buildCreateDemandPayload({
        client: {
          nombre: "Test",
          apellidos: "Geo",
          email: "test-geo@example.com",
        },
        demand: {
          zone: "Centro",
          city: "Córdoba",
          precioMin: 80000,
          precioMax: 150000,
        },
        agent: { id: "210504" },
        options: { offlineOnly: true },
      });

      expect(geo.hasPolygon).toBe(true);
      expect(geo.source).toBe("predefined");

      for (const key of GEO_FIELDS) {
        expect(payload.body[key]).toBeDefined();
      }

      expect(payload.body["selpoli-selpoli"]).toMatch(/^;/);
      expect(payload.body["selpoli-selpoli"]).toContain("+");
      expect(payload.body["selpoli-selpoli"]).toBe(payload.body.poli);

      expect(payload.body["demandas-porarea"]).toBe("1");
      expect(Number(payload.body["demandas-centrolatitud"])).toBeGreaterThan(37);
      expect(Number(payload.body["demandas-centrolatitud"])).toBeLessThan(38);
      expect(Number(payload.body["demandas-centroaltitud"])).toBeGreaterThan(-5);
      expect(Number(payload.body["demandas-centroaltitud"])).toBeLessThan(-4);
    });

    it("incluye polígono para otra ciudad predefinida (Sevilla Triana)", async () => {
      const { payload, geo } = await buildCreateDemandPayload({
        client: { nombre: "A", apellidos: "B", email: "a@b.com" },
        demand: { zone: "Triana", city: "Sevilla", precioMin: 100000, precioMax: 200000 },
        agent: { id: "210504" },
        options: { offlineOnly: true },
      });

      expect(geo.hasPolygon).toBe(true);
      expect(payload.body["selpoli-selpoli"]).toMatch(/^;/);
      expect(Number(payload.body["demandas-centrolatitud"])).toBeGreaterThan(37.3);
      expect(Number(payload.body["demandas-centrolatitud"])).toBeLessThan(37.5);
    });

    it("devuelve campos geo vacíos cuando no hay zona resoluble (offlineOnly)", async () => {
      const { payload, geo } = await buildCreateDemandPayload({
        client: { nombre: "X", apellidos: "Y", email: "x@y.com" },
        demand: { zone: "PuebloInexistenteXYZ", city: "CiudadInexistente", precioMin: 50000 },
        agent: { id: "210504" },
        options: { offlineOnly: true },
      });

      expect(geo.hasPolygon).toBe(false);
      expect(geo.source).toBe("none");
      expect(payload.body["selpoli-selpoli"]).toBe("");
      expect(payload.body.poli).toBe("");
      expect(payload.body["demandas-porarea"]).toBe("1");
    });
  });

  describe("operation-registry: body de createDemand se envía a guardar.php", () => {
    it("mainStep de createDemand incluye el body con campos geo en la petición a guardar.php", async () => {
      const { payload } = await buildCreateDemandPayload({
        client: { nombre: "Test", apellidos: "Registry", email: "reg@test.com" },
        demand: { city: "Málaga", precioMin: 100000, precioMax: 180000 },
        agent: { id: "210504" },
        options: { offlineOnly: true },
      });

      const spec = writeOperationRegistry.createDemand;
      const step = await spec.mainStep({
        operation: "createDemand",
        session: MOCK_SESSION,
        payload,
      });

      expect(step.path).toContain("/new/app/guardar/guardar.php");
      expect(step.path).toContain("SoyNuevo=1");
      expect(step.body).toBeDefined();

      for (const key of GEO_FIELDS) {
        expect(step.body![key]).toBeDefined();
      }

      expect(step.body!["selpoli-selpoli"]).toMatch(/^;/);
      expect(step.body!["selpoli-selpoli"]).toBe(step.body!.poli);
      expect(step.body!["clientes-email"]).toBe("reg@test.com");
      expect(step.body!["demandas-ventadesde"]).toBe("100000");
      expect(step.body!["demandas-ventahasta"]).toBe("180000");
    });
  });
});

describe("E2E: writeToInmovilla createDemand con polígono (RPA legacy)", () => {
  const runE2E = hasLegacyCredentials();

  it.skipIf(!runE2E)(
    "crea una demanda en Inmovilla vía RPA legacy con polígono válido y devuelve demandId",
    { timeout: 120_000 },
    async () => {
      const email =
        process.env.INMOVILLA_CLIENT_EMAIL ||
        `test-geo-e2e-${Date.now()}@example.com`;

      const { payload } = await buildCreateDemandPayload({
        client: {
          nombre: process.env.INMOVILLA_CLIENT_NOMBRE ?? "Test",
          apellidos: process.env.INMOVILLA_CLIENT_APELLIDOS ?? "E2E Geo",
          email,
        },
        demand: {
          zone: "Centro",
          city: "Córdoba",
          precioMin: Number(process.env.INMOVILLA_VENTADESDE) || 80000,
          precioMax: Number(process.env.INMOVILLA_VENTAHASTA) || 150000,
        },
        agent: {
          id: process.env.INMOVILLA_AGENT_ID ?? "210504",
        },
        options: { offlineOnly: true },
      });

      expect(payload.body["selpoli-selpoli"]).toMatch(/^;/);

      const result = await writeToInmovilla("createDemand", payload, {
        headless: true,
        verify: true,
        retryOnSessionExpired: true,
      });

      expect(result.operation).toBe("createDemand");
      expect(result.success).toBe(true);
      expect(result.demandId).toBeDefined();
      expect(String(result.demandId).length).toBeGreaterThan(0);
    },
  );
});
