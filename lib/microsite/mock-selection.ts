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
      description:
        "Luminoso piso exterior de 112 m² en el corazón del Barrio de Salamanca. " +
        "Tres dormitorios amplios, dos baños completos, salón comedor de 30 m² con salida a terraza. " +
        "Cocina equipada, suelos de madera, calefacción central. Finca clásica con ascensor y portero físico. " +
        "Próximo a Retiro, Serrano y Velázquez.",
      link: "https://example.com/anuncio-1",
      price: 485_000,
      pricePerMeter: 4330,
      metersBuilt: 112,
      metersUsable: 98,
      metersPlot: null,
      metersTerrace: 8,
      rooms: 3,
      baths: 2,
      floor: "4ª planta",
      orientation: "Sur-Este",
      address: "Calle de Prueba 12, Madrid",
      city: "Madrid",
      zone: "Barrio de Salamanca",
      housing: "flat",
      latitude: 40.4260,
      longitude: -3.6830,
      images: [
        "https://picsum.photos/seed/urus-mock-1a/800/600",
        "https://picsum.photos/seed/urus-mock-1b/800/600",
        "https://picsum.photos/seed/urus-mock-1c/800/600",
        "https://picsum.photos/seed/urus-mock-1d/800/600",
        "https://picsum.photos/seed/urus-mock-1e/800/600",
      ],
      extras: ["Terraza", "Ascensor", "Aire acondicionado", "Armarios empotrados", "Calefacción: gas natural"],
      energyCertRating: "D",
      energyCertValue: "142 kWh/m² año",
      yearBuilt: "1975",
      condition: "Buen estado",
      advertiserType: "professional",
      advertiserName: "Engel & Völkers",
    },
    {
      propertyId: "mock-sfx-002",
      title: "Ático · Chamartín · Madrid",
      description:
        "Ático con terraza panorámica de 25 m² y vistas a la sierra. " +
        "Dos dormitorios en suite, cocina abierta al salón, domótica completa. " +
        "Piscina comunitaria, garaje doble incluido. Urbanización privada con seguridad 24h.",
      link: "https://example.com/anuncio-2",
      price: 620_000,
      pricePerMeter: 6526,
      metersBuilt: 95,
      metersUsable: 82,
      metersPlot: null,
      metersTerrace: 25,
      rooms: 2,
      baths: 2,
      floor: "Ático",
      orientation: "Norte-Oeste",
      address: "Avenida Demo 45, Madrid",
      city: "Madrid",
      zone: "Chamartín",
      housing: "penthouse",
      latitude: 40.4625,
      longitude: -3.6772,
      images: [
        "https://picsum.photos/seed/urus-mock-2a/800/600",
        "https://picsum.photos/seed/urus-mock-2b/800/600",
        "https://picsum.photos/seed/urus-mock-2c/800/600",
      ],
      extras: ["Terraza", "Balcón", "Garaje", "Piscina", "Aire acondicionado"],
      energyCertRating: "B",
      energyCertValue: "45 kWh/m² año",
      yearBuilt: "2019",
      condition: "Obra nueva",
      advertiserType: "private",
      advertiserName: null,
    },
    {
      propertyId: "mock-sfx-003",
      title: "Dúplex · Chamberí · Madrid",
      description:
        "Dúplex completamente reformado en Chamberí. Planta baja con salón de doble altura, " +
        "cocina industrial y aseo de cortesía. Planta alta con 4 dormitorios y 2 baños. " +
        "Materiales de primera calidad, suelos de roble. Barrio tranquilo con todos los servicios.",
      link: null,
      price: 395_000,
      pricePerMeter: 3086,
      metersBuilt: 128,
      metersUsable: 115,
      metersPlot: null,
      metersTerrace: null,
      rooms: 4,
      baths: 3,
      floor: "Bajo - 1ª planta",
      orientation: "Este",
      address: null,
      city: "Madrid",
      zone: "Chamberí",
      housing: "duplex",
      latitude: 40.4345,
      longitude: -3.7050,
      images: [
        "https://picsum.photos/seed/urus-mock-3a/800/600",
        "https://picsum.photos/seed/urus-mock-3b/800/600",
        "https://picsum.photos/seed/urus-mock-3c/800/600",
        "https://picsum.photos/seed/urus-mock-3d/800/600",
      ],
      extras: ["Ascensor", "Calefacción: gas natural", "Estado: reformado", "Armarios empotrados", "Chimenea"],
      energyCertRating: "C",
      energyCertValue: "89 kWh/m² año",
      yearBuilt: "2024",
      condition: "Reformado",
      advertiserType: "professional",
      advertiserName: "Keller Williams",
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
