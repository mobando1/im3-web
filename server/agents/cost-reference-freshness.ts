import { statSync } from "fs";
import { resolve } from "path";
import { db } from "../db";
import { notifications } from "@shared/schema";
import { sendEmail, isEmailConfigured } from "../email-sender";
import { log } from "../index";

/**
 * Cost Reference Freshness Checker.
 * Revisa la antigüedad del archivo shared/proposal-cost-reference.md.
 * Si no se ha actualizado en >180 días, alerta al admin porque los precios
 * del stack (Railway, Claude, Resend, etc.) podrían haber cambiado.
 *
 * Runs: mensual (día 1 a las 9am COT).
 */
export async function runCostReferenceFreshness(): Promise<{ recordsProcessed: number; metadata?: Record<string, unknown> }> {
  const costRefPath = resolve(process.cwd(), "shared/proposal-cost-reference.md");

  let mtime: Date;
  try {
    const stats = statSync(costRefPath);
    mtime = stats.mtime;
  } catch (err) {
    log(`[cost-freshness] cost reference file not found at ${costRefPath}`);
    return { recordsProcessed: 0, metadata: { error: "file_not_found" } };
  }

  const now = Date.now();
  const fileAge = now - mtime.getTime();
  const daysOld = Math.floor(fileAge / (24 * 60 * 60 * 1000));

  const STALE_THRESHOLD_DAYS = 180;

  if (daysOld < STALE_THRESHOLD_DAYS) {
    return {
      recordsProcessed: 0,
      metadata: { daysOld, status: "fresh", lastUpdate: mtime.toISOString() },
    };
  }

  // Archivo viejo — alertar
  log(`[cost-freshness] cost reference is ${daysOld} days old — alerting admin`);

  const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";

  // Notification in-app
  if (db) {
    try {
      await db.insert(notifications).values({
        type: "cost_reference_stale",
        title: `💰 Actualiza los precios de referencia (${daysOld} días sin tocar)`,
        description: `El archivo shared/proposal-cost-reference.md tiene ${daysOld} días. Los precios de Railway/Claude/Resend/etc. pueden haber cambiado. Actualízalo antes de enviar más propuestas.`,
      });
    } catch (_) {}
  }

  // Email al admin
  if (isEmailConfigured()) {
    const html = `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
      <div style="background:#D97706;padding:20px 28px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;font-size:18px;margin:0">💰 Actualiza cost reference</h1>
        <p style="color:#fff;opacity:0.9;margin:4px 0 0;font-size:13px">${daysOld} días sin actualización</p>
      </div>
      <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
        <p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:#334155">
          El archivo <code style="background:#F1F5F9;padding:2px 6px;border-radius:4px">shared/proposal-cost-reference.md</code>
          tiene <strong>${daysOld} días</strong> sin actualizar (última modificación: ${mtime.toLocaleDateString("es-CO")}).
        </p>
        <p style="font-size:14px;line-height:1.5;margin:0 0 20px;color:#334155">
          Los precios de tu stack pueden haber cambiado — especialmente:
        </p>
        <ul style="font-size:13px;color:#475569;line-height:1.7;padding-left:20px;margin:0 0 24px">
          <li><strong>Railway</strong> — hosting + PostgreSQL tiers</li>
          <li><strong>Anthropic Claude</strong> — pricing per token (cambia con nuevos modelos)</li>
          <li><strong>Resend</strong> — tiers de emails/mes</li>
          <li><strong>Meta WhatsApp Cloud API</strong> — pricing por país</li>
          <li><strong>Google Workspace</strong> — planes Business Starter/Standard/Plus</li>
        </ul>
        <p style="font-size:13px;line-height:1.5;margin:0 0 20px;color:#334155">
          Revisa cada proveedor y actualiza los números. Las propuestas generadas con precios viejos pueden
          cotizar de menos al cliente — y esto daña la confianza cuando llegue la factura real.
        </p>
        <a href="${baseUrl}/admin/agents" style="display:inline-block;background:#D97706;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Ver dashboard de agentes →</a>
        <p style="color:#94A3B8;font-size:12px;margin-top:24px;text-align:center">— Cost Reference Freshness · IM3 Systems</p>
      </div>
    </div>`;

    await sendEmail(
      adminEmail,
      `💰 Actualiza cost reference — ${daysOld} días sin tocar`,
      html
    ).catch((e) => log(`[cost-freshness] could not send alert email: ${e}`));
  }

  return {
    recordsProcessed: 1,
    metadata: { daysOld, status: "stale", lastUpdate: mtime.toISOString() },
  };
}
