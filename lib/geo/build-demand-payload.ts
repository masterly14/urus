/**
 * Construye un CreateDemandPayload completo con polígono geoespacial.
 *
 * Este módulo es el puente entre lib/geo/ y lib/inmovilla/write/.
 * Convierte datos de alto nivel (nombre, email, zona, presupuesto)
 * en el payload raw que necesita guardar.php.
 */

import type { CreateDemandPayload } from "../inmovilla/write/types";
import { buildDemandGeoFields, type DemandGeoResult } from "./demand-geo";

export type DemandInput = {
  client: {
    nombre: string;
    apellidos: string;
    email: string;
    telefono?: string;
    idioma?: string;
  };
  demand: {
    zone?: string;
    city?: string;
    province?: string;
    precioMin?: number;
    precioMax?: number;
    habitacionesMin?: number;
    propertyTypes?: string;
    seltipos?: string;
    titulo?: string;
  };
  agent: {
    id: string;
    captadoPor?: string;
  };
  options?: {
    offlineOnly?: boolean;
    keymedio?: string;
    keysitu?: string;
  };
};

export type BuildDemandResult = {
  payload: CreateDemandPayload;
  geo: DemandGeoResult;
};

export async function buildCreateDemandPayload(
  input: DemandInput,
): Promise<BuildDemandResult> {
  const { client, demand, agent, options } = input;

  const propertyTypes = demand.propertyTypes ?? "2799,3399";
  const seltipos = demand.seltipos ?? `,${propertyTypes.split(",").join(",Tipo,")}`;

  const geo = await buildDemandGeoFields({
    zone: demand.zone,
    city: demand.city,
    province: demand.province,
    seltipos,
    tipos: propertyTypes,
    offlineOnly: options?.offlineOnly,
  });

  const habMin = demand.habitacionesMin ?? 1;
  const titulo = demand.titulo ?? `${habMin} hab. , Área personalizada 1`;

  const body: Record<string, string> = {
    "demandas-keyagente": agent.id,
    "demandas-captadopor": agent.captadoPor ?? agent.id,
    "demandas-keymedio": options?.keymedio ?? "6",
    "demandas-tipocruce": "1",
    "demandas-cod_dempriclave": "-_NEW_-",
    "demandas-contienecli": "keycli",
    "demandas-keycliclaveext": "clientes.cod_cli",
    "demandas-numdemanda": ".auto_3.",
    "demandas-keysitu": options?.keysitu ?? "20",
    "demandas-fecha": ".auto_1.",
    "demandas-fechaact": ".auto_1.",
    "demandas-titulodem": titulo,
    "demandas-ventadesde": String(demand.precioMin ?? 0),
    "demandas-ventahasta": String(demand.precioMax ?? 0),
    "demandas-ventanego": String(demand.precioMax ?? 0),
    "demandas-habitacionmin": String(habMin),
    "demandas-tipomes": "MES",

    "clientes-cod_clipriclave": "-_NEW_-",
    "clientes-nombre": client.nombre,
    "clientes-apellidos": client.apellidos,
    "clientes-email": client.email,
    "clientes-idiomacli": client.idioma ?? "1",
    "clientes-prefijotel1": "34",
    "clientes-prefijotel2": "34",
    "clientes-prefijotel3": "34",
    "clientes-gesauto": "2",
    "clientes-rgpdwhats": "2",
    "clientes-nonewsletters": "3",
    "clientes-enviosauto": "1",

    nbclave: "demandas.cod_dem",
    tipopropiedad: propertyTypes,
    "valorstars-dem": "{}",

    ...geo.fields,
  };

  if (client.telefono) {
    body["clientes-telefono1"] = client.telefono;
  }

  const payload: CreateDemandPayload = {
    query: {
      eS: "0",
      cruce: "2",
      tipocruce: "1",
      porarea: "1",
      ref: ".auto_3.",
      idi: "1",
      envConf: "true",
    },
    body,
  };

  return { payload, geo };
}
