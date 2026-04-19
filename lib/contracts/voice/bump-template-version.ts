/**
 * M8 — Sufijo de versión de plantilla tras revisión por voz (borrador v2, v3, …).
 * Alineado con el naming del plan (…_v1 → …_v2) sin romper IDs libres como `2025.03.m8-v1`.
 */

import { DEFAULT_CONTRACT_TEMPLATE_VERSION } from "@/types/contracts";

/**
 * Si hubo cambios aplicados, incrementa el sufijo `_vN` o añade `_v2`.
 * Si no hubo cambios, devuelve la versión actual sin modificar.
 */
export function bumpVoiceRevisionTemplateVersion(
  current: string | undefined,
  hadAppliedChanges: boolean,
): string {
  if (!hadAppliedChanges) {
    return (current?.trim() || DEFAULT_CONTRACT_TEMPLATE_VERSION) as string;
  }

  const base = current?.trim() || DEFAULT_CONTRACT_TEMPLATE_VERSION;

  const underscoreV = /^(.+)_v(\d+)$/.exec(base);
  if (underscoreV) {
    const next = Number.parseInt(underscoreV[2], 10) + 1;
    if (Number.isFinite(next) && next > 0) {
      return `${underscoreV[1]}_v${next}`;
    }
  }

  const hyphenV = /^(.*)-v(\d+)$/.exec(base);
  if (hyphenV) {
    const next = Number.parseInt(hyphenV[2], 10) + 1;
    if (Number.isFinite(next) && next > 0) {
      return `${hyphenV[1]}-v${next}`;
    }
  }

  return `${base}_v2`;
}
