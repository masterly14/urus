/**
 * Reenvío puntual del Parte de Visita (rama TEMPLATE).
 *
 * Caso de uso: cuando el envío inicial salió como `interactive` y no se entregó
 * por estar fuera de la ventana de 24 h, este script reenvía el mismo formulario
 * usando la plantilla `parte_visita_formulario` (con botón Flow vinculado en
 * Meta), que se entrega siempre porque es business-initiated.
 *
 * Uso: npx tsx scripts/resend-parte-visita-flow.ts <sessionId>
 */

import { prisma } from "@/lib/prisma";
import { resolveComercial } from "@/lib/routing/resolve-comercial";
import { resolveParteVisitaBuyerName } from "@/lib/parte-visita/resolve-buyer-name";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Uso: npx tsx scripts/resend-parte-visita-flow.ts <sessionId>");
    process.exit(2);
  }

  // Forzar rama TEMPLATE en sendParteVisitaFlow (ignora interactive aunque
  // WHATSAPP_FLOW_PARTE_VISITA_ID esté configurado).
  process.env.WHATSAPP_FLOW_PARTE_VISITA_ID = "";

  const { sendParteVisitaContexto, sendParteVisitaFlow } = await import(
    "@/lib/parte-visita/whatsapp"
  );

  const session = await prisma.parteVisitaSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    console.error(`Sesión ${sessionId} no encontrada`);
    process.exit(1);
  }

  const comercial = await resolveComercial({
    comercialId: session.comercialId,
    requireActive: false,
  });
  const agenteName = comercial?.nombre ?? "URUS Capital Group";

  const fechaVisita = session.visitDateTime.toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaVisita = session.visitDateTime.toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });

  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: session.propertyCode },
    select: { titulo: true, portalUrl: true },
  });
  const propertyTitle =
    property?.titulo?.trim() ||
    session.direccion ||
    session.propertyRef ||
    "propiedad";
  const propertyUrl =
    property?.portalUrl?.trim() || "https://www.idealista.com/";
  const buyerName = await resolveParteVisitaBuyerName({
    buyerPhone: session.buyerPhone,
    sessionBuyerName: session.buyerNombre,
    draftDemandId: session.draftDemandId,
  });

  const skipContexto = process.env.SKIP_CONTEXTO === "1";
  if (!skipContexto) {
    console.log(`[resend] Enviando contexto a ${session.buyerPhone}...`);
    await sendParteVisitaContexto(session.buyerPhone, {
      sessionId: session.id,
      propertyRef: session.propertyRef,
      propertyTitle,
      propertyUrl,
    });
  } else {
    console.log("[resend] SKIP_CONTEXTO=1 — solo se reenvía el flow.");
  }

  console.log(`[resend] Enviando flow (template) a ${session.buyerPhone}...`);
  const result = await sendParteVisitaFlow(session.buyerPhone, {
    sessionId: session.id,
    buyerName,
    direccion: session.direccion,
    tipoOperacion: session.tipoOperacion,
    precio: session.precio,
    propertyRef: session.propertyRef,
    agenteName,
    fechaVisita,
    horaVisita,
  });
  console.log("[resend] OK:", JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[resend] FAIL:", err);
  await prisma.$disconnect();
  process.exit(1);
});
