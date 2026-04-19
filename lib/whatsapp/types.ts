/**
 * Tipos de la WhatsApp Cloud API (Meta) — v20.0
 * Ref: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

export const META_API_VERSION = "v20.0";

// ---- Configuración del cliente ----

export type WhatsAppClientConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string;
  timeoutMs?: number;
};

// ---- Objetos de plantilla ----

export type TemplateLanguage = {
  code: string;
  policy?: "deterministic";
};

export type TemplateParameterText = { type: "text"; text: string };

export type TemplateParameterCurrency = {
  type: "currency";
  currency: { fallback_value: string; code: string; amount_1000: number };
};

export type TemplateParameterImage = {
  type: "image";
  image: { link?: string; id?: string };
};

export type TemplateParameterDocument = {
  type: "document";
  document: { link?: string; id?: string; filename?: string };
};

export type TemplateParameter =
  | TemplateParameterText
  | TemplateParameterCurrency
  | TemplateParameterImage
  | TemplateParameterDocument;

export type TemplateComponentBody = {
  type: "body";
  parameters?: TemplateParameter[];
};

export type TemplateComponentHeader = {
  type: "header";
  parameters?: TemplateParameter[];
};

export type TemplateComponentButton = {
  type: "button";
  sub_type: "quick_reply" | "url" | "flow";
  index: string;
  parameters: Array<{
    type: "payload" | "text" | "action";
    payload?: string;
    text?: string;
    action?: Record<string, unknown>;
  }>;
};

export type TemplateComponent =
  | TemplateComponentBody
  | TemplateComponentHeader
  | TemplateComponentButton;

export type TemplateObject = {
  name: string;
  language: TemplateLanguage;
  components?: TemplateComponent[];
};

// ---- Objetos de mensaje de texto ----

export type TextObject = {
  body: string;
  preview_url?: boolean;
};

// ---- Objetos de mensaje interactivo ----

export type InteractiveButton = {
  type: "reply";
  reply: { id: string; title: string };
};

export type InteractiveActionButtons = {
  buttons: InteractiveButton[];
};

export type InteractiveActionList = {
  button: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
};

export type InteractiveActionFlow = {
  name: "flow";
  parameters: {
    flow_message_version: string;
    flow_id?: string;
    flow_name?: string;
    flow_cta: string;
    flow_token?: string;
    flow_action?: "navigate" | "data_exchange";
    flow_action_payload?: {
      screen?: string;
      data?: string;
    };
    mode?: "draft" | "published";
  };
};

export type InteractiveObject = {
  type: "button" | "list" | "flow";
  header?: { type: "text"; text: string };
  body: { text: string };
  footer?: { text: string };
  action: InteractiveActionButtons | InteractiveActionList | InteractiveActionFlow;
};

// ---- Objeto de documento ----

export type DocumentObject = {
  link: string;
  filename?: string;
  caption?: string;
};

// ---- Payload de envío (discriminado por type) ----

export type SendMessagePayloadDocument = {
  to: string;
  type: "document";
  document: DocumentObject;
  context?: { message_id: string };
};

export type SendMessagePayloadText = {
  to: string;
  type: "text";
  text: TextObject;
  context?: { message_id: string };
};

export type SendMessagePayloadTemplate = {
  to: string;
  type: "template";
  template: TemplateObject;
  context?: { message_id: string };
};

export type SendMessagePayloadInteractive = {
  to: string;
  type: "interactive";
  interactive: InteractiveObject;
  context?: { message_id: string };
};

export type SendMessagePayload =
  | SendMessagePayloadText
  | SendMessagePayloadTemplate
  | SendMessagePayloadInteractive
  | SendMessagePayloadDocument;

// ---- Respuesta de envío ----

export type SendMessageSuccess = {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
};

export type MetaApiError = {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    error_data?: unknown;
    fbtrace_id?: string;
  };
};

// ---- Webhook entrante: mensajes recibidos ----

export type WhatsAppWebhookTextMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: "text";
  text: { body: string };
};

export type WhatsAppWebhookInteractiveMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: "interactive";
  interactive: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
};

export type WhatsAppWebhookButtonMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: "button";
  button: { payload: string; text: string };
};

export type WhatsAppWebhookImageMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: "image";
  image: { caption?: string; mime_type: string; sha256: string; id: string };
};

export type WhatsAppWebhookGenericMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
};

export type WhatsAppWebhookMessage =
  | WhatsAppWebhookTextMessage
  | WhatsAppWebhookInteractiveMessage
  | WhatsAppWebhookButtonMessage
  | WhatsAppWebhookImageMessage
  | WhatsAppWebhookGenericMessage;

// ---- Webhook entrante: actualizaciones de estado ----

export type WhatsAppWebhookStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; details?: string }>;
};

// ---- Estructura del payload del webhook ----

export type WhatsAppWebhookValue = {
  messaging_product: "whatsapp";
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: WhatsAppWebhookMessage[];
  statuses?: WhatsAppWebhookStatus[];
};

export type WhatsAppWebhookChange = {
  value: WhatsAppWebhookValue;
  field: "messages";
};

export type WhatsAppWebhookEntry = {
  id: string;
  changes: WhatsAppWebhookChange[];
};

export type WhatsAppWebhookPayload = {
  object: "whatsapp_business_account";
  entry: WhatsAppWebhookEntry[];
};
