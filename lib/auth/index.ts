import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { ac, ceoRole, adminRole, comercialRole } from "./permissions";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
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
