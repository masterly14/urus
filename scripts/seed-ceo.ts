/**
 * Seed del usuario CEO inicial para bootstrap de la plataforma.
 *
 * Lee CEO_SEED_EMAIL y CEO_SEED_PASSWORD de las variables de entorno
 * y crea el usuario con rol "ceo" via Better Auth signUpEmail.
 *
 * Idempotente: si el email ya existe, actualiza el rol a "ceo".
 *
 * Ejecución: npx tsx scripts/seed-ceo.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.CEO_SEED_EMAIL;
  const password = process.env.CEO_SEED_PASSWORD;

  if (!email || !password) {
    console.error("[seed-ceo] CEO_SEED_EMAIL y CEO_SEED_PASSWORD son requeridos en .env");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === "ceo") {
      console.log(`[seed-ceo] Usuario CEO ya existe: ${email} (id: ${existing.id})`);
      return;
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ceo" },
    });
    console.log(`[seed-ceo] Usuario ${email} actualizado a rol CEO (id: ${existing.id})`);
    return;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name: "CEO",
    },
  });

  if (!result?.user) {
    console.error("[seed-ceo] Error al crear el usuario CEO");
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: result.user.id },
    data: {
      role: "ceo",
      emailVerified: true,
    },
  });

  console.log(`[seed-ceo] Usuario CEO creado: ${email} (id: ${result.user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
