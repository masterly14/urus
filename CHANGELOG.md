# Changelog

Registro semanal de cambios relevantes del proyecto.

## Unreleased

### M8 — Motor de plantillas de contratos (Semana 3, Día 13)

- Generación programática de DOCX de arras con maquetación y estilos (Times New Roman, secciones tituladas).
- Borradores subidos a Cloudinary como `raw` con nombre de fichero que conserva la extensión `.docx`.
- Pipeline Smart Closing disparado desde cambios de estado en Inmovilla; eventos y prueba E2E asociada (rama `feat/M8-smart-closing-templates`).
- Script local `npm run m8:test-contract-upload` para generar DOCX de prueba y opcionalmente subirlo a Cloudinary.

### M6 — Flujo de validación microsite (Item 3 Día 11)

- Eventos `SELECCION_VALIDADA` / `SELECCION_RECHAZADA`; jobs `NOTIFY_MICROSITE_PENDING_VALIDATION`, `SEND_MICROSITE_TO_BUYER`.
- Modelo `MicrositeSelection`: `validationToken`, `validationDueAt`, `buyerPhone`, `validatedAt`, `escalatedAt`; `DemandCurrent.telefono`.
- Rutas `/validar-seleccion/{validationToken}`, `POST /api/validar-seleccion/[validationToken]`, cron `POST /api/cron/microsite-validation-sla`.

## v0.1.0-week-01 - 2026-03-15

### Entregado

- Event Store y Job Queue operativos con cobertura unitaria alta en core.
- Ingestion Worker funcional para propiedades (API REST) y demandas (legacy).
- Egestion Worker funcional para escrituras REST y flujos legacy.
- Integracion inicial de Statefox API REST (`getProperties`, `getSnapshot`) con tipado.

### Cambios destacados

- `feat(M0)`: rutas API de eventos, consumer y proyecciones materializadas.
- `feat(M1)`: cliente REST Inmovilla, ingestion incremental y sincronizacion de catalogos.
- `feat(M6)`: cliente Statefox y tipos de dominio para consolidar integraciones.
- `test(M0|M1|M6)`: ampliacion de pruebas de integracion E2E y unitarias del core.
- `refactor(...)`: extraccion de utilidades compartidas y limpieza de tipado.

### Calidad y validacion

- Build de produccion: OK (`next build`).
- Tests: OK (`166 passed` en `23` archivos).

### Riesgos abiertos

- CLI de GitHub (`gh`) no disponible en el entorno local para automatizar consulta/merge de PRs aprobadas e issues.
- Pendiente ejecutar disciplina completa de PR/review automatizada cuando `gh` este instalado.

