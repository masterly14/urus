/**
 * Tipos para la API REST de Statefox (statefox.com/public/aapi/props).
 * GET /properties y GET /snapshot — solo lectura, Bearer token.
 */

// --- GET /properties: filtros y literales ---

export type StatefoxSource = "idealista" | "fotocasa" | "pisoscom" | "habitaclia";
export type StatefoxListingType = "sale" | "rent";
export type StatefoxHousing =
  | "flat"
  | "house"
  | "countryhouse"
  | "duplex"
  | "penthouse"
  | "studio"
  | "loft"
  | "garage"
  | "office"
  | "premises"
  | "land"
  | "building"
  | "storage"
  | "warehouse"
  | "room";

export type GetPropertiesFilters = {
  source: StatefoxSource;
  type: StatefoxListingType;
  items: number;
  housing: StatefoxHousing;
  /** Fecha de inserción, formato Y-m-d. Opcional. */
  insert?: string;
};

// --- GET /properties: subobjetos de Property ---

export type StatefoxPropertyAdvert = {
  type?: "private" | "professional";
  name?: string;
  total?: number | { sale?: number; rent?: number };
  data?: unknown[];
};

export type StatefoxPropertyMeters = {
  built?: number;
  usable?: number;
  plot?: number;
  buildable?: number;
  terrace?: number;
  garage?: number;
};

export type StatefoxPropertyExtras = {
  oCondition?: string;
  condition?: string;
  certenerat?: string;
  certeneval?: number;
  certemirat?: string;
  certemival?: number;
  exterior?: boolean;
  terrace?: boolean;
  balcony?: boolean;
  furniture?: boolean;
  furnished?: boolean;
  lift?: boolean;
  heating?: string;
  aircond?: boolean;
  airConditioning?: boolean;
  pool?: boolean;
  garden?: boolean;
  garage?: boolean;
  boxroom?: boolean;
  wardrobes?: boolean;
  chimney?: boolean;
  purchaseopt?: boolean;
  year?: string;
  deposit?: string;
  negotiable?: boolean;
  link?: string;
};

export type StatefoxPropertyPoint = {
  latitude?: number;
  longitude?: number;
};

export type StatefoxPropertyImageItem = { src?: string };
export type StatefoxPropertyImages = Record<string, StatefoxPropertyImageItem>;

export type StatefoxPropertyTS = {
  seen?: number;
  check?: number;
  insert?: number;
  hash?: number;
  match?: number;
  change?: number;
  mod?: number;
};

export type StatefoxPropertyDate = {
  seen?: string;
  insert?: string;
  check?: string;
  hash?: string;
  match?: string;
};

export type StatefoxPropertyCity = {
  _id?: string;
  cityName?: string;
  cityRegion?: string;
};

export type StatefoxPropertyZone = {
  _id?: string;
  name?: string;
};

export type StatefoxPropertyChanges = {
  type?: string;
  price?: number;
  status?: number;
  address?: number;
  descrip?: number;
};

export type StatefoxPropertyIs = {
  acquire?: boolean;
  crawl?: boolean;
  complete?: boolean;
  residential?: boolean | null;
};

export type StatefoxPropertyHas = {
  images?: boolean;
  reports?: boolean;
  contact?: boolean;
  follow?: boolean;
  stock?: boolean;
};

// --- GET /properties: Property y respuesta ---

export type StatefoxProperty = {
  _id?: string;
  pType?: string;
  pStatus?: string;
  pHousing?: string;
  pDesc?: string;
  pPrice?: number;
  pRooms?: number;
  pBaths?: number;
  pFloor?: string;
  pOrientation?: string;
  pTags?: string;
  pAddress?: string;
  pRef?: string;
  pContact?: string;
  pPricePerMeter?: number;
  pLink?: string;
  propertyMainImage?: string;
  pPhones?: string[];
  pAdvert?: StatefoxPropertyAdvert;
  pMeters?: StatefoxPropertyMeters;
  pExtras?: StatefoxPropertyExtras;
  pPoint?: StatefoxPropertyPoint;
  pImages?: StatefoxPropertyImages;
  pTS?: StatefoxPropertyTS;
  pDate?: StatefoxPropertyDate;
  pCity?: StatefoxPropertyCity;
  pZone?: StatefoxPropertyZone;
  pChanges?: StatefoxPropertyChanges;
  is?: StatefoxPropertyIs;
  has?: StatefoxPropertyHas;
};

export type StatefoxPropertiesMeta = {
  page?: number;
  total?: number;
  items?: number;
  "price.min"?: number;
  "price.max"?: number;
};

export type GetPropertiesResponse = {
  properties: Record<string, StatefoxProperty>;
  meta: StatefoxPropertiesMeta;
};

// --- GET /snapshot: params y literales ---

export type StatefoxSnapshotStatus = "active" | "inactive";

export type GetSnapshotParams = {
  items: number;
  status?: StatefoxSnapshotStatus;
  type?: StatefoxListingType;
  /** Cursor para la siguiente página (meta.next de la respuesta anterior). */
  next?: string;
};

// --- GET /snapshot: subobjetos de SnapshotProperty ---

export type StatefoxSnapshotPropertyMeters = {
  built?: number;
  usable?: number;
  plot?: number;
  buildable?: number;
  terrace?: number;
  garage?: number;
};

export type StatefoxSnapshotPropertyExtras = {
  community?: number;
  oCondition?: string;
  condition?: string;
  certenerat?: string;
  certeneval?: number;
  certemirat?: string;
  certemival?: number;
  exterior?: boolean;
  terrace?: boolean;
  balcony?: boolean;
  wardrobes?: boolean;
  year?: string;
  lift?: boolean;
  heating?: string;
  aircond?: boolean;
  airConditioning?: boolean;
  boxroom?: boolean;
  negotiable?: boolean;
};

export type StatefoxSnapshotPropertyAdvert = {
  name?: string;
  type?: "private" | "professional";
};

export type StatefoxSnapshotPropertyPrivate = {
  name?: string;
};

export type StatefoxSnapshotPropertyTS = {
  seen?: number;
  check?: number;
  mod?: number;
  insert?: number;
  change?: number;
};

// --- GET /snapshot: SnapshotProperty y respuesta ---

export type StatefoxSnapshotProperty = {
  _id?: string;
  pStatus?: string;
  pType?: string;
  pHousing?: string;
  pDescription?: string;
  pAddress?: string;
  pRooms?: number;
  pFloor?: string;
  pOrientation?: string;
  pBaths?: number;
  pPrice?: number;
  pRef?: string;
  pLink?: string;
  pPhones?: string[];
  pZone?: string | StatefoxPropertyZone;
  match?: unknown[];
  pChanges?: unknown[];
  pMeters?: StatefoxSnapshotPropertyMeters;
  pExtras?: StatefoxSnapshotPropertyExtras;
  pAdvert?: StatefoxSnapshotPropertyAdvert;
  pPrivate?: StatefoxSnapshotPropertyPrivate;
  pPoint?: StatefoxPropertyPoint;
  pImages?: string[];
  pTS?: StatefoxSnapshotPropertyTS;
  pCity?: StatefoxPropertyCity;
};

export type StatefoxSnapshotMeta = {
  items?: number;
  sort?: string;
  next?: string | null;
  debug?: unknown;
};

export type GetSnapshotResponse = {
  result: Record<string, StatefoxSnapshotProperty>;
  meta: StatefoxSnapshotMeta;
};
