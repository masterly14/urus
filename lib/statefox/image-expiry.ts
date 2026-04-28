export function getStatefoxImageExpiresAt(url: string): number | null {
  try {
    const expires = new URL(url).searchParams.get("Expires");
    if (!expires) return null;
    const seconds = Number(expires);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1000;
  } catch {
    return null;
  }
}

export function isExpiredStatefoxImageUrl(url: string, now = Date.now()): boolean {
  const expiresAt = getStatefoxImageExpiresAt(url);
  return expiresAt !== null && expiresAt <= now;
}
