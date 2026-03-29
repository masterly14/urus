export interface SignaturitConfig {
  apiUrl: string;
  accessToken: string;
}

export interface SignaturitRecipient {
  name: string;
  email: string;
  phone?: string;
}

export interface CreateSignatureParams {
  file: Buffer;
  fileName: string;
  recipients: SignaturitRecipient[];
  eventsUrl?: string;
  /** Custom key-value pairs stored in the signature (used for correlation and filtering). */
  data?: Record<string, string>;
  deliveryType?: "email" | "sms" | "url";
  expireTime?: number;
  name?: string;
  signingMode?: "sequential" | "parallel";
}

export interface SignaturitDocumentFile {
  name: string;
  pages: number;
  size: number;
}

export interface SignaturitDocumentEvent {
  created_at: string;
  type: string;
}

export interface SignaturitDocument {
  id: string;
  email: string;
  name: string;
  status: SignaturitDocumentStatus;
  url?: string;
  events: SignaturitDocumentEvent[];
  file: SignaturitDocumentFile;
}

export interface SignaturitSignatureResponse {
  id: string;
  created_at: string;
  data: Record<string, string>;
  documents: SignaturitDocument[];
}

export type SignaturitDocumentStatus =
  | "in_queue"
  | "ready"
  | "signing"
  | "completed"
  | "expired"
  | "canceled"
  | "declined"
  | "error";

export interface SignaturitWebhookPayload {
  type: string;
  created_at: string;
  document: {
    id: string;
    email: string;
    name: string;
    status: SignaturitDocumentStatus;
    events: SignaturitDocumentEvent[];
    file: SignaturitDocumentFile;
  };
}

export type SignaturitWebhookEventType =
  | "email_processed"
  | "email_delivered"
  | "email_bounced"
  | "email_deferred"
  | "reminder_email_processed"
  | "reminder_email_delivered"
  | "sms_processed"
  | "sms_delivered"
  | "document_opened"
  | "document_signed"
  | "document_completed"
  | "audit_trail_completed"
  | "document_declined"
  | "document_expired"
  | "document_canceled"
  | "photo_added"
  | "voice_added"
  | "file_added"
  | "photo_id_added"
  | "expiration_extended";
