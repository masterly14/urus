import { ManualSyncTaskSource, ManualSyncTaskType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TransferRecord = {
  codigo: string;
  ref: string | null;
};

type CreateManualSyncTasksInput = {
  properties: TransferRecord[];
  demands: TransferRecord[];
  target: {
    id: string;
    nombre: string;
    inmovillaAgentId: number | null;
  };
  createdByUserId: string;
  sourceUserId: string;
};

type CreateManualSyncTasksResult = {
  total: number;
  properties: number;
  demands: number;
};

function normalizeRecordCode(codigo: string) {
  return codigo.trim();
}

function normalizeRecordRef(ref: string | null) {
  const clean = ref?.trim();
  return clean ? clean : null;
}

export async function createManualSyncTasks(
  input: CreateManualSyncTasksInput,
): Promise<CreateManualSyncTasksResult> {
  const propertyRows = input.properties
    .map((property) => ({
      type: ManualSyncTaskType.PROPERTY,
      recordCode: normalizeRecordCode(property.codigo),
      recordRef: normalizeRecordRef(property.ref),
      targetComercialId: input.target.id,
      targetComercialName: input.target.nombre,
      targetInmovillaAgentId: input.target.inmovillaAgentId,
      createdByUserId: input.createdByUserId,
      sourceUserId: input.sourceUserId,
      source: ManualSyncTaskSource.COMERCIAL_DELETE_TRANSFER,
    }))
    .filter((row) => row.recordCode.length > 0);

  const demandRows = input.demands
    .map((demand) => ({
      type: ManualSyncTaskType.DEMAND,
      recordCode: normalizeRecordCode(demand.codigo),
      recordRef: normalizeRecordRef(demand.ref),
      targetComercialId: input.target.id,
      targetComercialName: input.target.nombre,
      targetInmovillaAgentId: input.target.inmovillaAgentId,
      createdByUserId: input.createdByUserId,
      sourceUserId: input.sourceUserId,
      source: ManualSyncTaskSource.COMERCIAL_DELETE_TRANSFER,
    }))
    .filter((row) => row.recordCode.length > 0);

  const [propertyInsert, demandInsert] = await Promise.all([
    propertyRows.length
      ? prisma.manualSyncTask.createMany({
          data: propertyRows,
          skipDuplicates: true,
        })
      : Promise.resolve({ count: 0 }),
    demandRows.length
      ? prisma.manualSyncTask.createMany({
          data: demandRows,
          skipDuplicates: true,
        })
      : Promise.resolve({ count: 0 }),
  ]);

  return {
    total: propertyInsert.count + demandInsert.count,
    properties: propertyInsert.count,
    demands: demandInsert.count,
  };
}
