import { prisma } from "@/lib/prisma";

/**
 * Genera el próximo código de operación con formato OP-{YYYY}-{NNNN}.
 *
 * La secuencia es por año: se busca el máximo `codigo` del año actual
 * en la tabla `operaciones` y se incrementa. Si no hay ninguno, empieza en 0001.
 *
 * Ejemplo: OP-2026-0001, OP-2026-0002, …, OP-2026-9999.
 */
export async function generarCodigoOperacion(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OP-${year}-`;

  const last = await prisma.operacion.findFirst({
    where: { codigo: { startsWith: prefix } },
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });

  let seq = 1;
  if (last) {
    const suffix = last.codigo.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) {
      seq = parsed + 1;
    }
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}
