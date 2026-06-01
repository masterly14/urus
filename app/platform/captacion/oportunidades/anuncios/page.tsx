/**
 * Ruta legacy `/platform/captacion/oportunidades/anuncios` redirige a Captación.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AnunciosLegacyPage() {
  permanentRedirect("/platform/captacion");
}
