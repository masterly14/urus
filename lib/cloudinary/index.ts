/**
 * Integración Cloudinary (documentos, contratos, adjuntos — p. ej. M8 Smart Closing).
 */

export {
  createCloudinaryClient,
  getCloudinary,
  resolveCloudinaryCredentialsFromEnv,
  type CloudinaryClient,
  type CloudinaryCredentials,
  type CreateCloudinaryClientOptions,
} from "./client";

export {
  uploadContractDocument,
  type UploadDocumentOptions,
  type UploadDocumentResult,
} from "./upload-document";
