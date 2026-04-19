import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { ac, ceoRole, adminRole, comercialRole } from "./permissions";

/**
 * Orígenes adicionales permitidos para CSRF/origin check (sign-in, sign-out, etc.).
 * Incluye NEXT_PUBLIC_APP_URL (p. ej. túnel ngrok) y BETTER_AUTH_TRUSTED_ORIGINS (coma-separado).
 */
function extraTrustedOrigins(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined) => {
    if (!raw?.trim()) return;
    try {
      const origin = new URL(raw.trim()).origin;
      if (!seen.has(origin)) {
        seen.add(origin);
        out.push(origin);
      }
    } catch {
      // ignorar URLs inválidas
    }
  };

  push(process.env.NEXT_PUBLIC_APP_URL);
  push(process.env.NEXT_PUBLIC_BETTER_AUTH_URL);

  const list = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [];
  for (const item of list) push(item.trim());

  return out;
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: extraTrustedOrigins(),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  plugins: [
    admin({
      ac,
      roles: {
        ceo: ceoRole,
        admin: adminRole,
        comercial: comercialRole,
      },
      defaultRole: "comercial",
    }),
    nextCookies(),
  ],
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "comercial",
        input: false,
      },
      comercialId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
