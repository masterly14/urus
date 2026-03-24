/**
 * Cliente Cloudinary (SDK v2) para subidas, transformaciones y Admin API.
 * Credenciales: CLOUDINARY_URL o CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET.
 * Uso solo en servidor (Node); no importar desde componentes cliente de Next.
 */

import { v2 as cloudinary } from "cloudinary";

export type CloudinaryCredentials = {
  cloud_name: string;
  api_key: string;
  api_secret: string;
};

export type CloudinaryClient = typeof cloudinary;

export type CreateCloudinaryClientOptions = {
  /** Si se omite, se lee de process.env (CLOUDINARY_*). */
  credentials?: Partial<CloudinaryCredentials>;
};

let lastConfigFingerprint: string | null = null;

function parseCloudinaryUrl(raw: string): CloudinaryCredentials {
  const trimmed = raw.trim();
  if (!/^cloudinary:\/\//i.test(trimmed)) {
    throw new Error(
      "CLOUDINARY_URL debe comenzar por cloudinary:// (p. ej. cloudinary://key:secret@cloud_name)",
    );
  }
  const asHttp = trimmed.replace(/^cloudinary:\/\//i, "https://");
  let u: URL;
  try {
    u = new URL(asHttp);
  } catch {
    throw new Error("CLOUDINARY_URL no es una URL válida");
  }
  const cloud_name = u.hostname;
  const api_key = decodeURIComponent(u.username);
  const api_secret = decodeURIComponent(u.password);
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "CLOUDINARY_URL incompleta: se esperaba user (API key), password (API secret) y host (cloud name)",
    );
  }
  return { cloud_name, api_key, api_secret };
}

/**
 * Resuelve credenciales desde variables de entorno (sin mutar el SDK).
 * @throws Error si faltan variables o CLOUDINARY_URL es inválida.
 */
export function resolveCloudinaryCredentialsFromEnv(): CloudinaryCredentials {
  const url = process.env.CLOUDINARY_URL?.trim();
  if (url) {
    return parseCloudinaryUrl(url);
  }
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = process.env.CLOUDINARY_API_KEY?.trim();
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "Cloudinary: define CLOUDINARY_URL o bien CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET",
    );
  }
  return { cloud_name, api_key, api_secret };
}

function mergeCredentials(
  base: CloudinaryCredentials,
  partial?: Partial<CloudinaryCredentials>,
): CloudinaryCredentials {
  if (!partial) return base;
  return {
    cloud_name: partial.cloud_name ?? base.cloud_name,
    api_key: partial.api_key ?? base.api_key,
    api_secret: partial.api_secret ?? base.api_secret,
  };
}

function fingerprint(c: CloudinaryCredentials): string {
  return `${c.cloud_name}\0${c.api_key}\0${c.api_secret}`;
}

/**
 * Configura el SDK global v2 y devuelve la instancia (uploader, api, utils, etc.).
 * Idempotente: solo reaplica `config` si cambian las credenciales.
 */
export function createCloudinaryClient(
  options?: CreateCloudinaryClientOptions,
): CloudinaryClient {
  const p = options?.credentials;
  const credentials: CloudinaryCredentials =
    p?.cloud_name && p.api_key && p.api_secret
      ? {
          cloud_name: p.cloud_name,
          api_key: p.api_key,
          api_secret: p.api_secret,
        }
      : mergeCredentials(resolveCloudinaryCredentialsFromEnv(), p);
  const fp = fingerprint(credentials);
  if (fp !== lastConfigFingerprint) {
    cloudinary.config({
      cloud_name: credentials.cloud_name,
      api_key: credentials.api_key,
      api_secret: credentials.api_secret,
      secure: true,
    });
    lastConfigFingerprint = fp;
  }
  return cloudinary;
}

/** Alias de conveniencia: mismo comportamiento que `createCloudinaryClient()`. */
export function getCloudinary(): CloudinaryClient {
  return createCloudinaryClient();
}
