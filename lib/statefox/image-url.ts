import { isExpiredStatefoxImageUrl } from "./image-expiry";

const STATEFOX_IMAGE_PROXY_PATH = "/api/statefox/image";

const ALLOWED_STATEFOX_IMAGE_HOSTS = [
  "img3.idealista.com",
  "img4.idealista.com",
];

const ALLOWED_STATEFOX_IMAGE_SUFFIXES = [
  ".idealista.com",
  ".fotocasa.es",
  ".pisos.com",
  ".imghs.net",
  ".habitaclia.com",
];

export function isAllowedStatefoxImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      ALLOWED_STATEFOX_IMAGE_HOSTS.includes(host) ||
      ALLOWED_STATEFOX_IMAGE_SUFFIXES.some((suffix) => host.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

export function isUsableStatefoxImageUrl(url: string, now = Date.now()): boolean {
  return isAllowedStatefoxImageUrl(url) && !isExpiredStatefoxImageUrl(url, now);
}

export function proxiedStatefoxImageUrl(url: string): string {
  if (!isUsableStatefoxImageUrl(url)) return url;
  return `${STATEFOX_IMAGE_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}
