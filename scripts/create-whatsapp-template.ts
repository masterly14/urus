import "dotenv/config";
import { createWabaTemplatesClient } from "@/lib/whatsapp/templates/meta-client";
import type { WabaTemplateComponent } from "@/lib/whatsapp/templates/types";

type CreateArgs = {
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
    "",
    "Ejemplos:",
    "  npm run whatsapp:template:create -- --name follow_up_demanda --category MARKETING --language es_ES --body-text 'Hola {{1}}' --body-example '[\"Santiago\"]'",
    "  npm run whatsapp:template:create -- --name postventa_resena --category UTILITY --components-json '[{\"type\":\"BODY\",\"text\":\"Hola {{1}}\"}]'",
  ].join("\n");
}

function parseArgs(argv: string[]): CreateArgs {
  const args = argv.slice(2);
  const name = readFlagValue(args, "--name");
  const categoryRaw = readFlagValue(args, "--category");
  const language = readFlagValue(args, "--language") ?? "es_ES";
  const bodyText = readFlagValue(args, "--body-text");
  const bodyExampleRaw = readFlagValue(args, "--body-example");
  const componentsRaw = readFlagValue(args, "--components-json");
  const allowCategoryChange = args.includes("--allow-category-change");

  if (!name || !categoryRaw) {
    throw new Error(`Debes enviar --name y --category\n\n${usage()}`);
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

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
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
