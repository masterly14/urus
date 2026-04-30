export const MATCHING_PAUSED = true;

export const MATCHING_PAUSED_REASON =
  "Cruces pausados temporalmente mientras se mitiga la caducidad de imágenes de Statefox/portales externos.";

export function isMatchingPaused(): boolean {
  return MATCHING_PAUSED;
}
