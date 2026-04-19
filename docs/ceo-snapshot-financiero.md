# CEO Monthly Snapshot — Entrada manual de datos financieros

> Feature implementada en M13. Sustituye el flujo `scripts/seed-ceo-financials.ts` por un formulario en el dashboard que permite al CEO ver, introducir y modificar los datos financieros mensuales directamente desde la UI.

---

## Qué se construyó

El `CeoMonthlySnapshot` (EBITDA, costes operativos, cash disponible, costes fijos/variables, capacidad de reinversión) ahora tiene un ciclo de vida completo desde la UI:

1. **Detección automática de periodos sin datos:** al entrar al BI dashboard, el sistema verifica si el mes actual y el mes anterior tienen datos en `ceo_monthly_snapshots`. Si alguno está vacío, aparece un banner de alerta.
2. **Banner de alerta no bloqueante:** visible en todo el layout de Gobierno Estratégico (`/platform/bi`), identifica qué periodos faltan e invita a completarlos con un botón.
3. **Botón de edición discreto:** en la página Visión Ejecutiva, el card de semáforos tiene un botón "Datos financieros" (icono lápiz) que abre el modal en cualquier momento, incluso cuando los datos ya están completos.
4. **Modal de formulario:** carga los datos existentes del periodo seleccionado, permite modificarlos y los persiste vía `POST /api/ceo/snapshot`. Soporta selección entre mes actual y anterior.

Los datos guardados alimentan inmediatamente todos los cálculos de `getCeoOverview()`: KPIs de EBITDA, cash, costes, semáforos de expansión/costes, análisis financiero de IA y gráfico histórico.

---

## Archivos principales

| Archivo | Rol |
|---------|-----|
| `lib/dashboard/ceo/snapshot-manager.ts` | `checkSnapshotStatus()` — verifica periodos; `upsertCeoSnapshot()` — crea/actualiza |
| `app/api/ceo/snapshot/route.ts` | `GET` (status o datos de periodo) + `POST` (upsert) |
| `lib/hooks/use-ceo-snapshot-status.ts` | Hook cliente que consulta el status al montar |
| `components/bi/ceo-snapshot-modal.tsx` | Modal reutilizable: selector de periodo + formulario de 6 campos |
| `components/bi/ceo-snapshot-alert.tsx` | Banner de alerta (solo visible si `needsData === true`) |
| `app/platform/bi/layout.tsx` | Integra `<CeoSnapshotAlert />` sobre la navegación |
| `app/platform/bi/vision-ejecutiva/page.tsx` | Botón ghost "Datos financieros" + modal con periodo actual pre-seleccionado |
| `lib/dashboard/ceo/types.ts` | Tipos `SnapshotPeriodStatus`, `SnapshotStatusResult`, `CeoSnapshotFields` |

---

## Endpoints HTTP

### `GET /api/ceo/snapshot`

Sin query params → devuelve el estado de los dos periodos.

```json
{
  "ok": true,
  "current": { "period": "2026-04", "hasData": false, "label": "abril de 2026" },
  "previous": { "period": "2026-03", "hasData": true, "label": "marzo de 2026" },
  "needsData": true
}
```

Con `?period=2026-04` → devuelve el snapshot completo de ese periodo (o `null` si no existe).

### `POST /api/ceo/snapshot`

Body:
```json
{
  "period": "2026-04",
  "ebitdaEur": 28000,
  "operatingCostEur": 15000,
  "cashAvailableEur": 52000,
  "fixedCostsEur": 9000,
  "variableCostsEur": 6000,
  "reinvestmentCapacity": 13000
}
```

Responde con el snapshot persistido.

Ambos endpoints requieren `role === "ceo"` (header `x-simulated-role`).

---

## Lógica de "tiene datos"

Un snapshot se considera **vacío** si no existe en DB o si los cinco campos clave son todos `0`:

```
ebitdaEur === 0 && operatingCostEur === 0 && cashAvailableEur === 0
  && fixedCostsEur === 0 && variableCostsEur === 0
```

---

## Cómo probarlo

1. Abrir `/platform/bi/vision-ejecutiva` con sesión CEO.
2. Si el periodo actual no tiene datos → aparece el banner ámbar.
3. Hacer clic en "Rellenar datos" → se abre el modal con el selector de periodo.
4. Introducir valores y guardar → el banner desaparece y los KPIs se actualizan al recargar.
5. Para editar datos ya existentes → usar el botón "Datos financieros" (icono lápiz) en la card de semáforos.
6. Mock UI: `?mock=1` para ver la página con datos ficticios (no usa los datos del snapshot real).

---

## Pendiente / Deuda técnica

- `reinvestmentCapacity` se introduce manualmente. En el futuro se puede calcular automáticamente con la fórmula `ebitdaEur - fixedCostsEur - variableCostsEur` (pendiente de confirmación de lógica de negocio).
- `revenueEur`, `grossVolumeEur`, `operationsClosed`, `operationsActive`, `avgMarginPerOp` del modelo `CeoMonthlySnapshot` **no** se exponen en el formulario porque se derivan de `commercial_operation_facts`. Solo los campos que no tienen fuente automática son editables.
