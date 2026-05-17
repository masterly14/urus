import type { AppNotification } from "@/lib/mock-data/types";

const HIDDEN_SOURCES = new Set(["alert-system"]);

/**
 * Decide if a notification should be visible in the user-facing panel.
 * Technical operational alerts stay in logs/ops flows, not in product UI.
 */
export function isUserFacingNotification(notification: AppNotification): boolean {
  if (HIDDEN_SOURCES.has(notification.source)) {
    return false;
  }

  return true;
}
