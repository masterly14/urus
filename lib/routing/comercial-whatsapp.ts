import { prisma } from "@/lib/prisma";
import { normalizePhoneES } from "@/lib/whatsapp/phone";

type ComercialPhoneInput = {
  waId?: string | null;
  telefono?: string | null;
};

function cleanDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

export function normalizeComercialWhatsappPhone(
  comercial: ComercialPhoneInput | null,
): string | null {
  if (!comercial) return null;
  const wa = cleanDigits(comercial.waId);
  if (wa) return normalizePhoneES(wa);
  const phone = cleanDigits(comercial.telefono);
  if (phone) return normalizePhoneES(phone);
  return null;
}

export function samePhoneByLast9(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftDigits = cleanDigits(left);
  const rightDigits = cleanDigits(right);
  if (!leftDigits || !rightDigits) return false;
  const leftTail = leftDigits.slice(-9);
  const rightTail = rightDigits.slice(-9);
  return leftTail.length === 9 && leftTail === rightTail;
}

export async function findComercialByIncomingWaId(from: string) {
  const digits = cleanDigits(from);
  const last9 = digits.slice(-9);
  if (last9.length !== 9) return null;

  const byWaId = await prisma.comercial.findFirst({
    where: { waId: { endsWith: last9 } },
    select: { id: true, nombre: true, waId: true, telefono: true, activo: true },
  });
  if (byWaId) return byWaId;

  return prisma.comercial.findFirst({
    where: { telefono: { endsWith: last9 } },
    select: { id: true, nombre: true, waId: true, telefono: true, activo: true },
  });
}
