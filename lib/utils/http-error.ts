/**
 * Manejo de errores HTTP para clientes REST.
 */

export type ErrorBodyExtractor = (body: Record<string, unknown>) => string | undefined;

const defaultExtractor: ErrorBodyExtractor = (body) =>
  (body.message ?? body.error ?? body.mensaje) as string | undefined;

/**
 * Construye y lanza un Error a partir de una Response no exitosa.
 * Intenta parsear el body como JSON y extraer un mensaje usando el extractor.
 * @param response Respuesta HTTP no ok.
 * @param extractMessage Función para extraer el mensaje de error del body (opcional).
 */
export async function handleHttpErrorResponse(
  response: Response,
  extractMessage: ErrorBodyExtractor = defaultExtractor,
): Promise<never> {
  let message = `${response.status} ${response.statusText}`;
  const text = await response.text();
  if (text) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const detail = extractMessage(body) ?? text;
      message = `${response.status} ${response.statusText}: ${detail}`;
    } catch {
      message = `${response.status} ${response.statusText}: ${text}`;
    }
  }
  throw new Error(message);
}
