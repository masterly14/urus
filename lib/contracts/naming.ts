/**
 * M8 — Naming canónico de borradores: `OP-2026-XXXX_<Tipo>_vN` (extensión .docx en generación).
 */

import type { ContractDocumentKind } from "@/types/contracts";

const KIND_STEM_SEGMENT: Record<ContractDocumentKind, string> = {
  arras: "Arras",
  senal_compra: "Senal",
  oferta_firme: "OfertaFirme",
  anexo_mobiliario: "AnexoMobiliario",
};

/** Regex: stem completo con sufijo _vN (operationId puede contener guiones, no espacios). */
const CANONICAL_STEM_RE =
  /^(.+)_(Arras|Senal|OfertaFirme|AnexoMobiliario)_v(\d+)$/;

export function buildContractVersionStem(
  operationId: string,
  documentKind: ContractDocumentKind,
  versionNumber: number,
): string {
  const op = operationId.trim();
  const mid = KIND_STEM_SEGMENT[documentKind];
  const n = Math.max(1, Math.floor(versionNumber));
  return `${op}_${mid}_v${n}`;
}

export interface ParsedContractVersionStem {
  operationId: string;
  documentKind: ContractDocumentKind;
  versionNumber: number;
}

/**
 * Si el string coincide con el stem canónico, devuelve sus partes; si no, null.
 */
export function parseContractVersionStem(
  stem: string | undefined,
): ParsedContractVersionStem | null {
  if (!stem?.trim()) return null;
  const m = CANONICAL_STEM_RE.exec(stem.trim());
  if (!m) return null;
  const [, operationId, segment, vStr] = m;
  const versionNumber = Number.parseInt(vStr, 10);
  if (!Number.isFinite(versionNumber) || versionNumber < 1) return null;
  const entry = Object.entries(KIND_STEM_SEGMENT).find(([, s]) => s === segment);
  if (!entry) return null;
  return {
    operationId,
    documentKind: entry[0] as ContractDocumentKind,
    versionNumber,
  };
}

export function isCanonicalContractVersionStem(value: string): boolean {
  return parseContractVersionStem(value) !== null;
}
