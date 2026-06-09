/**
 * Borra un mensaje programado en Upstash QStash (best effort).
 */
export async function deleteQstashMessage(messageId: string): Promise<boolean> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    console.warn(
      `[qstash] No se pudo borrar mensaje ${messageId}: QSTASH_TOKEN no configurado`,
    );
    return false;
  }

  try {
    const response = await fetch(
      `https://qstash.upstash.io/v2/messages/${messageId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (response.ok) return true;

    const body = await response.text().catch(() => "");
    console.warn(
      `[qstash] No se pudo borrar mensaje ${messageId}: HTTP ${response.status} ${response.statusText} ${body.slice(0, 200)}`,
    );
    return false;
  } catch (err) {
    console.warn(
      `[qstash] No se pudo borrar mensaje ${messageId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
