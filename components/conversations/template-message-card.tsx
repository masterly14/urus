"use client";

import type {
  ConversationTemplateRender,
  ConversationTemplateRenderedComponent,
  ConversationTemplateVariable,
} from "@/lib/whatsapp/templates/types";
import { Badge } from "@/components/ui/badge";

function VariablesList({ variables }: { variables: ConversationTemplateVariable[] }) {
  if (variables.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-border/70 bg-background/70">
      <div className="grid grid-cols-[64px_1fr] gap-x-2 border-b border-border/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Variable</span>
        <span>Valor enviado</span>
      </div>
      <div className="divide-y divide-border/50">
        {variables.map((variable) => (
          <div
            key={`${variable.component}-${variable.buttonIndex ?? "main"}-${variable.index}`}
            className="grid grid-cols-[64px_1fr] gap-x-2 px-2 py-1.5 text-[11px]"
          >
            <span className="font-mono text-muted-foreground">{variable.placeholder}</span>
            <span className="whitespace-pre-wrap break-words text-foreground">
              {variable.value || "(vacío)"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComponentBlock({ component }: { component: ConversationTemplateRenderedComponent }) {
  if (component.type === "buttons") {
    return (
      <section className="rounded-lg border border-border/70 bg-muted/20 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Botones
        </p>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {(component.buttons ?? []).map((button) => (
            <div
              key={button.index}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  {button.type}
                </Badge>
                <span className="font-medium">{button.text}</span>
              </div>
              {button.url ? (
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {button.url}
                </p>
              ) : null}
              {button.payload ? (
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  payload: {button.payload}
                </p>
              ) : null}
              <VariablesList variables={button.variables} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border/70 bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {component.type}
        </p>
        {component.format ? (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            {component.format}
          </Badge>
        ) : null}
      </div>
      {component.text ? (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {component.text}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Sin texto renderizable para este componente.
        </p>
      )}
      <VariablesList variables={component.variables} />
    </section>
  );
}

export function TemplateMessageCard({ template }: { template: ConversationTemplateRender }) {
  return (
    <div className="min-w-[260px] space-y-2">
      <div className="rounded-lg border border-primary/20 bg-background/80 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="ai" className="h-5 px-2 text-[10px]">
            Plantilla WhatsApp
          </Badge>
          {template.resolved ? (
            <Badge variant="success" className="h-5 px-2 text-[10px]">
              Cacheada
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 px-2 text-[10px]">
              Sin caché
            </Badge>
          )}
        </div>
        <p className="mt-2 break-all font-mono text-xs font-semibold text-foreground">
          {template.name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Idioma: {template.language}
          {template.status ? ` · Estado: ${template.status}` : ""}
          {template.category ? ` · Categoría: ${template.category}` : ""}
        </p>
      </div>

      {template.components.map((component, index) => (
        <ComponentBlock key={`${component.type}-${index}`} component={component} />
      ))}
    </div>
  );
}
