/**
 * Codificacion polyline de Google (algoritmo de polilinea encoded).
 *
 * Spec oficial:
 *   https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * Idealista usa esta codificacion para el parametro `shape` cuando el
 * usuario dibuja un area en el mapa. La cadena resultante se envuelve en
 * base64 URL-safe (`+` -> `-`, `/` -> `_`) y se pasa como query string.
 *
 * Convencion de coordenadas en este modulo:
 *  - `encodePolyline` recibe `[lat, lng]` (convencion Google).
 *  - El resto de utilidades del proyecto usan `[lng, lat]` (convencion
 *    GeoJSON). Convertir antes de llamar.
 *
 * Caso conocido (Google docs):
 *   coords = [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
 *   ->  _p~iF~ps|U_ulLnnqC_mqNvxq`@
 */

export function encodePolyline(coords: Array<[number, number]>): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of coords) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeSignedValue(iLat - prevLat);
    out += encodeSignedValue(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

function encodeSignedValue(num: number): string {
  // Shift left por 1 (multiplica por 2). Si negativo, invertir bitwise.
  let val = num < 0 ? ~(num << 1) : num << 1;
  // Asegurar que es unsigned 32 bits (evita issues con valores grandes).
  val = val >>> 0;
  let result = "";
  while (val >= 0x20) {
    result += String.fromCharCode((0x20 | (val & 0x1f)) + 63);
    val = val >>> 5;
  }
  result += String.fromCharCode(val + 63);
  return result;
}

/**
 * Codifica un poligono cerrado (primer punto == ultimo) en formato shape
 * de Idealista: base64-url-safe del polyline. Acepta coordenadas
 * GeoJSON-style `[lng, lat]` y las convierte a `[lat, lng]` para el polyline.
 */
export function encodeIdealistaShape(
  polygonLngLat: Array<[number, number]>,
): string {
  if (polygonLngLat.length < 3) {
    throw new Error("encodeIdealistaShape requires al menos 3 puntos");
  }
  // Asegurar polygon cerrado: primer punto == ultimo.
  const closed: Array<[number, number]> = [...polygonLngLat];
  const first = closed[0]!;
  const last = closed[closed.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    closed.push(first);
  }
  // Convertir a [lat, lng] para polyline.
  const latLng = closed.map(([lng, lat]) => [lat, lng] as [number, number]);
  const encoded = encodePolyline(latLng);
  // Base64 URL-safe del polyline crudo.
  const b64 = Buffer.from(encoded, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface BuildIdealistaAreaUrlArgs {
  /** "sale" o "rent". Idealista path: "venta-viviendas" / "alquiler-viviendas". */
  operation: "sale" | "rent";
  /**
   * Subfiltro opcional como segmento extra (`con-pisos`, `con-precio-hasta_300000`).
   * Si se omite, se cosechan todas las tipologias.
   */
  housingPath?: string;
  /** Poligono GeoJSON-style `[lng, lat]` (>=3 puntos). */
  polygonLngLat: Array<[number, number]>;
}

/**
 * Construye una URL de listado Idealista filtrada por poligono dibujado.
 *
 * Estructura observada cuando un usuario dibuja un area en idealista.com:
 *   https://www.idealista.com/areas/venta-viviendas/<housing>/?shape=<base64-polyline>
 *
 * NOTE: validar contra Idealista capturando un shape real antes de
 * activar en produccion. Si el formato cambia, ajustar aqui sin tocar el
 * resto del pipeline.
 */
export function buildIdealistaAreaUrl(args: BuildIdealistaAreaUrlArgs): string {
  const operationPath =
    args.operation === "rent" ? "alquiler-viviendas" : "venta-viviendas";
  const housingSegment = args.housingPath ? `/${args.housingPath}` : "";
  const shape = encodeIdealistaShape(args.polygonLngLat);
  return `https://www.idealista.com/areas/${operationPath}${housingSegment}/?shape=${shape}`;
}
