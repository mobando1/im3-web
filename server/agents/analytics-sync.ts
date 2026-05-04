import { db } from "../db";
import { clientAnalyticsConnections, clientAnalyticsDaily } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { fetchDailyMetrics, yesterdayInTimezone, isGoogleAnalyticsConfigured } from "../google-analytics";
import { log } from "../index";

/**
 * Sync diario: para cada conexión `connected`, pulla métricas del día anterior
 * en la zona horaria de la propiedad GA4 y hace upsert en `client_analytics_daily`.
 *
 * Designed to be called from the cron scheduler envuelto en `runAgent()`.
 * Devuelve `{ recordsProcessed }` para que el runner lo persista en `agent_runs`.
 */
export async function runAnalyticsSync(): Promise<{ recordsProcessed: number }> {
  if (!db || !isGoogleAnalyticsConfigured()) return { recordsProcessed: 0 };

  const conns = await db
    .select()
    .from(clientAnalyticsConnections)
    .where(eq(clientAnalyticsConnections.status, "connected"));

  let processed = 0;
  for (const conn of conns) {
    const tz = conn.propertyTimezone || "America/Bogota";
    const date = yesterdayInTimezone(tz);
    try {
      const metrics = await fetchDailyMetrics(conn.ga4PropertyId, date);
      if (!metrics) continue;
      await db
        .insert(clientAnalyticsDaily)
        .values({
          clientProjectId: conn.clientProjectId,
          date: metrics.date,
          sessions: metrics.sessions,
          users: metrics.users,
          newUsers: metrics.newUsers,
          pageviews: metrics.pageviews,
          avgSessionDuration: metrics.avgSessionDuration.toFixed(2),
          bounceRate: metrics.bounceRate.toFixed(4),
          topPages: metrics.topPages,
          topSources: metrics.topSources,
          topCountries: metrics.topCountries,
        })
        .onConflictDoUpdate({
          target: [clientAnalyticsDaily.clientProjectId, clientAnalyticsDaily.date],
          set: {
            sessions: metrics.sessions,
            users: metrics.users,
            newUsers: metrics.newUsers,
            pageviews: metrics.pageviews,
            avgSessionDuration: metrics.avgSessionDuration.toFixed(2),
            bounceRate: metrics.bounceRate.toFixed(4),
            topPages: metrics.topPages,
            topSources: metrics.topSources,
            topCountries: metrics.topCountries,
          },
        });
      await db
        .update(clientAnalyticsConnections)
        .set({ lastSyncedAt: sql`now()`, lastError: null, updatedAt: sql`now()` })
        .where(eq(clientAnalyticsConnections.id, conn.id));
      processed += 1;
    } catch (err: any) {
      const msg = err?.message || String(err);
      log(`[analytics-sync] error syncing project=${conn.clientProjectId} property=${conn.ga4PropertyId}: ${msg}`);
      await db
        .update(clientAnalyticsConnections)
        .set({ status: "error", lastError: msg, updatedAt: sql`now()` })
        .where(eq(clientAnalyticsConnections.id, conn.id))
        .catch(() => {});
    }
  }

  return { recordsProcessed: processed };
}

/**
 * Backfill al momento de conectar una propiedad nueva — pulla los últimos
 * `days` días para que el dashboard del cliente tenga datos inmediatos.
 */
export async function backfillAnalytics(
  clientProjectId: string,
  ga4PropertyId: string,
  timezone: string,
  days = 30,
): Promise<{ recordsProcessed: number }> {
  if (!db || !isGoogleAnalyticsConfigured()) return { recordsProcessed: 0 };

  const fmt = (d: Date) => {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = f.formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const dd = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${dd}`;
  };

  let processed = 0;
  // Itera de hace `days` días hasta ayer (no hoy — GA4 reporta el día actual a medias)
  for (let i = days; i >= 1; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const date = fmt(d);
    try {
      const metrics = await fetchDailyMetrics(ga4PropertyId, date);
      if (!metrics) continue;
      await db
        .insert(clientAnalyticsDaily)
        .values({
          clientProjectId,
          date: metrics.date,
          sessions: metrics.sessions,
          users: metrics.users,
          newUsers: metrics.newUsers,
          pageviews: metrics.pageviews,
          avgSessionDuration: metrics.avgSessionDuration.toFixed(2),
          bounceRate: metrics.bounceRate.toFixed(4),
          topPages: metrics.topPages,
          topSources: metrics.topSources,
          topCountries: metrics.topCountries,
        })
        .onConflictDoUpdate({
          target: [clientAnalyticsDaily.clientProjectId, clientAnalyticsDaily.date],
          set: {
            sessions: metrics.sessions,
            users: metrics.users,
            newUsers: metrics.newUsers,
            pageviews: metrics.pageviews,
            avgSessionDuration: metrics.avgSessionDuration.toFixed(2),
            bounceRate: metrics.bounceRate.toFixed(4),
            topPages: metrics.topPages,
            topSources: metrics.topSources,
            topCountries: metrics.topCountries,
          },
        });
      processed += 1;
    } catch (err: any) {
      log(`[analytics-backfill] skip ${date} property=${ga4PropertyId}: ${err?.message || err}`);
    }
  }

  await db
    .update(clientAnalyticsConnections)
    .set({ lastSyncedAt: sql`now()`, lastError: null, updatedAt: sql`now()` })
    .where(eq(clientAnalyticsConnections.clientProjectId, clientProjectId))
    .catch(() => {});

  return { recordsProcessed: processed };
}
