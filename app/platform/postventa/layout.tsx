/**
 * Layout para páginas públicas de post-venta (sin AppShell/sidebar).
 * Las rutas bajo /postventa/ son accesibles directamente por el comprador
 * desde enlaces en mensajes WhatsApp, sin necesidad de autenticación.
 */
export default function PostventaPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
