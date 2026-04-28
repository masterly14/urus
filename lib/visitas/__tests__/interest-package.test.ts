import { describe, expect, it } from "vitest";
import { buildVisitInterestPackageFromRows } from "../interest-package";

describe("buildVisitInterestPackageFromRows", () => {
  it("resuelve propiedades internas con propietario y referencia catastral", () => {
    const pkg = buildVisitInterestPackageFromRows({
      demand: {
        codigo: "DEM-1",
        nombre: "Comprador Test",
        telefono: "34600111222",
        comercialId: "com-1",
        leadStatus: "VISITA_PENDIENTE",
      },
      selection: {
        id: "sel-1",
        properties: [],
        feedbacks: [{ propertyId: "INM-1", createdAt: new Date("2026-04-28T10:00:00Z") }],
      },
      propertyCurrents: [
        {
          codigo: "INM-1",
          ref: "REF-1",
          refCatastral: "123ABC",
          titulo: "Piso centro",
          precio: 250000,
          metrosConstruidos: 90,
          habitaciones: 3,
          ciudad: "Córdoba",
          zona: "Centro",
          propietarioNombre: "Laura",
          propietarioPhone: "34666777888",
          portalUrl: "https://example.com/inm-1",
        },
      ],
    });

    expect(pkg.properties).toHaveLength(1);
    expect(pkg.properties[0]).toMatchObject({
      source: "internal",
      reference: "REF-1",
      cadastralReference: "123ABC",
      missingContactPhone: false,
    });
    expect(pkg.properties[0].contact.phones).toEqual(["34666777888"]);
  });

  it("resuelve propiedades externas desde JSON del microsite y marca faltantes", () => {
    const pkg = buildVisitInterestPackageFromRows({
      demand: {
        codigo: "DEM-1",
        nombre: "Comprador Test",
        telefono: "34600111222",
        comercialId: "com-1",
        leadStatus: "VISITA_PENDIENTE",
      },
      selection: {
        id: "sel-1",
        properties: [
          {
            propertyId: "sfx-1",
            title: "Ático externo",
            contactPhones: [],
            link: "https://portal.test/sfx-1",
            price: 320000,
            pricePerMeter: null,
            metersBuilt: 100,
            metersUsable: null,
            metersPlot: null,
            metersTerrace: null,
            rooms: 2,
            baths: 1,
            floor: null,
            orientation: null,
            address: "Calle Externa 1",
            city: "Córdoba",
            zone: "Centro",
            housing: "flat",
            latitude: null,
            longitude: null,
            images: [],
            extras: [],
            energyCertRating: null,
            energyCertValue: null,
            yearBuilt: null,
            condition: null,
            advertiserType: "professional",
            advertiserName: "Agencia Externa",
          },
        ],
        feedbacks: [{ propertyId: "sfx-1", createdAt: new Date("2026-04-28T10:00:00Z") }],
      },
      propertyCurrents: [],
    });

    expect(pkg.properties[0]).toMatchObject({
      source: "external",
      reference: "sfx-1",
      cadastralReference: null,
      missingContactPhone: true,
    });
    expect(pkg.properties[0].contact.kind).toBe("agencia");
  });
});
