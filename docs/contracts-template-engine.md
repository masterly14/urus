# Motor de plantillas de contratos (M8, Día 13 — ítem 1)

Diseño alineado con `types/contracts.ts` y los modelos Word: **oferta en firme (pre-señal)**, **señal de compra**, **contrato de arras**, más **anexo de mobiliario** previsto en el plan.

## Documentos (`ContractDocumentKind`)

| `kind`            | Uso en el flujo                         | Partes típicas                                      |
| ----------------- | --------------------------------------- | --------------------------------------------------- |
| `oferta_firme`    | Depósito con agencia, oferta breve      | Agencia, ofertante(s), aceptación propiedad         |
| `senal_compra`    | Señal hacia arras                       | Agencia, comprador                                  |
| `arras`           | Arras entre comprador y vendedor        | Comprador(es), vendedor(es)                         |
| `anexo_mobiliario`| Lista de enseres vinculada a operación  | Según plantilla (referencia a parte de contrato)    |

## Variables (payloads)

- **Personas:** `NaturalPerson` + `AgencyParty` (representante + sociedad + cuenta de depósito).
- **Inmueble:** `PropertyRegistryData` (dirección, catastro, opcional registro/tomo/libro para oferta firme y arras).
- **Importes:** `MoneyEUR` (`amount` + `literalEs`) para todos los huecos tipo “X.XXX,00 € / letras”.
- **Cuenta arras:** `BankAccount` en `ArrasContractPayload.arrasPaymentAccount` (titular vendedor en modelo arras).
- **Plazos:** tipos específicos por documento (`OfertaFirmeTimelines`, `SenalCompraTimelines`, `ArrasTimelines`).
- **Honorarios:** discriminación `AgencyFees` (`fixed_net` vs `percent_of_final_price`) refleja señal vs oferta en firme.

## Bloques condicionales

- **Oferta firme:** `OfertaFirmeTemplateFlags.includePropertyAcceptanceSection` (casillas ACEPTA/RECHAZA).
- **Régimen arras:** `ArrasTemplateFlags.arrasRegime` (`penitencial` \| `confirmatoria`) — el generador debe elegir texto coherente (evitar mezcla título/cuerpo del modelo legacy).
- **Financiación:** `SenalCompraTemplateFlags.includeFinancingFallbackClause`.
- **Llaves:** `KeysHandoverMode` en señal y arras.
- **Cobro:** `ArrasTemplateFlags.validitySubjectToSellerReceipt` (validez supeditada al cobro).
- **Mobiliario:** `FurnitureAnnexTemplateFlags.hasFurniture` + lista `items`.

## Composición (`SharedClauseBlockId`)

Fragmentos compartidos entre Word (gastos ITP/IVA/plusvalía, fuero, penitencial breve, cargas, etc.). El motor docx (ítem 2+) mapea cada id a párrafos de plantilla o a strings versionados.

## Entrada al motor

`ContractTemplateInput`: unión discriminada `{ kind, payload, templateVersion? }`. Versión por defecto: `DEFAULT_CONTRACT_TEMPLATE_VERSION` en código.

## Siguientes pasos (mismo día en plan)

- Generación programática docx (ítem 2).
- Extracción Neon + Inmovilla → payload (ítem 3).
- Validación obligatorios → `ContractFieldIssue` con `event: DATOS_INCOMPLETOS` (ítem 4).
