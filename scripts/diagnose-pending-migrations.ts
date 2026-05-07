/**
 * Diagnostico de migraciones pendientes vs estado real de la DB.
 *
 * Para cada migracion pendiente verifica si sus objetos clave (tabla/tipo
 * /columna critica) ya existen. Esto permite distinguir las que ya estan
 * aplicadas en realidad (y solo hace falta `migrate resolve --applied`)
 * de las que aun no se aplicaron.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

interface Probe {
  migration: string;
  kind: "table" | "type" | "column" | "any";
  description: string;
  query: string;
}

const PROBES: Probe[] = [
  {
    migration: "20260430173000_add_visit_work_items",
    kind: "type",
    description: "enum VisitWorkItemStatus",
    query: `select 1 as exists from pg_type where typname = 'VisitWorkItemStatus' limit 1`,
  },
  {
    migration: "20260430184500_add_visit_decision_events",
    kind: "any",
    description: "EventType VISIT_DECISION_REGISTRADO",
    query: `select 1 as exists where 'VISIT_DECISION_REGISTRADO' = ANY (
              enum_range(null::"EventType")::text[]
            )`,
  },
  {
    migration: "20260430193600_add_nlu_contacto_iniciado_event",
    kind: "any",
    description: "EventType NLU_CONTACTO_INICIADO",
    query: `select 1 as exists where 'NLU_CONTACTO_INICIADO' = ANY (
              enum_range(null::"EventType")::text[]
            )`,
  },
  {
    migration: "20260506132000_add_statefox_image_cache",
    kind: "table",
    description: "tabla statefox_image_cache",
    query: `select 1 as exists from information_schema.tables
            where table_schema = 'public' and table_name = 'statefox_image_cache' limit 1`,
  },
  {
    migration: "20260506145000_add_portal_warm_session",
    kind: "table",
    description: "tabla portal_warm_sessions",
    query: `select 1 as exists from information_schema.tables
            where table_schema = 'public' and table_name = 'portal_warm_sessions' limit 1`,
  },
  {
    migration: "20260506163809_add_market_property_review_required",
    kind: "column",
    description: "market_listings.reviewRequired",
    query: `select 1 as exists from information_schema.columns
            where table_schema = 'public' and table_name = 'market_listings'
            and column_name = 'reviewRequired' limit 1`,
  },
  {
    migration: "20260506180000_add_market_core",
    kind: "table",
    description: "tabla market_listings (core)",
    query: `select 1 as exists from information_schema.tables
            where table_schema = 'public' and table_name = 'market_listings' limit 1`,
  },
  {
    migration: "20260506201000_add_market_advertiser",
    kind: "table",
    description: "tabla market_advertisers",
    query: `select 1 as exists from information_schema.tables
            where table_schema = 'public' and table_name = 'market_advertisers' limit 1`,
  },
  {
    migration: "20260507020000_add_market_push_inmovilla",
    kind: "column",
    description: "market_advertisers.inmovillaContactId (col)",
    query: `select 1 as exists from information_schema.columns
            where table_schema = 'public' and table_name = 'market_advertisers'
            and column_name = 'inmovillaContactId' limit 1`,
  },
  {
    migration: "20260507071000_add_market_listing_assignment",
    kind: "column",
    description: "market_listings.assignedComercialId",
    query: `select 1 as exists from information_schema.columns
            where table_schema = 'public' and table_name = 'market_listings'
            and column_name = 'assignedComercialId' limit 1`,
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const results: Array<{
      migration: string;
      kind: string;
      description: string;
      exists: boolean;
    }> = [];

    for (const probe of PROBES) {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ exists: number }>>(probe.query);
        results.push({
          migration: probe.migration,
          kind: probe.kind,
          description: probe.description,
          exists: rows.length > 0,
        });
      } catch (err) {
        results.push({
          migration: probe.migration,
          kind: probe.kind,
          description: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
          exists: false,
        });
      }
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
