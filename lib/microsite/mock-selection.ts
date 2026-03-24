import type { MicrositeCuratedProperty } from "@/lib/microsite/selection";
import {
  DEMO_UI_ROUTE_SEGMENT,
  isDemoUiEnabled,
  isDemoUiRouteSegment,
} from "@/lib/microfrontends/demo-ui";

/** Token de URL reservado para vista previa sin Neon/Statefox. */
export const MICROSITE_MOCK_TOKEN = DEMO_UI_ROUTE_SEGMENT;

export function isMicrositeMockEnabled(): boolean {
  return isDemoUiEnabled();
}

export function isMicrositeMockToken(token: string): boolean {
  return isDemoUiRouteSegment(token);
}

export type MockSelectionViewModel = {
  token: string;
  demandId: string;
  demandNombre: string;
  createdAt: Date;
  properties: MicrositeCuratedProperty[];
};

/** Fichas de ejemplo: imágenes públicas (picsum), precios y extras variados. */
export function getMicrositeMockSelection(): MockSelectionViewModel {
  const createdAt = new Date("2026-03-15T10:30:00.000Z");

  const properties: MicrositeCuratedProperty[] = [
    {
      propertyId: "mock-sfx-001",
      title: "Piso · Salamanca · Madrid",
      link: "https://example.com/anuncio-1",
      price: 485_000,
      metersBuilt: 112,
      rooms: 3,
      baths: 2,
      address: "Calle de Prueba 12",
      city: "Madrid",
      zone: "Barrio de Salamanca",
      housing: "flat",
      images: [
        "https://picsum.photos/seed/urus-mock-1/800/600",
        "https://picsum.photos/seed/urus-mock-1b/800/600",
      ],
      extras: ["Terraza", "Ascensor", "Aire acondicionado", "Armarios empotrados"],
      advertiserType: "professional",
    },
    {
      propertyId: "mock-sfx-002",
      title: "Ático · Chamartín · Madrid",
      link: "https://example.com/anuncio-2",
      price: 620_000,
      metersBuilt: 95,
      rooms: 2,
      baths: 2,
      address: "Avenida Demo 45",
      city: "Madrid",
      zone: "Chamartín",
      housing: "penthouse",
      images: ["https://picsum.photos/seed/urus-mock-2/800/600"],
      extras: ["Terraza", "Balcón", "Garaje", "Piscina"],
      advertiserType: "private",
    },
    {
      propertyId: "mock-sfx-003",
      title: "Dúplex · Chamberí · Madrid",
      link: null,
      price: 395_000,
      metersBuilt: 128,
      rooms: 4,
      baths: 3,
      address: null,
      city: "Madrid",
      zone: "Chamberí",
      housing: "duplex",
      images: [
        "https://picsum.photos/seed/urus-mock-3/800/600",
        "https://picsum.photos/seed/urus-mock-3b/800/600",
      ],
      extras: ["Ascensor", "Calefacción: gas natural", "Estado: reformado"],
      advertiserType: "professional",
    },
  ];

  return {
    token: MICROSITE_MOCK_TOKEN,
    demandId: "DEM-MOCK-001",
    demandNombre: "María G. (vista demo)",
    createdAt,
    properties,
  };
}
