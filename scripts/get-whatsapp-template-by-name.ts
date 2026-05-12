import "dotenv/config";
import { createWabaTemplatesClient } from "@/lib/whatsapp/templates/meta-client";

type QueryArgs = {
  name: string;
  language?: string;
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

function usage(): string {
  return [
    "Uso:",
    "  npm run whatsapp:template:get-by-name -- --name <nombre> [--language es_ES]",
    "",
    "Ejemplos:",
    "  npm run whatsapp:template:get-by-name -- --name follow_up_demanda",
    "  npm run whatsapp:template:get-by-name -- --name follow_up_demanda --language es_ES",
  ].join("\n");
}

function parseArgs(argv: string[]): QueryArgs {
  const args = argv.slice(2);
  const name = readFlagValue(args, "--name");
  const language = readFlagValue(args, "--language") ?? undefined;

  if (!name) {
    throw new Error(`Debes enviar --name\n\n${usage()}`);
  }

  return { name, language };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  const client = createWabaTemplatesClient();
  const allTemplates = await client.listTemplates();

  const matches = allTemplates.filter((template) => {
    if (template.name !== parsed.name) return false;
    if (!parsed.language) return true;
    return template.language === parsed.language;
  });

  if (matches.length === 0) {
    console.error(
      `[ERROR] No se encontró la plantilla "${parsed.name}"${parsed.language ? ` con language "${parsed.language}"` : ""}.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        totalMatches: matches.length,
        templates: matches,
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
