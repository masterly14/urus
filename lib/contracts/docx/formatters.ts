import type { MoneyEUR, NaturalPerson, PostalAddress } from "@/types/contracts";

const EUR_FORMATTER = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDateEsFromIso(dateIso: string): string {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function formatMoneyEur(money: MoneyEUR): string {
  return `${EUR_FORMATTER.format(money.amount)} EUR (${money.literalEs})`;
}

export function formatMoneyAmountEur(amount: number): string {
  return `${EUR_FORMATTER.format(amount)} EUR`;
}

export function formatAddress(address: PostalAddress): string {
  const parts = [
    address.streetLine.trim(),
    address.postalCode?.trim(),
    address.municipality.trim(),
    address.province?.trim(),
  ].filter(Boolean);

  return parts.join(", ");
}

export function formatPersonLegalLine(person: NaturalPerson): string {
  return `${person.fullName}, con DNI ${person.nationalId}, domicilio fiscal en ${formatAddress(person.fiscalAddress)}`;
}

export function formatPeopleList(people: readonly NaturalPerson[]): string {
  return people.map(formatPersonLegalLine).join("; ");
}

export function toUpperLegal(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
