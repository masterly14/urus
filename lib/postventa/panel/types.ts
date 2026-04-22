export interface PanelNotaDTO {
  id: string;
  operacionId: string;
  authorUserId: string;
  authorName: string;
  authorRole: "ceo" | "admin" | "comercial";
  content: string;
  createdAt: string;
  updatedAt: string;
  /** true si el usuario actual puede editar/eliminar (autor o CEO/admin). */
  canEdit: boolean;
}

export interface PanelChecklistItemDTO {
  id: string;
  operacionId: string;
  texto: string;
  completado: boolean;
  orden: number;
  responsableComercialId: string | null;
  responsableNombre: string | null;
  responsableColaboradorId: string | null;
  responsableColaboradorNombre: string | null;
  createdByUserId: string;
  completadoByUserId: string | null;
  completadoAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PanelAdjuntoDTO {
  id: string;
  operacionId: string;
  nombre: string;
  mimeType: string;
  cloudinaryUrl: string;
  publicId: string;
  resourceType: string;
  bytes: number;
  uploadedByUserId: string;
  uploadedByName: string;
  createdAt: string;
  /** true si el usuario actual puede eliminar (autor o CEO/admin). */
  canDelete: boolean;
}

export interface PanelSummary {
  operacionId: string;
  /** Notas visibles para el usuario actual (filtradas por rol). */
  notasVisibles: number;
  checklistTotal: number;
  checklistCompletados: number;
  adjuntos: number;
}
