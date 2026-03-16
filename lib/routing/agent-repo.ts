import { prisma } from "@/lib/prisma";
import type { AgentProfile } from "./types";

export async function getActiveAgentsByCity(
  ciudad: string,
): Promise<AgentProfile[]> {
  const rows = await prisma.comercial.findMany({
    where: {
      ciudad: { equals: ciudad, mode: "insensitive" },
      activo: true,
    },
    orderBy: { cargaActual: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    email: r.email,
    ciudad: r.ciudad,
    especialidad: r.especialidad,
    activo: r.activo,
    cargaActual: r.cargaActual,
    cargaMaxima: r.cargaMaxima,
    leadsAsignados: r.leadsAsignados,
    leadsCerrados: r.leadsCerrados,
    tasaConversion: r.tasaConversion,
  }));
}

export async function incrementAgentLoad(agentId: string): Promise<void> {
  await prisma.comercial.update({
    where: { id: agentId },
    data: {
      cargaActual: { increment: 1 },
      leadsAsignados: { increment: 1 },
    },
  });
}
