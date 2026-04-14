/**
 * Standalone diagnostic script for Google Calendar integration.
 * Runs createCalendarEvent with a test event and captures the exact error.
 *
 * Usage:
 *   npx tsx scripts/diagnose-calendar.ts
 */

import { google } from "googleapis";
import { readFileSync } from "fs";
import { resolve } from "path";

// Minimal .env loader (sin dotenv)
try {
  const envPath = resolve(process.cwd(), ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch (_) {}

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function fmtErr(err: any) {
  return {
    message: err?.message,
    code: err?.code,
    status: err?.response?.status,
    errors: err?.errors,
    data: err?.response?.data,
  };
}

async function main() {
  console.log("=== Google Calendar Diagnostic ===\n");

  // 1. Check env vars
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const impersonate = process.env.GOOGLE_DRIVE_IMPERSONATE;

  console.log("1. Env vars:");
  console.log(`   GOOGLE_SERVICE_ACCOUNT_EMAIL: ${email ? "✓ set" : "✗ missing"} ${email ? `(${email})` : ""}`);
  console.log(`   GOOGLE_PRIVATE_KEY:           ${key ? `✓ set (${key.length} chars)` : "✗ missing"}`);
  console.log(`   GOOGLE_DRIVE_IMPERSONATE:     ${impersonate ? `✓ set (${impersonate})` : "✗ missing"}`);

  if (!email || !key) {
    console.error("\n✗ Credenciales básicas faltantes. No puedo continuar.");
    process.exit(1);
  }

  // 2. Try to get auth token (without impersonation)
  console.log("\n2. Auth sin impersonation (service account puro):");
  try {
    const authNoImp = new google.auth.JWT({
      email,
      key: key.replace(/\\n/g, "\n"),
      scopes: SCOPES,
    });
    await authNoImp.authorize();
    console.log("   ✓ Token obtenido OK (service account puede autenticar)");
  } catch (err) {
    console.error("   ✗ Falló auth puro:", fmtErr(err));
  }

  // 3. Try with impersonation (como lo usa el código en producción)
  console.log(`\n3. Auth con impersonation (subject=${impersonate}):`);
  let authImp: any = null;
  try {
    authImp = new google.auth.JWT({
      email,
      key: key.replace(/\\n/g, "\n"),
      scopes: SCOPES,
      subject: impersonate || undefined,
    });
    await authImp.authorize();
    console.log("   ✓ Token obtenido con impersonation");
  } catch (err) {
    console.error("   ✗ Falló impersonation:", fmtErr(err));
    console.error("\n   💡 Este es el error más probable: el domain-wide delegation");
    console.error("      para este service account NO incluye el scope de Calendar.");
    console.error("      Fix: Admin Console de Google Workspace → Seguridad → Controles API → ");
    console.error("      Delegación de todo el dominio → editar el client ID del service account");
    console.error("      y añadir: https://www.googleapis.com/auth/calendar");
    process.exit(1);
  }

  // 4. Try listing calendars (low-risk read)
  console.log("\n4. calendars.list (read-only):");
  try {
    const calendar = google.calendar({ version: "v3", auth: authImp });
    const list = await calendar.calendarList.list({ maxResults: 5 });
    console.log(`   ✓ ${list.data.items?.length ?? 0} calendario(s) visibles`);
    list.data.items?.forEach((c) => console.log(`      - ${c.summary} (${c.id})`));
  } catch (err) {
    console.error("   ✗ calendars.list falló:", fmtErr(err));
  }

  // 5. Try creating an event (like the real code does)
  console.log("\n5. events.insert (CREATE evento con Meet):");
  try {
    const calendar = google.calendar({ version: "v3", auth: authImp });
    const now = new Date();
    const start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // en 7 días
    start.setHours(23, 0, 0, 0); // 11 PM para no molestar
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 15); // corta

    const event = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: "[TEST DIAGNOSTIC] Eliminar este evento",
        description: "Evento de prueba del script diagnose-calendar.ts. Seguro eliminar.",
        start: { dateTime: start.toISOString(), timeZone: "America/Bogota" },
        end: { dateTime: end.toISOString(), timeZone: "America/Bogota" },
        conferenceData: {
          createRequest: {
            requestId: `diagnostic-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const meetLink = event.data.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video"
    )?.uri;
    const confStatus = event.data.conferenceData?.createRequest?.status?.statusCode;

    console.log(`   ✓ Evento creado: ${event.data.id}`);
    console.log(`   Meet link: ${meetLink || "(no generado aún)"}`);
    console.log(`   Conference status: ${confStatus}`);

    // Cleanup: eliminar el evento test
    if (event.data.id) {
      await calendar.events.delete({ calendarId: "primary", eventId: event.data.id });
      console.log("   ✓ Evento de prueba eliminado");
    }

    console.log("\n✅ CALENDAR FUNCIONA. El bug debe estar en los datos específicos del intake.");
  } catch (err: any) {
    console.error("   ✗ events.insert FALLÓ:", fmtErr(err));
    console.error("\n   💡 Este ES el error que afecta producción.");
    if (err?.code === 403 || err?.response?.status === 403) {
      console.error("      403 Forbidden → API no habilitada o scope insuficiente");
      console.error("      Fix 1: Google Cloud Console → APIs & Services → Library → habilitar Google Calendar API");
      console.error("      Fix 2: Verificar scope 'https://www.googleapis.com/auth/calendar' en domain-wide delegation");
    } else if (err?.code === 404 || err?.response?.status === 404) {
      console.error("      404 → calendarId 'primary' no existe para el user impersonado");
    } else if (err?.message?.includes("invalid_grant")) {
      console.error("      invalid_grant → el user impersonado no existe en el workspace, o no autorizado");
    }
  }
}

main().catch((err) => {
  console.error("\n✗ Error inesperado:", err);
  process.exit(1);
});
