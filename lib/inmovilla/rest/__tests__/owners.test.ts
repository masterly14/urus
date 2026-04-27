import { describe, expect, it, vi } from "vitest";
import {
  getOwnerByPropertyCode,
  getOwnerByRef,
  mapOwnerToPropertyOwnerPatch,
} from "@/lib/inmovilla/rest/owners";
import type { InmovillaRestClient } from "@/lib/inmovilla/rest/client";

describe("owners REST helpers", () => {
  it("mapea propietario REST a patch de PropertyCurrent", () => {
    const syncedAt = new Date("2026-04-27T10:00:00.000Z");

    const patch = mapOwnerToPropertyOwnerPatch(
      {
        nombre: "Laura",
        apellidos: "Propietaria Demo",
        nif: "12345678A",
        telefono2: "600 111 222",
        prefijotel2: "34",
        calle: "Mayor",
        numero: "1",
        cp: "14001",
        localidad: "Córdoba",
        provincia: "Córdoba",
      },
      syncedAt,
    );

    expect(patch).toEqual({
      propietarioNombre: "Laura Propietaria Demo",
      propietarioDni: "12345678A",
      propietarioPhone: "34600111222",
      propietarioDomicilioFiscal: "Mayor, 1, 14001, Córdoba, Córdoba",
      propietarioRegisteredAt: syncedAt,
    });
  });

  it("no devuelve campos vacíos para evitar borrar datos existentes", () => {
    expect(mapOwnerToPropertyOwnerPatch({ cod_cli: 123 })).toEqual({});
  });

  it("consulta propietario por cod_ofer", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ cod_cli: 1, nombre: "Laura" }),
    } as unknown as InmovillaRestClient;

    const owner = await getOwnerByPropertyCode(client, "12345");

    expect(client.get).toHaveBeenCalledWith("/propietarios/", {
      cod_ofer: "12345",
    });
    expect(owner?.nombre).toBe("Laura");
  });

  it("consulta propietario por ref", async () => {
    const client = {
      get: vi.fn().mockResolvedValue([{ cod_cli: 1, nombre: "Laura" }]),
    } as unknown as InmovillaRestClient;

    const owner = await getOwnerByRef(client, "URUS09VFEDE");

    expect(client.get).toHaveBeenCalledWith("/propietarios/", {
      ref: "URUS09VFEDE",
    });
    expect(owner?.nombre).toBe("Laura");
  });
});
