/**
 * Conversión DOCX → HTML en el cliente (mammoth). Solo usar en `"use client"`.
 */

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function convertDocxBase64ToHtml(base64: string): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = base64ToArrayBuffer(base64);
  const { value } = await mammoth.convertToHtml({ arrayBuffer });
  return value;
}
