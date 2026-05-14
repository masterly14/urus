/**
 * Ruta legacy `/platform/captacion/oportunidades/anuncios` redirige a
 * la pantalla unica `/platform/captacion/oportunidades`.
 *
 * La separacion en dos rutas (publicantes agrupados vs anuncios) generaba
 * confusion en los comerciales (ambas mostraban "propiedades"). Se
 * consolido en una sola pantalla con la vista flat de anuncios. Se
 * conserva esta ruta como redirect transparente para no romper
 * bookmarks ni enlaces guardados.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AnunciosLegacyPage() {
  permanentRedirect("/platform/captacion/oportunidades");
}
