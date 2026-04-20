/**
 * Dedup para selecciones de coverage: evita generar microsites duplicados
 * cuando la demanda ya tiene una selección reciente pendiente o aprobada.
 */

import { prisma } from "@/lib/prisma";

const envCooldownDays = process.env.MATCHING_COVERAGE_COOLDOWN_DAYS;
const COOLDOWN_DAYS =
  envCooldownDays && !isNaN(Number(envCooldownDays)) ? Number(envCooldownDays) : 7;

const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/**
 * Devuelve true si la demanda ya tiene una selección de coverage reciente
 * que impide generar otra.
 *
 * Criterios:
 * - Existe una selección con source="coverage_scan" en estado PENDING_VALIDATION, o
 * - Existe una selección con source="coverage_scan" y status APPROVED creada dentro
 *   del periodo de cooldown (default 7 días).
 */
export async function hasRecentCoverageSelection(
  demandId: string,
): Promise<boolean> {
  const pending = await prisma.micrositeSelection.findFirst({
    where: {
      demandId,
      source: "coverage_scan",
      status: "PENDING_VALIDATION",
    },
    select: { id: true },
  });

  if (pending) return true;

  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS);

  const recentApproved = await prisma.micrositeSelection.findFirst({
    where: {
      demandId,
      source: "coverage_scan",
      status: "APPROVED",
      createdAt: { gte: cooldownCutoff },
    },
    select: { id: true },
  });

  return Boolean(recentApproved);
}
