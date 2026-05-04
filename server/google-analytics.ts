import { google, analyticsdata_v1beta } from "googleapis";
import { log } from "./index";

// Scope read-only para la GA4 Data API. NO usa impersonación (a diferencia de
// Gmail/Drive/Calendar) — el service account se autentica directamente y el
// cliente lo agrega como Viewer en su propiedad GA4.
const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

export function isGoogleAnalyticsConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) return null;
  return new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: SCOPES,
    // Sin `subject` — no impersonación.
  });
}

function getClient(): analyticsdata_v1beta.Analyticsdata | null {
  const auth = getAuth();
  if (!auth) return null;
  return google.analyticsdata({ version: "v1beta", auth });
}

/** Format Date → "YYYY-MM-DD" en UTC (GA acepta también "today"/"yesterday"/"NdaysAgo"). */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type DailyMetrics = {
  date: string; // YYYY-MM-DD
  sessions: number;
  users: number;
  newUsers: number;
  pageviews: number;
  avgSessionDuration: number; // segundos
  bounceRate: number; // 0..1
  topPages: Array<{ path: string; pageviews: number }>;
  topSources: Array<{ source: string; sessions: number }>;
  topCountries: Array<{ country: string; users: number }>;
};

/**
 * Verifica que el service account tenga acceso a la propiedad GA4.
 * Hace una query mínima de 1 día. Devuelve la metadata de la propiedad
 * incluyendo timezone (necesario para guardar en `client_analytics_connections`).
 */
export async function testConnection(ga4PropertyId: string): Promise<{
  ok: true;
  timezone: string;
} | { ok: false; error: string; status?: number }> {
  const client = getClient();
  if (!client) return { ok: false, error: "Google Analytics no está configurado en el servidor" };

  try {
    const res = await client.properties.runReport({
      property: `properties/${ga4PropertyId}`,
      requestBody: {
        dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
        metrics: [{ name: "sessions" }],
        limit: "1",
      },
    });
    // Si no tira error, el service account tiene acceso. La metadata.timeZone trae la zona.
    const timezone = (res.data.metadata?.timeZone as string) || "UTC";
    return { ok: true, timezone };
  } catch (err: any) {
    const status = err?.response?.status || err?.code;
    const msg = err?.response?.data?.error?.message || err?.message || "Error desconocido";
    log(`[google-analytics] testConnection failed for ${ga4PropertyId}: ${msg}`);
    return { ok: false, error: msg, status };
  }
}

/**
 * Pull métricas del día especificado (formato YYYY-MM-DD, en zona de la propiedad).
 * Hace 4 queries: métricas overall, top pages, top sources, top countries.
 */
export async function fetchDailyMetrics(
  ga4PropertyId: string,
  date: string,
): Promise<DailyMetrics | null> {
  const client = getClient();
  if (!client) return null;
  const property = `properties/${ga4PropertyId}`;

  try {
    const [overallRes, pagesRes, sourcesRes, countriesRes] = await Promise.all([
      client.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: date, endDate: date }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "newUsers" },
            { name: "screenPageViews" },
            { name: "averageSessionDuration" },
            { name: "bounceRate" },
          ],
          limit: "1",
        },
      }),
      client.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: date, endDate: date }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: "5",
        },
      }),
      client.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: date, endDate: date }],
          dimensions: [{ name: "sessionSource" }],
          metrics: [{ name: "sessions" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: "5",
        },
      }),
      client.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: date, endDate: date }],
          dimensions: [{ name: "country" }],
          metrics: [{ name: "totalUsers" }],
          orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
          limit: "5",
        },
      }),
    ]);

    const row = overallRes.data.rows?.[0]?.metricValues || [];
    const num = (i: number) => Number(row[i]?.value || 0);

    const topPages = (pagesRes.data.rows || []).map((r) => ({
      path: r.dimensionValues?.[0]?.value || "/",
      pageviews: Number(r.metricValues?.[0]?.value || 0),
    }));
    const topSources = (sourcesRes.data.rows || []).map((r) => ({
      source: r.dimensionValues?.[0]?.value || "(direct)",
      sessions: Number(r.metricValues?.[0]?.value || 0),
    }));
    const topCountries = (countriesRes.data.rows || []).map((r) => ({
      country: r.dimensionValues?.[0]?.value || "(unknown)",
      users: Number(r.metricValues?.[0]?.value || 0),
    }));

    return {
      date,
      sessions: Math.round(num(0)),
      users: Math.round(num(1)),
      newUsers: Math.round(num(2)),
      pageviews: Math.round(num(3)),
      avgSessionDuration: num(4),
      bounceRate: num(5), // ya viene como 0..1
      topPages,
      topSources,
      topCountries,
    };
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err?.message || "Error";
    log(`[google-analytics] fetchDailyMetrics failed for ${ga4PropertyId} ${date}: ${msg}`);
    throw new Error(msg);
  }
}

/** Devuelve la fecha "ayer" en formato YYYY-MM-DD para una zona horaria dada. */
export function yesterdayInTimezone(timezone: string): string {
  // Intl-based — soporta cualquier IANA tz.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/** Devuelve [startDate, endDate] del mes anterior (YYYY-MM-DD) para zona horaria. */
export function previousMonthRange(timezone: string): { startDate: string; endDate: string; label: string } {
  const fmtParts = (d: Date) => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(d);
    return {
      y: Number(parts.find((p) => p.type === "year")?.value),
      m: Number(parts.find((p) => p.type === "month")?.value),
      d: Number(parts.find((p) => p.type === "day")?.value),
    };
  };
  const today = fmtParts(new Date());
  // Mes anterior: si estamos en mayo (5), queremos abril (4)
  let prevYear = today.y;
  let prevMonth = today.m - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const lastDay = new Date(prevYear, prevMonth, 0).getDate(); // último día del mes prev
  const pad = (n: number) => String(n).padStart(2, "0");
  const startDate = `${prevYear}-${pad(prevMonth)}-01`;
  const endDate = `${prevYear}-${pad(prevMonth)}-${pad(lastDay)}`;
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const label = `${monthNames[prevMonth - 1]} ${prevYear}`;
  return { startDate, endDate, label };
}
