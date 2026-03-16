/**
 * WhatsApp Cloud API (Meta) — módulo de integración directa.
 * Sin BSP (Twilio/360dialog/MessageBird). Token de acceso + Phone Number ID.
 *
 * Envío:  sendTextMessage, sendTemplateMessage, sendInteractiveMessage, sendMatchNotification
 * Webhook: verifyWebhookChallenge, verifyWebhookSignature, parseWebhookPayload
 */

export { createWhatsAppClient } from "./client";
export type { WhatsAppClient } from "./client";

export {
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveMessage,
  sendMatchNotification,
} from "./send";

export {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  parseWebhookPayload,
} from "./webhook";
export type {
  ParsedWebhookEvent,
  ParsedWebhookMessage,
  ParsedWebhookStatus,
  ParsedWebhookUnknown,
  WebhookVerifyParams,
} from "./webhook";

export type {
  META_API_VERSION,
  WhatsAppClientConfig,
  SendMessagePayload,
  SendMessagePayloadText,
  SendMessagePayloadTemplate,
  SendMessagePayloadInteractive,
  SendMessageSuccess,
  MetaApiError,
  TemplateObject,
  TemplateComponent,
  TemplateParameter,
  TextObject,
  InteractiveObject,
  InteractiveButton,
  WhatsAppWebhookPayload,
  WhatsAppWebhookMessage,
  WhatsAppWebhookTextMessage,
  WhatsAppWebhookInteractiveMessage,
  WhatsAppWebhookButtonMessage,
  WhatsAppWebhookStatus,
  WhatsAppWebhookValue,
} from "./types";
