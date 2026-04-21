import { NextResponse, type NextRequest } from "next/server";
import { getVariablesForKind, VARIABLE_CATALOG } from "@/lib/contracts/templates/variable-catalog";
import type { ContractDocumentKind } from "@/types/contracts";

const VALID_KINDS = new Set(["arras", "senal_compra", "oferta_firme", "anexo_mobiliario"]);

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");

  if (kind && VALID_KINDS.has(kind)) {
    return NextResponse.json(getVariablesForKind(kind as ContractDocumentKind));
  }

  return NextResponse.json(VARIABLE_CATALOG);
}
