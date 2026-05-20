import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DocumentExplorer } from "./document-explorer";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const docs = await prisma.legalDocument.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      operationId: true,
      propertyCode: true,
      documentKind: true,
      status: true,
      cloudinaryUrl: true,
      signedDocumentUrl: true,
      auditTrailUrl: true,
      createdAt: true,
      updatedAt: true,
      parties: {
        select: {
          role: true,
          fullName: true,
        },
      },
    },
  });

  const formattedDocs = docs.map(doc => ({
    id: doc.id,
    operationId: doc.operationId,
    propertyCode: doc.propertyCode,
    documentKind: doc.documentKind,
    status: doc.status,
    parties: doc.parties,
    urls: {
      cloudinary: doc.cloudinaryUrl,
      signed: doc.signedDocumentUrl,
      audit: doc.auditTrailUrl,
    },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <PageHeader
        title="Explorador de documentos"
        description="Consulta borradores, documentos firmados y trazabilidad legal por operación."
        breadcrumbs={[
          { label: "Inicio", href: "/platform" },
          { label: "Legal", href: "/platform/legal" },
          { label: "Documentos" },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href="/platform/legal/contratos">Ver contratos</Link>
          </Button>
        }
      />
      <DocumentExplorer documents={formattedDocs} />
    </div>
  );
}
