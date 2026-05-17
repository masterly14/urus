const HIDDEN_SOURCES = new Set<string>(["alert-system"]);

type NotificationVisibilityInput = {
  source: string | null | undefined;
};

/**
 * Decide if a notification should be visible in the user-facing panel.
 * Technical operational alerts stay in logs/ops flows, not in product UI.
 */
export function isUserFacingNotification(
  notification: NotificationVisibilityInput,
): boolean {
  if (!notification.source) return true;
  if (HIDDEN_SOURCES.has(notification.source)) {
    return false;
  }

  return true;
}
