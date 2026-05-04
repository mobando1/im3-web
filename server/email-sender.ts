import { Resend } from "resend";
import { log } from "./index";
import { db } from "./db";
import { sentEmails, notifications } from "@shared/schema";

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.ANTHROPIC_API_KEY);
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ messageId: string } | null> {
  const client = getResend();
  if (!client) {
    log("Resend not configured — email not sent");
    return null;
  }

  // Safety net: validate email format before calling Resend to avoid 422 errors
  const emailValid = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(to);
  if (!emailValid) {
    log(`Email inválido, no se envía: "${to}"`);
    return null;
  }

  const from = process.env.EMAIL_FROM || "IM3 Systems <info@im3systems.com>";

  const { data, error } = await client.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    log(`Error enviando email a ${to}: ${error.message}`);
    throw new Error(error.message);
  }

  log(`Email enviado a ${to}: "${subject}" (${data?.id})`);
  return { messageId: data?.id || "" };
}

/**
 * Envía una notificación al admin (typically `info@im3systems.com`) por email
 * con tracking en `sent_emails` + fallback a notificación interna persistente
 * si Resend falla. Usar para alertas críticas (nuevo lead, suscriptor, conversión)
 * en lugar de `sendEmail` directo, para tener auditoría completa.
 */
export async function sendAdminNotification(opts: {
  subject: string;
  html: string;
  /** ID del contact relacionado (si aplica) — para vincular el notification al CRM. */
  contactId?: string | null;
  /**
   * Tipo de notificación interna a crear si el email falla. Defaults a "admin_alert".
   * Casos típicos: "new_lead", "newsletter_subscribed", "lead_converted".
   */
  fallbackType?: string;
  /** Título corto para la notificación interna (cuando el email falla). */
  fallbackTitle?: string;
  /** Descripción corta para la notificación interna. */
  fallbackDescription?: string;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
  const sentAt = new Date();
  let messageId: string | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    const result = await sendEmail(adminEmail, opts.subject, opts.html);
    messageId = result?.messageId || null;
    success = !!result;
  } catch (err: any) {
    errorMessage = err?.message || String(err);
    log(`[sendAdminNotification] envío falló: ${errorMessage}`);
  }

  // Track en sent_emails (auditoría)
  if (db) {
    await db
      .insert(sentEmails)
      .values({
        contactId: opts.contactId ?? null,
        templateId: "admin-notification",
        subject: opts.subject,
        body: opts.html,
        status: success ? "sent" : "failed",
        scheduledFor: sentAt,
        sentAt: success ? sentAt : null,
        resendMessageId: messageId,
      })
      .catch((e) => log(`[sendAdminNotification] no pudo trackear en sent_emails: ${e}`));
  }

  // Fallback persistente: si el email no salió, crear notification interna
  // para que el admin lo vea en el dashboard aunque Resend falle.
  if (!success && db) {
    await db
      .insert(notifications)
      .values({
        type: opts.fallbackType || "admin_alert",
        title: opts.fallbackTitle || opts.subject,
        description: opts.fallbackDescription || `Email al admin falló: ${errorMessage || "razón desconocida"}`,
        contactId: opts.contactId ?? null,
      })
      .catch((e) => log(`[sendAdminNotification] no pudo crear notification interna: ${e}`));
  }
}
