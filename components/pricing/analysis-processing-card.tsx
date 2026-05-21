"use client";

import { HouseLoaderVisual } from "@/components/loading/house-loader-visual";

const phases = [
  "Inicializando análisis de mercado",
  "Indexando propiedad de referencia",
  "Construyendo comparables de la zona",
  "Evaluando variables del entorno",
  "Consolidando resultados del modelo",
  "El análisis continúa en segundo plano",
];

export function AnalysisProcessingCard({ propertyCode }: { propertyCode: string }) {
  return (
    <HouseLoaderVisual
      title="Estamos preparando tu análisis"
      subtitle={`Propiedad ${propertyCode}`}
      badgeLabel="Background job"
      phases={phases}
    />
  );
}
