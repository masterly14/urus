import { prisma } from "@/lib/prisma";
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
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Explorador de Documentos</h2>
      </div>
      <DocumentExplorer documents={formattedDocs} />
    </div>
  );
}
