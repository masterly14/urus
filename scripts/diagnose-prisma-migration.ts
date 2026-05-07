import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const failed = await prisma.$queryRawUnsafe<
    Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      logs: string | null;
    }>
  >(
    "select migration_name, finished_at, rolled_back_at, logs from _prisma_migrations where migration_name = '20260429103500_add_whatsapp_template_cache'",
  );

  const tableExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'whatsapp_templates') as exists",
  );

  console.log(
    JSON.stringify(
      {
        failed,
        tableExists: tableExists[0]?.exists ?? false,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
