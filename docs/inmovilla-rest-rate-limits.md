# Rate limits — API REST Inmovilla (procesos.inmovilla.com/api/v1)

Documentación de límites de tasa y comportamiento observado para la API REST v1 de Inmovilla (token estático).  
**Base URL:** `https://procesos.inmovilla.com/api/v1`

## Límites por recurso

Según documentación y plan de integración:

| Recurso      | Por minuto | Por 10 minutos |
|-------------|------------|----------------|
| Enums       | 2          | 10             |
| Propiedades | 10         | 50             |
| Clientes    | 20         | 100            |
| Propietarios| 20         | 100            |

## Error por exceso de tasa (408)

Cuando se supera el límite, la API responde con:

- **HTTP status:** `408 Request Timeout` (en este contexto indica “demasiadas peticiones”, no solo timeout de red).
- **Cuerpo típico (JSON):**
  ```json
  {
    "codigo": 408,
    "mensaje": "Demasiadas peticiones"
  }
  ```

En la práctica puede aparecer también un mensaje del tipo *“Sólo puedes hacer N peticiones cada 60 segundos”* (por ejemplo para enums: 2 peticiones cada 60 s).

## Recomendaciones

1. **Backoff ante 408:** Si se recibe `408`, esperar al menos 60 segundos antes de reintentar; aplicar backoff exponencial si persiste (p. ej. 60 s, 120 s).
2. **No superar N llamadas/minuto por recurso:** Respetar la tabla anterior; para propiedades no hacer más de 10 llamadas/minuto (p. ej. listado + varios `GET /propiedades/?cod_ofer`).
3. **Enums:** Cachear localmente (rate limit 2/min). Los catálogos (`/enums/?tipos`, `?ciudades`, `?zonas`) se usan para mapear `key_loca`, `key_tipo`, `key_zona`; no llamar en cada request.
4. **Ingesta masiva:** Usar listado (`GET /propiedades/?listado`) para detectar cambios por `fechaact` y luego solo `GET` por `cod_ofer` de los que hayan cambiado, para minimizar llamadas.

## Tests de integración

Los tests en `lib/inmovilla/rest/__tests__/integration.test.ts` se ejecutan **solo si está definido `INMOVILLA_API_TOKEN`** (se omiten con `describe.skipIf(!hasToken)`). Realizan llamadas reales a la API; conviene respetar los rate limits para no recibir 408 durante las pruebas.

## Observaciones en pruebas

- Durante tests de integración contra la API real, respetar los límites anteriores para evitar 408.
- Si en futuras pruebas se observan otros códigos de error o ventanas distintas (p. ej. 429, ventanas por hora), documentarlos aquí como “observados”.
