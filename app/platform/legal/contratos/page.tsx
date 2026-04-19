import { prisma } from "@/lib/prisma";
import { contratos as mockContratos } from "@/lib/mock-data/contratos";
import type { Contrato, EstadoContrato } from "@/lib/mock-data/types";
import type { LegalDocumentStatus } from "@prisma/client";
import { ContratosListClient } from "./contratos-list-client";

/**
 * Listado de contratos — server component.
 * Datos reales desde LegalDocument; fallback a mocks con ?mock=1.
 */

const STATUS_MAP: Record<LegalDocumentStatus, EstadoContrato> = {
  DRAFT: "borrador",
  APPROVED: "revision",
  SENT_TO_SIGNATURE: "enviado",
  SIGNED: "firmado",
  DECLINED: "borrador",
  EXPIRED: "borrador",
  CANCELED: "borrador",
};

function extractPartyNames(
  parties: { role: string; fullName: string }[],
): { comprador: string; vendedor: string } {
  const buyer = parties.find((p) =>
    ["BUYER", "SIGNER", "PURCHASER", "OFFERER"].includes(p.role),
  );
  const seller = parties.find((p) => p.role === "SELLER");
  return {
    comprador: buyer?.fullName ?? parties[0]?.fullName ?? "—",
    vendedor: seller?.fullName ?? "—",
  };
}

function extractPrice(contractInput: unknown): number {
  if (!contractInput || typeof contractInput !== "object") return 0;
  const ci = contractInput as Record<string, unknown>;
  const payload = ci.payload as Record<string, unknown> | undefined;
  if (!payload) return 0;
  const price = payload.totalPurchasePrice as Record<string, unknown> | undefined;
  return Number(price?.amount ?? 0);
}

async function loadRealContratos(): Promise<Contrato[]> {
  const docs = await prisma.legalDocument.findMany({
    include: { parties: { select: { role: true, fullName: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return docs.map((doc) => {
    const { comprador, vendedor } = extractPartyNames(doc.parties);
    const precio = extractPrice(doc.contractInput);
    return {
      id: doc.id,
      operacion: doc.operationId,
      tipo: (doc.documentKind === "arras" ? "arras" : "reserva") as "arras" | "reserva",
      versionActual: doc.templateVersion ?? "v1",
      estado: STATUS_MAP[doc.status] ?? "borrador",
      fechaCreacion: doc.createdAt.toISOString(),
      comercial: "system",
      variables: { precio, comprador, vendedor },
      bloquesActivos: [],
      versiones: [],
    };
  });
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const useMock = params.mock === "1";

  const data = useMock ? mockContratos : await loadRealContratos();

  return <ContratosListClient contratos={data} />;
}
