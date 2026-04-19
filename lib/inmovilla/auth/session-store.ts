/**
 * Session Store — persistencia de InmovillaSession en Neon (DB).
 *
 * Permite que workers serverless (Vercel) lean una sesión válida
 * sin necesidad de Playwright. La sesión es actualizada por un
 * proceso externo (session proxy) que sí tiene Chromium disponible.
 *
 * Patrón singleton: solo existe una fila con id="singleton".
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import type { InmovillaSession } from "./types";

const SINGLETON_ID = "singleton";
const DEFAULT_SESSION_TTL_HOURS = 6;

type SessionCookie = InmovillaSession["cookies"][number];

function isValidCookieArray(value: unknown): value is SessionCookie[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (c) =>
      c &&
      typeof c === "object" &&
      typeof c.name === "string" &&
      typeof c.value === "string" &&
      typeof c.domain === "string",
  );
}

export async function loadSessionFromDb(): Promise<InmovillaSession | null> {
  const row = await prisma.inmovillaSessionStore.findUnique({
    where: { id: SINGLETON_ID },
  });

  if (!row) return null;

  if (row.expiresAt < new Date()) {
    console.log("[session-store] Sesión en DB expirada — ignorando");
    return null;
  }

  const cookies = row.cookies as unknown;
  if (!isValidCookieArray(cookies)) {
    console.warn("[session-store] Cookies en DB con formato inválido");
    return null;
  }

  return {
    l: row.l,
    idPestanya: row.idPestanya,
    miid: row.miid,
    idUsuario: row.idUsuario,
    numAgencia: row.numAgencia,
    cookies,
  };
}

export async function saveSessionToDb(
  session: InmovillaSession,
  source: string = "unknown",
  ttlHours: number = DEFAULT_SESSION_TTL_HOURS,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await prisma.inmovillaSessionStore.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      l: session.l,
      idPestanya: session.idPestanya,
      miid: session.miid,
      idUsuario: session.idUsuario,
      numAgencia: session.numAgencia,
      cookies: session.cookies as unknown as Prisma.InputJsonValue,
      source,
      expiresAt,
    },
    update: {
      l: session.l,
      idPestanya: session.idPestanya,
      miid: session.miid,
      idUsuario: session.idUsuario,
      numAgencia: session.numAgencia,
      cookies: session.cookies as unknown as Prisma.InputJsonValue,
      source,
      expiresAt,
    },
  });

  console.log(
    `[session-store] Sesión guardada en DB (source=${source}, expira=${expiresAt.toISOString()})`,
  );
}

export async function clearSessionFromDb(): Promise<void> {
  await prisma.inmovillaSessionStore.deleteMany({
    where: { id: SINGLETON_ID },
  });
  console.log("[session-store] Sesión eliminada de DB");
}
