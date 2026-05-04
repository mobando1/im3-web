import { db } from "../db";
import {
  clientAnalyticsConnections,
  clientAnalyticsDaily,
  clientProjects,
  clientUsers,
  clientUserProjects,
} from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { previousMonthRange } from "../google-analytics";
import { createMagicToken, magicLinkUrl } from "../client-auth";
import { sendEmail } from "../email-sender";
import { buildProjectNotificationEmail } from "../email-ai";
import { log } from "../index";

/**
 * Email mensual con resumen de analytics. Corre el día 1 de cada mes (~9 AM Bogotá).
 *
 * Para cada proyecto con conexión `connected`:
 *   1. Suma métricas del mes anterior desde `client_analytics_daily`
 *   2. Compara con mes pre-anterior para calcular tendencia
 *   3. Envía email a cada `client_user` linkeado con magic link → /portal/projects/:id/analytics
 */
export async function runAnalyticsMonthlyReport(): Promise<{ recordsProcessed: number }> {
  if (!db) return { recordsProcessed: 0 };

  const conns = await db
    .select({
      conn: clientAnalyticsConnections,
      project: clientProjects,
    })
    .from(clientAnalyticsConnections)
    .innerJoin(clientProjects, eq(clientProjects.id, clientAnalyticsConnections.clientProjectId))
    .where(eq(clientAnalyticsConnections.status, "connected"));

  let processed = 0;

  for (const { conn, project } of conns) {
    const tz = conn.propertyTimezone || "America/Bogota";
    const { startDate, endDate, label: monthLabel } = previousMonthRange(tz);

    // Mes pre-anterior (para comparativa) — calculado restando un mes a startDate
    const [yStr, mStr] = startDate.split("-");
    let prevYear = Number(yStr);
    let prevMonth = Number(mStr) - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const lastDayPrev = new Date(prevYear, prevMonth, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const prevStartDate = `${prevYear}-${pad(prevMonth)}-01`;
    const prevEndDate = `${prevYear}-${pad(prevMonth)}-${pad(lastDayPrev)}`;

    // Sumas
    const monthRows = await db
      .select()
      .from(clientAnalyticsDaily)
      .where(
        and(
          eq(clientAnalyticsDaily.clientProjectId, project.id),
          gte(clientAnalyticsDaily.date, startDate),
          lte(clientAnalyticsDaily.date, endDate),
        ),
      );
    const prevMonthRows = await db
      .select()
      .from(clientAnalyticsDaily)
      .where(
        and(
          eq(clientAnalyticsDaily.clientProjectId, project.id),
          gte(clientAnalyticsDaily.date, prevStartDate),
          lte(clientAnalyticsDaily.date, prevEndDate),
        ),
      );

    if (monthRows.length === 0) {
      log(`[analytics-monthly-report] skip ${project.id} — no data for ${monthLabel}`);
      continue;
    }

    const sum = (rows: typeof monthRows, key: "sessions" | "users" | "pageviews") =>
      rows.reduce((acc, r) => acc + (r[key] || 0), 0);
    const monthSessions = sum(monthRows, "sessions");
    const monthUsers = sum(monthRows, "users");
    const monthPageviews = sum(monthRows, "pageviews");
    const prevSessions = sum(prevMonthRows, "sessions");

    const delta = prevSessions > 0
      ? Math.round(((monthSessions - prevSessions) / prevSessions) * 100)
      : null;

    // Top página agregada del mes
    const pageMap = new Map<string, number>();
    for (const r of monthRows) {
      for (const p of r.topPages || []) {
        pageMap.set(p.path, (pageMap.get(p.path) || 0) + p.pageviews);
      }
    }
    const topPage = Array.from(pageMap.entries())
      .sort(([, a], [, b]) => b - a)[0]?.[0] || "(sin datos)";

    const sourceMap = new Map<string, number>();
    for (const r of monthRows) {
      for (const s of r.topSources || []) {
        sourceMap.set(s.source, (sourceMap.get(s.source) || 0) + s.sessions);
      }
    }
    const topSource = Array.from(sourceMap.entries())
      .sort(([, a], [, b]) => b - a)[0]?.[0] || "(sin datos)";

    // Recipients = todos los client_users linkeados
    const recipients = await db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        name: clientUsers.name,
        status: clientUsers.status,
      })
      .from(clientUserProjects)
      .innerJoin(clientUsers, eq(clientUsers.id, clientUserProjects.clientUserId))
      .where(eq(clientUserProjects.clientProjectId, project.id));

    for (const r of recipients) {
      if (r.status === "disabled") continue;
      try {
        const token = await createMagicToken({ clientUserId: r.id, clientProjectId: project.id });
        // El magic-link consume soporta ?next= para redirect post-login.
        const link = `${magicLinkUrl(token)}?next=${encodeURIComponent(`/portal/projects/${project.id}/analytics`)}`;

        const deltaLine = delta === null
          ? ""
          : delta >= 0
            ? `<strong>+${delta}%</strong> vs el mes anterior 📈`
            : `<strong>${delta}%</strong> vs el mes anterior 📉`;

        const html = buildProjectNotificationEmail({
          projectName: project.name,
          clientName: r.name || "cliente",
          title: `Resumen de analytics — ${monthLabel}`,
          headerEmoji: "📊",
          headerColor: "linear-gradient(135deg,#0F766E,#2FA4A9)",
          bodyLines: [
            `En <strong>${monthLabel}</strong> tu sitio tuvo:`,
            `<div style="background:#f8fafc;border-left:3px solid #2FA4A9;padding:14px 18px;border-radius:4px;margin:8px 0">
              <div style="font-size:22px;font-weight:600;color:#0F172A">${monthSessions.toLocaleString("es")} sesiones</div>
              <div style="font-size:13px;color:#64748B;margin-top:4px">${monthUsers.toLocaleString("es")} usuarios únicos · ${monthPageviews.toLocaleString("es")} páginas vistas</div>
              ${deltaLine ? `<div style="font-size:12px;color:#475569;margin-top:8px">${deltaLine}</div>` : ""}
            </div>`,
            `<strong>Página más visitada:</strong> <code>${topPage}</code>`,
            `<strong>Fuente principal de tráfico:</strong> ${topSource}`,
            "Entra al portal para ver el detalle día a día y comparativas completas.",
          ],
          ctaText: "Ver dashboard completo →",
          ctaUrl: link,
          footerNote: "Recibes este resumen automáticamente cada mes. Puedes ajustar tus preferencias desde el portal.",
        });

        sendEmail(r.email, `📊 ${project.name} — Analytics de ${monthLabel}`, html)
          .catch((err) => log(`[analytics-monthly-report] sendEmail to ${r.email} failed: ${err}`));
        processed += 1;
      } catch (err: any) {
        log(`[analytics-monthly-report] error preparing email for ${r.email}: ${err?.message || err}`);
      }
    }
  }

  return { recordsProcessed: processed };
}
