import type { EventType } from "@prisma/client";
import type { ConversationTemplateRender } from "@/lib/whatsapp/templates/types";

export type ConversationDirection = "inbound" | "outbound";

export type ConversationMessageKind =
  | "text"
  | "template"
  | "interactive"
  | "button"
  | "audio"
  | "image"
  | "document"
  | "unknown";

export interface ConversationMessage {
  id: string;
  eventId: string;
  position: string;
  waId: string;
  direction: ConversationDirection;
  type: EventType;
  kind: ConversationMessageKind;
  text: string;
  occurredAt: string;
  createdAt: string;
  source: string | null;
  messageId: string | null;
  templateRender?: ConversationTemplateRender | null;
  correlationId: string | null;
  causationId: string | null;
  metadata: unknown;
  rawPayload: unknown;
}

export interface ConversationSummary {
  waId: string;
  displayName: string | null;
  ownerName: string | null;
  relationLabel: string;
  demandId: string | null;
  demandName: string | null;
  demandPhone: string | null;
  demandAgent: string | null;
  selectionId: string | null;
  selectionName: string | null;
  propertyCode: string | null;
  commercialName: string | null;
  conversationPhase: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastDirection: ConversationDirection;
  messageCount: number;
  inboundCount: number;
  outboundCount: number;
  hasAgentMessages: boolean;
}

export interface ConversationDemandContext {
  id: string;
  name: string;
  phone: string | null;
  agent: string | null;
  leadStatus: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  zones: string | null;
  types: string | null;
}

export interface ConversationSentProperty {
  propertyId: string;
  title: string;
  firstImageUrl: string | null;
  price: number | null;
  metersBuilt: number | null;
  rooms: number | null;
  city: string | null;
  zone: string | null;
  link: string | null;
  extras: string[];
}

export interface ConversationSelectionContext {
  id: string;
  token: string;
  status: string;
  demandId: string;
  demandName: string | null;
  buyerPhone: string | null;
  createdAt: string;
  firstViewedAt: string | null;
  stockCount: number;
  properties: ConversationSentProperty[];
}

export interface ConversationContext {
  demand: ConversationDemandContext | null;
  selections: ConversationSelectionContext[];
}

export interface ConversationListResult {
  conversations: ConversationSummary[];
  nextCursor: string | null;
}

export interface ConversationDetailResult {
  waId: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  nextOffset: number | null;
}

