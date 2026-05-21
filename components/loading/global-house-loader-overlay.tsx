"use client";

import { HouseLoaderVisual } from "@/components/loading/house-loader-visual";

interface GlobalHouseLoaderOverlayProps {
  visible: boolean;
  message?: string | null;
}

const globalPhases = [
  "Sincronizando contexto de la plataforma",
  "Preparando el siguiente módulo",
  "Aplicando cambios y validaciones",
];

export function GlobalHouseLoaderOverlay({ visible, message }: GlobalHouseLoaderOverlayProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-background/20 backdrop-blur-[1px]" />
      <div className="absolute inset-0 opacity-90">
        <HouseLoaderVisual
          title="Cargando plataforma"
          subtitle={message ?? "Estamos preparando todo para ti."}
          phases={globalPhases}
          badgeLabel="Navegación"
          animatePhases
          houseOnly
        />
      </div>
    </div>
  );
}
