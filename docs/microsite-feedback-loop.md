# Microsite de Seleccion — Arquitectura y Feedback Loop

## Que es

El microsite es la experiencia publica que ve el comprador cuando Urus Capital le presenta propiedades de mercado que encajan con su demanda. Es una aplicacion Next.js bajo la ruta `/seleccion/{token}` que actua como **portal de marca propia** — el comprador nunca sale del dominio de Urus Capital.

## Flujo completo

```
Visita evaluada (interes alto)
  → GENERATE_MICROSITE (job)
    → Statefox API /properties (stock portal)
    → Filtro + scoring + curacion completa
    → Persistencia en MicrositeSelection (JSON con todos los datos)
  → NOTIFY_MICROSITE_PENDING_VALIDATION (WhatsApp al comercial)
    → Comercial revisa en /validar-seleccion/{validationToken}
    → APPROVE → SEND_MICROSITE_TO_BUYER (WhatsApp al comprador con URL)
      → Comprador navega /seleccion/{token}
        → Grid de tarjetas clickeables
        → Click → /seleccion/{token}/propiedad/{propertyId} (detalle completo)
```

## Estructura de archivos

| Archivo | Funcion |
|---------|---------|
| `lib/microsite/selection.ts` | Generacion de seleccion: query Statefox, filtro, scoring, curacion, persistencia |
| `lib/microsite/constants.ts` | SLA de validacion (2h) |
| `lib/microsite/buyer-phone.ts` | Resolucion de telefono del comprador |
| `lib/microsite/app-url.ts` | URL publica del microsite |
| `lib/microsite/mock-selection.ts` | Datos mock para vista demo (`?mock=1` / `DEMO_UI=1`) |
| `app/seleccion/[token]/page.tsx` | Grid de propiedades (comprador) |
| `app/seleccion/[token]/propiedad/[propertyId]/page.tsx` | Detalle completo de propiedad |
| `app/seleccion/[token]/propiedad/[propertyId]/image-carousel.tsx` | Carrusel de imagenes (client component) |
| `app/validar-seleccion/[validationToken]/page.tsx` | Validacion comercial |
| `app/api/seleccion/[token]/feedback/route.ts` | API de feedback (evento SELECCION_COMPRADOR) |

## Datos curados por propiedad (MicrositeCuratedProperty)

Cada propiedad del microsite se almacena como JSON en `MicrositeSelection.properties` con todos los campos necesarios para renderizar sin llamadas adicionales a Statefox:

- **Basicos**: titulo, precio, precio/m2, habitaciones, banos
- **Superficie**: metros construidos, utiles, parcela, terraza
- **Ubicacion**: ciudad, zona, direccion, latitud, longitud
- **Detalle**: descripcion completa, planta, orientacion, tipologia
- **Imagenes**: hasta 30 URLs (main image + pImages de Statefox)
- **Extras**: terraza, ascensor, piscina, garaje, chimenea, etc. (sin limite)
- **Certificado energetico**: rating (A-G) + valor de consumo
- **Anunciante**: tipo (particular/profesional) + nombre

## Pagina de detalle de propiedad

Ruta: `/seleccion/{token}/propiedad/{propertyId}`

Muestra:
- Carrusel de imagenes con miniaturas y modo pantalla completa
- Precio con precio por metro cuadrado
- Descripcion completa
- Ficha tecnica (sidebar): superficie, habitaciones, planta, orientacion, anunciante, etc.
- Badge de certificado energetico (A-G con colores)
- Mapa estatico (Google Maps Static API, requiere `NEXT_PUBLIC_GOOGLE_MAPS_KEY`)
- Navegacion anterior/siguiente entre propiedades de la seleccion
- Link de vuelta al grid

## Vista demo

Con `DEMO_UI=1` en variables de entorno, se puede acceder a:
- `/seleccion/demo` — grid con propiedades mock
- `/seleccion/demo/propiedad/mock-sfx-001` — detalle de propiedad mock

Los mocks incluyen todos los campos nuevos (descripcion, coordenadas, cert. energetico, etc.).

## Variables de entorno

| Variable | Requerida | Uso |
|----------|-----------|-----|
| `STATEFOX_BEARER_TOKEN` | Si (produccion) | Consulta de propiedades de mercado |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Opcional | Mapa estatico en detalle de propiedad |
| `DEMO_UI` | Opcional | Activa vistas demo sin Statefox ni DB |

## Test cercano a produccion

```bash
npx tsx scripts/test-microsite-curate.ts
```

Conecta a Statefox con token real, ejecuta el pipeline completo y reporta cobertura de campos nuevos.

## Proximo: Feedback Loop via WhatsApp

El microsite ya no tiene botones de feedback en la web. La proxima iteracion implementara:

1. **WhatsApp como unico canal de feedback**: el comprador ve propiedades en el microsite y responde por WhatsApp
2. **NLU contextual con LangGraph**: recibe texto libre + contexto de propiedades del microsite activo, resuelve a que propiedad(es) se refiere + sentimiento
3. **Memoria conversacional**: historial de mensajes para entender contexto de mensajes previos
4. **Handler SELECCION_COMPRADOR**: reemplazar placeholder por logica real que traduzca feedback a DEMANDA_ACTUALIZADA
5. **Regeneracion de microsite**: cuando DEMANDA_ACTUALIZADA se procesa o el comprador pide mas opciones
