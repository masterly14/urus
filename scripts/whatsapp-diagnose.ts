/**
 * Diagnóstico de configuración WhatsApp Cloud API.
 *
 * Verifica:
 * 1. Token válido (GET /me)
 * 2. Phone Number ID → muestra display_phone_number y verified_name
 * 3. WABA subscribed_apps → verifica que tu app esté suscrita
 * 4. Phone Number subscribed_apps → verifica suscripción a nivel de número
 * 5. Registra el phone number si no está registrado
 *
 * Uso: npx tsx scripts/whatsapp-diagnose.ts
 */

import "dotenv/config";

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const WABA_ID = process.env.WHATSAPP_BUSINESS_ID?.trim();
const API_VERSION = "v20.0";

async function graphGet(endpoint: string): Promise<{ ok: boolean; data: unknown; status: number }> {
  const url = `https://graph.facebook.com/${API_VERSION}/${endpoint}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const data = await response.json();
  return { ok: response.ok, data, status: response.status };
}

async function graphPost(endpoint: string, body?: Record<string, unknown>): Promise<{ ok: boolean; data: unknown; status: number }> {
  const url = `https://graph.facebook.com/${API_VERSION}/${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { ok: response.ok, data, status: response.status };
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function main(): Promise<void> {
  if (!ACCESS_TOKEN) {
    console.error("Falta WHATSAPP_ACCESS_TOKEN en .env");
    process.exitCode = 1;
    return;
  }

  console.log("IDs configurados en .env:");
  console.log(`  WHATSAPP_PHONE_NUMBER_ID = ${PHONE_NUMBER_ID || "(vacío)"}`);
  console.log(`  WHATSAPP_BUSINESS_ID     = ${WABA_ID || "(vacío)"}`);

  // 1. Verificar token
  section("1. Verificar token (GET /me)");
  const me = await graphGet("me");
  if (me.ok) {
    const d = me.data as Record<string, unknown>;
    console.log(`[OK] Token válido. App/User: ${d.name ?? d.id}`);
  } else {
    console.error("[FAIL] Token inválido o expirado:", JSON.stringify(me.data, null, 2));
    process.exitCode = 1;
    return;
  }

  // 2. Verificar Phone Number ID
  if (PHONE_NUMBER_ID) {
    section("2. Phone Number ID (GET /{phone_number_id})");
    const pn = await graphGet(`${PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating,platform_type,name_status,code_verification_status`);
    if (pn.ok) {
      const d = pn.data as Record<string, unknown>;
      console.log("[OK] Phone Number encontrado:");
      console.log(`  display_phone_number: ${d.display_phone_number}`);
      console.log(`  verified_name:        ${d.verified_name}`);
      console.log(`  quality_rating:       ${d.quality_rating}`);
      console.log(`  platform_type:        ${d.platform_type}`);
      console.log(`  name_status:          ${d.name_status}`);
      console.log(`  code_verification:    ${d.code_verification_status}`);
    } else {
      console.error("[FAIL] No se pudo obtener info del Phone Number ID:");
      console.error(JSON.stringify(pn.data, null, 2));
    }

    // 2b. Verificar suscripción del phone number
    section("2b. Phone Number subscribed_apps");
    const pnSub = await graphGet(`${PHONE_NUMBER_ID}/subscribed_apps`);
    console.log(pnSub.ok ? "[OK]" : "[FAIL]", JSON.stringify(pnSub.data, null, 2));
  }

  // 3. Verificar WABA
  if (WABA_ID) {
    section("3. WABA (GET /{waba_id})");
    const waba = await graphGet(`${WABA_ID}?fields=name,id,account_review_status,on_behalf_of_business_info`);
    if (waba.ok) {
      const d = waba.data as Record<string, unknown>;
      console.log("[OK] WABA encontrado:");
      console.log(`  id:   ${d.id}`);
      console.log(`  name: ${d.name}`);
      console.log(`  account_review_status: ${d.account_review_status}`);
    } else {
      console.error("[FAIL] No se pudo obtener info del WABA:");
      console.error(JSON.stringify(waba.data, null, 2));
      console.log("\n[HINT] El WABA ID puede no ser correcto. En la captura de Meta se ve business_id=1566185071223988");
      console.log("       Prueba poner WHATSAPP_BUSINESS_ID=1566185071223988 en .env");
    }

    // 3b. Verificar suscripción del WABA
    section("3b. WABA subscribed_apps");
    const wabaSub = await graphGet(`${WABA_ID}/subscribed_apps`);
    console.log(wabaSub.ok ? "[OK]" : "[FAIL]", JSON.stringify(wabaSub.data, null, 2));

    if (wabaSub.ok) {
      const data = wabaSub.data as { data?: Array<Record<string, unknown>> };
      if (!data.data || data.data.length === 0) {
        console.log("\n[WARN] Tu WABA NO tiene ninguna app suscrita para webhooks.");
        console.log("       Suscribiendo ahora...");
        const sub = await graphPost(`${WABA_ID}/subscribed_apps`);
        console.log(sub.ok ? "[OK] Suscripción exitosa:" : "[FAIL]", JSON.stringify(sub.data, null, 2));
      }
    }

    // 3c. Phone numbers del WABA
    section("3c. Phone numbers en este WABA");
    const phones = await graphGet(`${WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`);
    if (phones.ok) {
      const d = phones.data as { data?: Array<Record<string, unknown>> };
      if (d.data && d.data.length > 0) {
        for (const phone of d.data) {
          console.log(`  - id=${phone.id}  display=${phone.display_phone_number}  name=${phone.verified_name}  quality=${phone.quality_rating}`);
          if (String(phone.id) !== PHONE_NUMBER_ID) {
            console.log(`    [WARN] Este phone number ID (${phone.id}) NO coincide con WHATSAPP_PHONE_NUMBER_ID (${PHONE_NUMBER_ID})`);
          }
        }
      } else {
        console.log("  (ningún número encontrado en este WABA)");
      }
    } else {
      console.error("[FAIL]", JSON.stringify(phones.data, null, 2));
    }
  }

  // 4. Intentar con el WABA ID visto en la captura
  const ALT_WABA = "1566185071223988";
  if (WABA_ID !== ALT_WABA) {
    section(`4. Probar WABA alternativo (${ALT_WABA} — de la captura de pantalla)`);
    const altWaba = await graphGet(`${ALT_WABA}?fields=name,id,account_review_status`);
    if (altWaba.ok) {
      const d = altWaba.data as Record<string, unknown>;
      console.log("[OK] WABA alternativo encontrado:");
      console.log(`  id:   ${d.id}`);
      console.log(`  name: ${d.name}`);
      console.log(`  account_review_status: ${d.account_review_status}`);

      const altPhones = await graphGet(`${ALT_WABA}/phone_numbers?fields=id,display_phone_number,verified_name`);
      if (altPhones.ok) {
        const pd = altPhones.data as { data?: Array<Record<string, unknown>> };
        for (const phone of pd.data ?? []) {
          console.log(`  - phone id=${phone.id}  display=${phone.display_phone_number}  name=${phone.verified_name}`);
        }
      }

      const altSub = await graphGet(`${ALT_WABA}/subscribed_apps`);
      console.log("\nsubscribed_apps:", JSON.stringify(altSub.data, null, 2));
      const subData = altSub.data as { data?: Array<Record<string, unknown>> };
      if (!subData.data || subData.data.length === 0) {
        console.log("[WARN] WABA alternativo tampoco tiene app suscrita. Suscribiendo...");
        const sub = await graphPost(`${ALT_WABA}/subscribed_apps`);
        console.log(sub.ok ? "[OK]" : "[FAIL]", JSON.stringify(sub.data, null, 2));
      }
    } else {
      console.log("[INFO] WABA alternativo no accesible con este token.");
    }
  }

  // 5. Registrar phone number (por si no está registrado)
  if (PHONE_NUMBER_ID) {
    section("5. Registrar phone number (POST register)");
    const reg = await graphPost(`${PHONE_NUMBER_ID}/register`, {
      messaging_product: "whatsapp",
      pin: "000000",
    });
    if (reg.ok) {
      console.log("[OK] Phone number registrado (o ya estaba):", JSON.stringify(reg.data, null, 2));
    } else {
      const d = reg.data as { error?: { message?: string; code?: number } };
      if (d.error?.code === 10) {
        console.log("[OK] Ya estaba registrado (error code 10, esperado).");
      } else {
        console.log("[INFO] Resultado:", JSON.stringify(reg.data, null, 2));
      }
    }
  }

  section("RESUMEN");
  console.log("Si 'messages' no llegan de números reales:");
  console.log("  1. La app DEBE estar en modo LIVE (no Development).");
  console.log("     En tu captura dice 'Modo de la app: Desarrollo'.");
  console.log("     -> Meta Developers > App > Configuración > Modo de la app > Live");
  console.log("  2. El WABA debe tener la app suscrita (paso 3b arriba).");
  console.log("  3. Si sigues en Development, añade +573113541077 como");
  console.log("     número de prueba en WhatsApp > Configuración de la API > Para.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
