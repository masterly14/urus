import "dotenv/config";
import { createWabaTemplatesClient } from "@/lib/whatsapp/templates/meta-client";
import type { WabaTemplateComponent } from "@/lib/whatsapp/templates/types";

type TemplatePreset = "chat_escalado_comercial";

type CreateArgs = {
  name?: string;
  language?: string;
  category?: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  components?: WabaTemplateComponent[];
  preset?: TemplatePreset;
  allowCategoryChange: boolean;
};

type ResolvedCreateArgs = {
  name: string;
  language: string;
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  components: WabaTemplateComponent[];
  allowCategoryChange: boolean;
};

function readFlagValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Falta valor para ${flag}`);
  }
  return value;
}

function parseBodyExample(raw: string | null): string[] | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("--body-example debe ser JSON array de strings");
    }
    return parsed;
  }
  return trimmed.split("|").map((part) => part.trim()).filter(Boolean);
}

function parseComponents(raw: string): WabaTemplateComponent[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("--components-json debe ser un JSON array");
  }
  return parsed as WabaTemplateComponent[];
}

function usage(): string {
  return [
    "Uso:",
    "  npm run whatsapp:template:create -- --name <nombre> --category <MARKETING|UTILITY|AUTHENTICATION> [--language es_ES] (--components-json '[...]' | --body-text '...') [--body-example 'a|b|c'] [--allow-category-change]",
    "  npm run whatsapp:template:create -- --preset chat_escalado_comercial [--allow-category-change]",
    "",
    "Ejemplos:",
    "  npm run whatsapp:template:create -- --name follow_up_demanda --category MARKETING --language es_ES --body-text 'Hola {{1}}' --body-example '[\"Santiago\"]'",
    "  npm run whatsapp:template:create -- --name postventa_resena --category UTILITY --components-json '[{\"type\":\"BODY\",\"text\":\"Hola {{1}}\"}]'",
    "  npm run whatsapp:template:create -- --preset chat_escalado_comercial",
  ].join("\n");
}

function parseArgs(argv: string[]): CreateArgs {
  const args = argv.slice(2);
  const preset = readFlagValue(args, "--preset") as TemplatePreset | null;
  const name = readFlagValue(args, "--name");
  const categoryRaw = readFlagValue(args, "--category");
  const language = readFlagValue(args, "--language") ?? "es_ES";
  const bodyText = readFlagValue(args, "--body-text");
  const bodyExampleRaw = readFlagValue(args, "--body-example");
  const componentsRaw = readFlagValue(args, "--components-json");
  const allowCategoryChange = args.includes("--allow-category-change");

  if (preset && preset !== "chat_escalado_comercial") {
    throw new Error("preset inválido: usa chat_escalado_comercial");
  }

  if (preset) {
    return {
      preset,
      allowCategoryChange,
    };
  }

  if (!name || !categoryRaw) {
    throw new Error(`Debes enviar --name y --category, o usar --preset\n\n${usage()}`);
  }

  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error("name inválido: usa solo minúsculas, números y guiones bajos");
  }

  if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) {
    throw new Error("language inválido: usa formato es o es_ES");
  }

  const validCategories = ["AUTHENTICATION", "MARKETING", "UTILITY"] as const;
  if (!validCategories.includes(categoryRaw as (typeof validCategories)[number])) {
    throw new Error(`category inválido: usa ${validCategories.join(", ")}`);
  }
  const category = categoryRaw as CreateArgs["category"];

  const components = componentsRaw
    ? parseComponents(componentsRaw)
    : (() => {
      if (!bodyText) {
        throw new Error(`Debes enviar --components-json o --body-text\n\n${usage()}`);
      }
      const exampleValues = parseBodyExample(bodyExampleRaw);
      return [
        {
          type: "BODY",
          text: bodyText,
          ...(exampleValues ? { example: { body_text: [exampleValues] } } : {}),
        },
      ];
    })();

  if (components.length === 0) {
    throw new Error("components vacío: debe haber al menos un componente");
  }

  return {
    name,
    language,
    category,
    components,
    allowCategoryChange,
  };
}

function resolvePreset(preset: TemplatePreset): Omit<ResolvedCreateArgs, "allowCategoryChange"> {
  if (preset === "chat_escalado_comercial") {
    return {
      name: "chat_escalado_comercial",
      language: "es_ES",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text:
            "Hola {{1}} 👋\n\n" +
            "Te paso un escalado del chat para que lo tomes cuanto antes.\n\n" +
            "📝 *Resumen:* {{2}}\n" +
            "📞 *Numero de contacto:* {{3}}\n" +
            "ℹ️ *Info de contacto:* {{4}}\n\n" +
            "Gracias por tomarlo 🙌",
          example: {
            body_text: [
              [
                "Miguel",
                "El comprador pide hablar con una persona para resolver dudas de una propiedad.",
                "+34600111222",
                "Demanda DEM-2026-018 · Comprador Pedro Rojas · waId 34600111222",
              ],
            ],
          },
        },
      ],
    };
  }

  throw new Error("preset no soportado");
}

function resolveArgs(args: CreateArgs): ResolvedCreateArgs {
  if (args.preset) {
    const presetResolved = resolvePreset(args.preset);
    return {
      ...presetResolved,
      allowCategoryChange: true,
    };
  }

  if (!args.name || !args.language || !args.category || !args.components) {
    throw new Error("Argumentos incompletos para creación de plantilla");
  }
  return {
    name: args.name,
    language: args.language,
    category: args.category,
    components: args.components,
    allowCategoryChange: args.allowCategoryChange,
  };
}

async function main(): Promise<void> {
  const parsed = resolveArgs(parseArgs(process.argv));
  const client = createWabaTemplatesClient();

  const result = await client.createTemplate({
    name: parsed.name,
    language: parsed.language,
    category: parsed.category,
    components: parsed.components,
    allow_category_change: parsed.allowCategoryChange || undefined,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        request: {
          name: parsed.name,
          language: parsed.language,
          category: parsed.category,
          allow_category_change: parsed.allowCategoryChange,
          components: parsed.components,
        },
        result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ERROR] ${message}`);
  process.exitCode = 1;
});
