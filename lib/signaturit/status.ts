import type { SignatureRequestStatus } from "@prisma/client";

export const SIGNATURE_PENDING_STATUSES: SignatureRequestStatus[] = [
  "SENT",
  "OPENED",
  "SIGNED",
];

export const SIGNATURE_TERMINAL_STATUSES: SignatureRequestStatus[] = [
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "CANCELED",
];

export function isSignatureTerminalStatus(
  status: SignatureRequestStatus,
): boolean {
  return SIGNATURE_TERMINAL_STATUSES.includes(status);
}
