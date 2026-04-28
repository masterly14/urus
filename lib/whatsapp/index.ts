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
  sendLeadAssignedToCommercial,
  sendFollowUpToCommercial,
  sendPostSaleMessage,
  sendReviewRequest,
  sendReviewReminder,
  sendReferralRequest,
  sendPricingReportToCommercial,
} from "./send";

export type {
  LeadAssignedParams,
  FollowUpParams,
  PostSaleMessageParams,
  ReviewRequestParams,
  ReviewReminderParams,
  ReferralRequestParams,
  PricingReportParams,
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

// --- Visit scheduling messages ---
export {
  sendVisitProposalToCommercial,
  sendBuyerRejectionToCommercial,
  sendBuyerPreferenceToCommercial,
  sendEscalationToCommercial,
  sendVisitConfirmedToCommercial,
  sendSlotProposalToBuyer,
  sendAskPreferenceToBuyer,
  sendVisitConfirmedToBuyer,
  sendEscalationToBuyer,
  sendVisitCancelledToBuyer,
  sendCollectDataRequest,
} from "./visit-messages";
export type {
  VisitProposalToCommercialData,
  BuyerRejectionToCommercialData,
  BuyerPreferenceToCommercialData,
  EscalationToCommercialData,
  VisitConfirmedToCommercialData,
  SlotProposalToBuyerData,
  AskPreferenceToBuyerData,
  VisitConfirmedToBuyerData,
  EscalationToBuyerData,
  VisitCancelledToBuyerData,
  CollectDataRequestData,
} from "./visit-messages";

export type {
  META_API_VERSION,
  WhatsAppClientConfig,
  SendMessagePayload,
  SendMessagePayloadText,
  SendMessagePayloadTemplate,
  SendMessagePayloadInteractive,
  SendMessagePayloadImage,
  SendMessageSuccess,
  MetaApiError,
  TemplateObject,
  TemplateComponent,
  TemplateParameter,
  TextObject,
  ImageObject,
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
