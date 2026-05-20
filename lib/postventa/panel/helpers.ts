import { PanelNotaDTO } from "./types";

export function docStatusBadge(status: string): "default" | "secondary" | "outline" {
  if (status === "SIGNED" || status === "APPROVED") return "default";
  if (status === "DRAFT") return "secondary";
  return "outline";
}

export function docKindLabel(kind: string): string {
  const map: Record<string, string> = {
    arras: "Contrato de Arras",
    oferta_firme: "Oferta en Firme",
    senal_compra: "Señal de Compra",
  };
  return map[kind] ?? kind;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const notaRoleLabel: Record<PanelNotaDTO["authorRole"], string> = {
  ceo: "CEO",
  admin: "Admin",
  comercial: "Comercial",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
