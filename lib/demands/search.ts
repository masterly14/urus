import type { Prisma } from "@prisma/client";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildDemandPhoneSearchTerms(query: string): string[] {
  const digits = query.replace(/\D/g, "");
  if (!digits) return [];

  const internationalDigits = digits.startsWith("00") ? digits.slice(2) : digits;
  const terms = [digits, internationalDigits];

  if (internationalDigits.startsWith("34") && internationalDigits.length > 9) {
    terms.push(internationalDigits.slice(2));
  } else if (internationalDigits.length >= 3 && internationalDigits.length <= 9) {
    terms.push(`34${internationalDigits}`);
  }

  return unique(terms);
}

export function buildDemandSearchConditions(query: string): Prisma.DemandCurrentWhereInput[] {
  const q = query.trim();
  if (!q) return [];

  return [
    { codigo: { contains: q, mode: "insensitive" } },
    { ref: { contains: q, mode: "insensitive" } },
    { nombre: { contains: q, mode: "insensitive" } },
    { zonas: { contains: q, mode: "insensitive" } },
    { tipos: { contains: q, mode: "insensitive" } },
    ...buildDemandPhoneSearchTerms(q).map((term) => ({
      telefono: { contains: term, mode: "insensitive" as const },
    })),
  ];
}
