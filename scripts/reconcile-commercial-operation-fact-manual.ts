import "dotenv/config";

import { prisma } from "@/lib/prisma";

interface CliOptions {
  apply: boolean;
  sourceEventId?: string;
  factId?: string;
  grossAmount?: number;
}

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let sourceEventId: string | undefined;
  let factId: string | undefined;
  let grossAmount: number | undefined;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--source-event-id=")) {
      const value = arg.slice("--source-event-id=".length).trim();
      if (value) sourceEventId = value;
      continue;
    }
    if (arg.startsWith("--fact-id=")) {
      const value = arg.slice("--fact-id=".length).trim();
      if (value) factId = value;
      continue;
    }
    if (arg.startsWith("--gross-amount=")) {
      const value = Number(arg.slice("--gross-amount=".length).replace(",", "."));
      if (Number.isFinite(value) && value > 0) grossAmount = value;
    }
  }

  return { apply, sourceEventId, factId, grossAmount };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!options.sourceEventId && !options.factId) {
    throw new Error("Debes indicar --source-event-id=<id> o --fact-id=<id>.");
  }

  if (options.grossAmount == null) {
    throw new Error("Debes indicar --gross-amount=<importe> en euros.");
  }

  const fact = await prisma.commercialOperationFact.findFirst({
    where: {
      ...(options.factId ? { id: options.factId } : {}),
      ...(options.sourceEventId ? { sourceEventId: options.sourceEventId } : {}),
    },
    select: {
      id: true,
      sourceEventId: true,
      propertyCode: true,
      operacionId: true,
      newEstado: true,
      closedAt: true,
      grossAmountEur: true,
    },
  });

  if (!fact) {
    throw new Error("No se encontró commercial_operation_fact con los filtros indicados.");
  }

  console.log("[reconcile-commercial-operation-fact-manual] target");
  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        factId: fact.id,
        sourceEventId: fact.sourceEventId,
        propertyCode: fact.propertyCode,
        operacionId: fact.operacionId,
        previousGrossAmountEur: fact.grossAmountEur,
        nextGrossAmountEur: options.grossAmount,
      },
      null,
      2,
    ),
  );

  if (!options.apply) {
    console.log(
      "[reconcile-commercial-operation-fact-manual] dry-run: añade --apply para persistir el cambio.",
    );
    return;
  }

  await prisma.commercialOperationFact.update({
    where: { id: fact.id },
    data: { grossAmountEur: options.grossAmount },
  });

  console.log("[reconcile-commercial-operation-fact-manual] updated");
}

main()
  .catch((err) => {
    console.error("[reconcile-commercial-operation-fact-manual] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
