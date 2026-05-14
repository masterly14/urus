const UPLOAD_SEGMENT = "/upload/";

/**
 * Inserta la transformación `f_mp3,q_auto` en una URL de entrega de Cloudinary.
 * Los audios de WhatsApp suelen ser OGG/Opus; Safari y parte de iOS no los
 * reproducen en `<audio>`, pero sí MP3 generado por Cloudinary al vuelo.
 */
export function cloudinaryAudioMp3DeliveryUrl(secureUrl: string): string {
  if (!secureUrl.includes("res.cloudinary.com")) return secureUrl;
  try {
    const url = new URL(secureUrl);
    const path = url.pathname;
    const idx = path.indexOf(UPLOAD_SEGMENT);
    if (idx === -1) return secureUrl;
    const afterUpload = path.slice(idx + UPLOAD_SEGMENT.length);
    if (afterUpload.includes("f_mp3")) return secureUrl;
    const newPath = `${path.slice(0, idx + UPLOAD_SEGMENT.length)}f_mp3,q_auto/${afterUpload}`;
    url.pathname = newPath;
    return url.toString();
  } catch {
    return secureUrl;
  }
}
