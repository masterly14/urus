const STATEFOX_HOUSING_LABELS: Record<string, string> = {
  flat: "Piso",
  house: "Casa",
  countryhouse: "Casa de campo",
  duplex: "Duplex",
  penthouse: "Atico",
  studio: "Estudio",
  loft: "Loft",
  garage: "Garaje",
  office: "Oficina",
  premises: "Local",
  land: "Terreno",
  building: "Edificio",
  storage: "Trastero",
  warehouse: "Nave",
  room: "Habitacion",
};

export function formatStatefoxHousingLabel(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return "";
  return STATEFOX_HOUSING_LABELS[normalized] ?? value!.trim();
}
