import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import {
  inferSourceFileNameFromResponse,
  normalizeDocumentToPdf,
  PdfNormalizationError,
} from "@/lib/signaturit/pdf-normalization";
import { uploadContractDocument } from "@/lib/cloudinary";
import { isAuthorized } from "@/lib/api/cron-auth";
import { computeSha256, generateSigningToken, buildSigningUrl } from "@/lib/firma";

export const runtime = "nodejs";
export const maxDuration = 60;

const SignerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.string().optional(),
});

const RequestSchema = z
  .object({
    operationId: z.string().min(1),
    propertyCode: z.string().min(1),
    documentKind: z.string().min(1),
    templateVersion: z.string().optional(),
    cloudinaryUrl: z.string().url().optional(),
    docxBase64: z.string().min(1).optional(),
    signers: z.array(SignerSchema).min(1),
    signingMode: z.enum(["sequential", "parallel"]).optional(),
  })
  .refine((d) => d.cloudinaryUrl || d.docxBase64, {
    message: "Provide either cloudinaryUrl or docxBase64",
    path: ["cloudinaryUrl"],
  });

const SLA_DAYS = Number(process.env.SIGNATURIT_SLA_DAYS) || 5;

function isBrowserRequest(req: Request): boolean {
  return Boolean(req.headers.get("origin") || req.headers.get("referer"));
}

export async function POST(request: Request) {
  if (!isBrowserRequest(request)) {
    const signToken = process.env.SIGNATURIT_SIGN_API_TOKEN?.trim();
    if (signToken) {
      if (request.headers.get("authorization") !== `Bearer ${signToken}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else if (process.env.CRON_SECRET) {
      if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  const body = await request.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    operationId,
    propertyCode,
    documentKind,
    templateVersion,
    signers,
    signingMode,
  } = parsed.data;

  const operacionRecord = await prisma.operacion.findFirst({
    where: { codigo: operationId },
    select: { id: true },
  });
  if (!operacionRecord) {
    console.warn(
      `[contracts/sign] Operacion no encontrada para codigo=${operationId} — legacy flow`,
    );
  }

  const existingDoc = await prisma.legalDocument.findFirst({
    where: { operationId, documentKind },
    select: { status: true },
  });
  if (existingDoc && existingDoc.status !== "APPROVED" && existingDoc.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Documento en estado ${existingDoc.status}, se requiere DRAFT o APPROVED` },
      { status: 409 },
    );
  }

  let downloadedBuffer: Buffer;
  let cloudinaryUrl: string;
  let sourceFileName: string;
  let downloadContentType: string | null = null;

  if (parsed.data.docxBase64) {
    downloadedBuffer = Buffer.from(parsed.data.docxBase64, "base64");
    const fileName = `${operationId}_${documentKind}.docx`;
    try {
      const uploadResult = await uploadContractDocument({
        buffer: downloadedBuffer,
        fileName,
        folder: `contracts/${operationId}`,
        tags: ["draft", "pre-signature", documentKind],
        context: {
          operationId,
          propertyCode,
          templateVersion: templateVersion ?? "",
        },
      });
      cloudinaryUrl = uploadResult.secureUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[contracts/sign] Cloudinary upload error:", message);
      return NextResponse.json(
        { error: "Failed to upload document to Cloudinary", detail: message },
        { status: 502 },
      );
    }
    sourceFileName = fileName;
    downloadContentType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else {
    cloudinaryUrl = parsed.data.cloudinaryUrl!;
    const docRes = await fetch(cloudinaryUrl);
    if (!docRes.ok) {
      return NextResponse.json(
        { error: `Failed to download document from Cloudinary (${docRes.status})` },
        { status: 502 },
      );
    }
    downloadedBuffer = Buffer.from(await docRes.arrayBuffer());
    sourceFileName = inferSourceFileNameFromResponse(cloudinaryUrl, docRes);
    downloadContentType = docRes.headers.get("content-type");
  }

  let pdfBuffer: Buffer;
  let convertedToPdf = false;
  try {
    const normalized = await normalizeDocumentToPdf({
      buffer: downloadedBuffer,
      contentType: downloadContentType,
      sourceFileName,
    });
    pdfBuffer = normalized.pdfBuffer;
    convertedToPdf = normalized.converted;
  } catch (err) {
    if (err instanceof PdfNormalizationError) {
      return NextResponse.json(
        {
          error: "No se pudo normalizar el documento a PDF",
          code: err.code,
          detail: err.message,
        },
        { status: 422 },
      );
    }
    throw err;
  }

  if (convertedToPdf) {
    try {
      const pdfUpload = await uploadContractDocument({
        buffer: pdfBuffer,
        fileName: `${operationId}_${documentKind}.pdf`,
        folder: `contracts/${operationId}`,
        tags: ["draft", "pre-signature", "pdf", documentKind],
        context: { operationId, propertyCode },
      });
      cloudinaryUrl = pdfUpload.secureUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[contracts/sign] Cloudinary PDF re-upload error:", message);
    }
  }

  const documentHash = computeSha256(pdfBuffer);
  const signingToken = generateSigningToken();
  const appUrl = getPublicAppUrl();
  const signingUrl = buildSigningUrl(signingToken);

  const now = new Date();
  const slaDeadline = new Date(now.getTime() + SLA_DAYS * 24 * 60 * 60 * 1000);

  const signatureRequest = await prisma.signatureRequest.create({
    data: {
      operationId,
      propertyCode,
      documentKind,
      templateVersion: templateVersion ?? null,
      cloudinaryUrl,
      signingUrl,
      status: "SENT",
      signerName: signers[0].name,
      signerEmail: signers[0].email,
      signerPhone: signers[0].phone ?? null,
      sentAt: now,
      slaDeadlineDays: SLA_DAYS,
      slaDeadline,
      documentHash,
      signingToken,
    },
  });

  const legalDoc = await prisma.legalDocument.upsert({
    where: {
      operationId_documentKind: { operationId, documentKind },
    },
    create: {
      operationId,
      propertyCode,
      documentKind,
      templateVersion: templateVersion ?? null,
      status: "SENT_TO_SIGNATURE",
      cloudinaryUrl,
      signatureRequestId: signatureRequest.id,
    },
    update: {
      status: "SENT_TO_SIGNATURE",
      signatureRequestId: signatureRequest.id,
      cloudinaryUrl,
    },
  });

  for (const signer of signers) {
    await prisma.legalDocumentParty.upsert({
      where: {
        legalDocumentId_email: {
          legalDocumentId: legalDoc.id,
          email: signer.email,
        },
      },
      create: {
        legalDocumentId: legalDoc.id,
        role: signer.role ?? "SIGNER",
        fullName: signer.name,
        email: signer.email,
        phone: signer.phone ?? null,
      },
      update: {
        fullName: signer.name,
        phone: signer.phone ?? null,
        role: signer.role ?? "SIGNER",
      },
    });
  }

  await appendEvent({
    type: "FIRMA_ENVIADA",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    payload: {
      signatureRequestId: signatureRequest.id,
      operationId,
      documentKind,
      templateVersion,
      signingUrl,
      signingMode: signingMode ?? "sequential",
      normalizedToPdf: convertedToPdf,
      documentHash,
      signers: signers.map((s) => ({ name: s.name, email: s.email })),
      slaDeadline: slaDeadline.toISOString(),
    },
  });

  console.log(
    `[contracts/sign] Firma enviada (in-house): signatureRequestId=${signatureRequest.id} operationId=${operationId} signingUrl=${signingUrl}`,
  );

  return NextResponse.json({
    signatureRequestId: signatureRequest.id,
    signingUrl,
    status: "SENT",
    normalizedToPdf: convertedToPdf,
    documentHash,
  });
}
