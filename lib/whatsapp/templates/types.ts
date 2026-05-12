import type { TemplateObject, TemplateParameter } from "@/lib/whatsapp/types";

export type WabaTemplateComponentType = "HEADER" | "BODY" | "FOOTER" | "BUTTONS";

export type WabaTemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
  flow_id?: string;
  flow_name?: string;
  navigate_screen?: string;
};

export type WabaTemplateComponent = {
  type: WabaTemplateComponentType | string;
  format?: string;
  text?: string;
  buttons?: WabaTemplateButton[];
  example?: Record<string, unknown>;
};

export type WabaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  components: WabaTemplateComponent[];
};

export type WabaTemplateCategory = "AUTHENTICATION" | "MARKETING" | "UTILITY";

export type WabaTemplateCreateInput = {
  name: string;
  language: string;
  category: WabaTemplateCategory | string;
  components: WabaTemplateComponent[];
  allow_category_change?: boolean;
};

export type WabaTemplateCreateResult = {
  id: string;
  status: string;
  category?: string;
};

export type SentTemplateButtonParameter = {
  type: "payload" | "text" | "action";
  payload?: string;
  text?: string;
  action?: Record<string, unknown>;
};

export type SentTemplateComponent = {
  type: "header" | "body" | "button" | string;
  sub_type?: string;
  index?: string;
  parameters?: Array<TemplateParameter | SentTemplateButtonParameter>;
};

export type SentTemplate = Omit<TemplateObject, "components"> & {
  components?: SentTemplateComponent[];
};

export type ConversationTemplateVariable = {
  component: "header" | "body" | "button";
  index: number;
  placeholder: string;
  value: string;
  parameterType: string;
  buttonIndex?: string;
};

export type ConversationTemplateRenderedButton = {
  index: string;
  type: string;
  text: string;
  url: string | null;
  payload: string | null;
  variables: ConversationTemplateVariable[];
};

export type ConversationTemplateRenderedComponent = {
  type: "header" | "body" | "footer" | "buttons";
  format: string | null;
  text: string | null;
  variables: ConversationTemplateVariable[];
  buttons?: ConversationTemplateRenderedButton[];
};

export type ConversationTemplateRender = {
  name: string;
  language: string;
  status: string | null;
  category: string | null;
  resolved: boolean;
  bodyText: string | null;
  previewText: string;
  components: ConversationTemplateRenderedComponent[];
  variables: ConversationTemplateVariable[];
};
