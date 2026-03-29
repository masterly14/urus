export { createSignaturitClient } from "./client";
export type { SignaturitClient } from "./client";
export { handleSignaturitWebhookPost } from "./handle-webhook-post";
export {
  normalizeDocumentToPdf,
  inferSourceFileNameFromResponse,
  PdfNormalizationError,
} from "./pdf-normalization";
export {
  SIGNATURE_PENDING_STATUSES,
  SIGNATURE_TERMINAL_STATUSES,
  isSignatureTerminalStatus,
} from "./status";

export type {
  SignaturitConfig,
  SignaturitRecipient,
  CreateSignatureParams,
  SignaturitSignatureResponse,
  SignaturitDocument,
  SignaturitDocumentStatus,
  SignaturitWebhookPayload,
  SignaturitWebhookEventType,
} from "./types";
