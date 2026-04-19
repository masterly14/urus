export interface CatastroLookupParams {
  provincia: string;
  municipio: string;
  tipoVia: string;
  nomVia: string;
  numero: number;
  planta?: string;
  puerta?: string;
}

export interface CatastroMunicipioResult {
  codigoMunicipio: string;
  nombreMunicipio: string;
}

export interface CatastroViaResult {
  codigoVia: string;
  tipoVia: string;
  nombreVia: string;
}

export interface CatastroNumeroResult {
  referenciaCatastral: string;
  direccion: string;
}

export type CatastroResult =
  | { found: true; referenciaCatastral: string; direccion: string }
  | { found: false; error: string; nearest?: Array<{ numero: number; rc: string }> };
