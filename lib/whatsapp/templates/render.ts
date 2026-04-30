import type {
  ConversationTemplateRender,
  ConversationTemplateRenderedButton,
  ConversationTemplateRenderedComponent,
  ConversationTemplateVariable,
  SentTemplate,
  SentTemplateComponent,
  WabaTemplateComponent,
} from "./types";

export type CachedWhatsAppTemplate = {
  name: string;
  language: string;
  status: string;
  category: string | null;
  components: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function templateLanguage(template: SentTemplate): string {
  return template.language?.code?.trim() || "desconocido";
}

function sentComponents(template: SentTemplate): SentTemplateComponent[] {
  return Array.isArray(template.components) ? template.components : [];
}

function wabaComponents(cached: CachedWhatsAppTemplate | null | undefined): WabaTemplateComponent[] {
  return Array.isArray(cached?.components)
    ? cached.components.filter((component): component is WabaTemplateComponent => {
        const c = asRecord(component);
        return typeof c.type === "string";
      })
    : [];
}

function sentComponentFor(
  template: SentTemplate,
  type: "header" | "body" | "button",
  buttonIndex?: string,
): SentTemplateComponent | null {
  return sentComponents(template).find((component) => {
    if (component.type !== type) return false;
    if (type !== "button") return true;
    return component.index === buttonIndex;
  }) ?? null;
}

function parameterValue(parameter: unknown): { value: string; parameterType: string } {
  const p = asRecord(parameter);
  const type = stringValue(p.type) ?? "unknown";
  if (type === "text") return { value: stringValue(p.text) ?? "", parameterType: type };
  if (type === "payload") return { value: stringValue(p.payload) ?? "", parameterType: type };

  const currency = asRecord(p.currency);
  if (type === "currency") {
    return {
      value: stringValue(currency.fallback_value) ?? "",
      parameterType: type,
    };
  }

  const image = asRecord(p.image);
  if (type === "image") {
    return {
      value: stringValue(image.link) ?? stringValue(image.id) ?? "[imagen]",
      parameterType: type,
    };
  }

  const document = asRecord(p.document);
  if (type === "document") {
    return {
      value:
        stringValue(document.filename)
        ?? stringValue(document.link)
        ?? stringValue(document.id)
        ?? "[documento]",
      parameterType: type,
    };
  }

  const action = p.action;
  if (type === "action") {
    return {
      value: action ? JSON.stringify(action) : "",
      parameterType: type,
    };
  }

  return { value: JSON.stringify(parameter), parameterType: type };
}

function variablesFor(
  component: SentTemplateComponent | null,
  target: "header" | "body" | "button",
): ConversationTemplateVariable[] {
  const params = Array.isArray(component?.parameters) ? component.parameters : [];
  return params.map((parameter, idx) => {
    const value = parameterValue(parameter);
    return {
      component: target,
      index: idx + 1,
      placeholder: `{{${idx + 1}}}`,
      value: value.value,
      parameterType: value.parameterType,
      ...(target === "button" ? { buttonIndex: component?.index ?? String(idx) } : {}),
    };
  });
}

function interpolate(
  text: string | null | undefined,
  variables: ConversationTemplateVariable[],
): string | null {
  if (!text) return null;
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, indexRaw: string) => {
    const index = Number.parseInt(indexRaw, 10);
    const variable = variables.find((item) => item.index === index);
    return variable?.value ?? match;
  });
}

function renderHeader(
  template: SentTemplate,
  component: WabaTemplateComponent,
): ConversationTemplateRenderedComponent {
  const sent = sentComponentFor(template, "header");
  const variables = variablesFor(sent, "header");
  const format = stringValue(component.format)?.toLowerCase() ?? null;
  const text = interpolate(component.text, variables)
    ?? (variables[0]?.value ? `[${format ?? "header"}: ${variables[0].value}]` : null);
  return {
    type: "header",
    format,
    text,
    variables,
  };
}

function renderBody(
  template: SentTemplate,
  component: WabaTemplateComponent,
): ConversationTemplateRenderedComponent {
  const sent = sentComponentFor(template, "body");
  const variables = variablesFor(sent, "body");
  return {
    type: "body",
    format: null,
    text: interpolate(component.text, variables),
    variables,
  };
}

function renderFooter(component: WabaTemplateComponent): ConversationTemplateRenderedComponent {
  return {
    type: "footer",
    format: null,
    text: component.text ?? null,
    variables: [],
  };
}

function renderButtons(
  template: SentTemplate,
  component: WabaTemplateComponent,
): ConversationTemplateRenderedComponent {
  const buttons = Array.isArray(component.buttons) ? component.buttons : [];
  const renderedButtons: ConversationTemplateRenderedButton[] = buttons.map((button, idx) => {
    const buttonIndex = String(idx);
    const sent = sentComponentFor(template, "button", buttonIndex);
    const variables = variablesFor(sent, "button");
    const url = interpolate(button.url, variables);
    return {
      index: buttonIndex,
      type: button.type ?? sent?.sub_type ?? "unknown",
      text: button.text ?? `Botón ${idx + 1}`,
      url,
      payload: variables.find((variable) => variable.parameterType === "payload")?.value ?? null,
      variables,
    };
  });

  return {
    type: "buttons",
    format: null,
    text: null,
    variables: renderedButtons.flatMap((button) => button.variables),
    buttons: renderedButtons,
  };
}

function fallbackVariables(template: SentTemplate): ConversationTemplateVariable[] {
  return sentComponents(template).flatMap((component) => {
    if (component.type === "header") return variablesFor(component, "header");
    if (component.type === "body") return variablesFor(component, "body");
    if (component.type === "button") return variablesFor(component, "button");
    return [];
  });
}

function fallbackRender(template: SentTemplate): ConversationTemplateRender {
  const variables = fallbackVariables(template);
  const values = variables.map((variable) => variable.value).filter(Boolean);
  const previewText = values.length > 0
    ? `Plantilla: ${template.name} (${values.join(" · ")})`
    : `Plantilla: ${template.name}`;

  return {
    name: template.name,
    language: templateLanguage(template),
    status: null,
    category: null,
    resolved: false,
    bodyText: null,
    previewText,
    components: [
      {
        type: "body",
        format: null,
        text: null,
        variables,
      },
    ],
    variables,
  };
}

export function renderWhatsAppTemplate(
  sentTemplateInput: unknown,
  cachedTemplate?: CachedWhatsAppTemplate | null,
): ConversationTemplateRender | null {
  const candidate = asRecord(sentTemplateInput);
  const name = stringValue(candidate.name);
  if (!name) return null;

  const sentTemplate = candidate as SentTemplate;
  const cachedComponents = wabaComponents(cachedTemplate);
  if (cachedComponents.length === 0) {
    return fallbackRender(sentTemplate);
  }

  const components: ConversationTemplateRenderedComponent[] = [];
  for (const component of cachedComponents) {
    const type = component.type.toUpperCase();
    if (type === "HEADER") components.push(renderHeader(sentTemplate, component));
    if (type === "BODY") components.push(renderBody(sentTemplate, component));
    if (type === "FOOTER") components.push(renderFooter(component));
    if (type === "BUTTONS") components.push(renderButtons(sentTemplate, component));
  }

  const variables = components.flatMap((component) => component.variables);
  const bodyText = components.find((component) => component.type === "body")?.text ?? null;
  const firstText = components.find((component) => component.text)?.text ?? null;

  return {
    name: sentTemplate.name,
    language: templateLanguage(sentTemplate),
    status: cachedTemplate?.status ?? null,
    category: cachedTemplate?.category ?? null,
    resolved: true,
    bodyText,
    previewText: bodyText ?? firstText ?? `Plantilla: ${sentTemplate.name}`,
    components,
    variables,
  };
}
