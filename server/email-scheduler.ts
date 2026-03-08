import cron from "node-cron";
import { db } from "./db";
import { sentEmails, emailTemplates, contacts, diagnostics, abandonedLeads } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { generateEmailContent, buildMicroReminderEmail } from "./email-ai";
import { sendEmail, isEmailConfigured } from "./email-sender";
import { log } from "./index";

const MAX_RETRIES = 3;

async function processEmailQueue() {
  if (!db || !isEmailConfigured()) return;

  try {
    const now = new Date();

    // Find pending emails that are due
    const pendingEmails = await db
      .select()
      .from(sentEmails)
      .where(
        and(
          eq(sentEmails.status, "pending"),
          lte(sentEmails.scheduledFor, now)
        )
      )
      .limit(10);

    if (pendingEmails.length === 0) return;

    log(`Procesando ${pendingEmails.length} email(s) pendientes`);

    for (const email of pendingEmails) {
      try {
        // Get contact
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, email.contactId));

        if (!contact) {
          log(`Contacto ${email.contactId} no encontrado — marcando como failed`);
          await db
            .update(sentEmails)
            .set({ status: "failed" })
            .where(eq(sentEmails.id, email.id));
          continue;
        }

        // Check opt-out
        if (contact.optedOut) {
          log(`Contacto ${contact.email} opted out — cancelando email`);
          await db
            .update(sentEmails)
            .set({ status: "failed" })
            .where(eq(sentEmails.id, email.id));
          continue;
        }

        // Get template
        const [template] = await db
          .select()
          .from(emailTemplates)
          .where(eq(emailTemplates.id, email.templateId));

        if (!template) {
          log(`Template ${email.templateId} no encontrado — marcando como failed`);
          await db
            .update(sentEmails)
            .set({ status: "failed" })
            .where(eq(sentEmails.id, email.id));
          continue;
        }

        // Get diagnostic data
        const [diagnostic] = await db
          .select()
          .from(diagnostics)
          .where(eq(diagnostics.id, contact.diagnosticId));

        let subject: string;
        let body: string;

        // E5 micro_recordatorio: use fixed template (no AI)
        if (template.nombre === "micro_recordatorio") {
          const result = buildMicroReminderEmail(
            diagnostic?.participante || contact.nombre,
            diagnostic?.horaCita || "",
            diagnostic?.meetLink || null,
            contact.id
          );
          subject = result.subject;
          body = result.body;
        } else {
          // Generate content with AI
          const result = await generateEmailContent(
            template,
            diagnostic || null,
            contact.id
          );
          subject = result.subject;
          body = result.body;
        }

        // Send email
        const result = await sendEmail(contact.email, subject, body);

        // Update record — success
        await db
          .update(sentEmails)
          .set({
            subject,
            body,
            status: "sent",
            sentAt: new Date(),
            resendMessageId: result?.messageId || null,
          })
          .where(eq(sentEmails.id, email.id));

        // Update contact status
        if (contact.status === "lead") {
          await db
            .update(contacts)
            .set({ status: "contacted" })
            .where(eq(contacts.id, contact.id));
        }

        log(`Email enviado: "${subject}" → ${contact.email}`);
      } catch (err: any) {
        const newRetry = (email.retryCount || 0) + 1;
        const isFinal = newRetry >= MAX_RETRIES;

        log(
          `Error email ${email.id} (intento ${newRetry}/${MAX_RETRIES}): ${err?.message || err}`
        );
        if (err?.stack) {
          log(`Stack: ${err.stack}`);
        }

        await db
          .update(sentEmails)
          .set({
            retryCount: newRetry,
            status: isFinal ? "failed" : "pending",
          })
          .where(eq(sentEmails.id, email.id));

        if (isFinal) {
          log(`Email ${email.id} marcado como FAILED después de ${MAX_RETRIES} intentos`);
        }
      }
    }
  } catch (err: any) {
    log(`Error en email scheduler: ${err?.message || err}`);
  }
}

async function processAbandonedEmails() {
  if (!db || !isEmailConfigured()) return;

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Find abandoned leads: email captured > 1 hour ago, not converted, email not sent
    const abandoned = await db
      .select()
      .from(abandonedLeads)
      .where(
        and(
          eq(abandonedLeads.converted, false),
          eq(abandonedLeads.emailSent, false),
          lte(abandonedLeads.capturedAt, oneHourAgo)
        )
      )
      .limit(5);

    if (abandoned.length === 0) return;

    // Get the abandonment template
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.nombre, "abandono"),
          eq(emailTemplates.isActive, true)
        )
      );

    if (!template) {
      log("Template 'abandono' no encontrado — correr seed");
      return;
    }

    log(`Procesando ${abandoned.length} email(s) de abandono`);

    for (const lead of abandoned) {
      try {
        // Generate content with minimal context (we only have the email)
        const minimalData = { email: lead.email } as any;
        const { subject, body } = await generateEmailContent(template, minimalData);

        await sendEmail(lead.email, subject, body);

        await db
          .update(abandonedLeads)
          .set({ emailSent: true })
          .where(eq(abandonedLeads.id, lead.id));

        log(`Email de abandono enviado a ${lead.email}`);
      } catch (err: any) {
        log(`Error enviando email de abandono a ${lead.email}: ${err?.message || err}`);
      }
    }
  } catch (err: any) {
    log(`Error en processAbandonedEmails: ${err?.message || err}`);
  }
}

export function startEmailScheduler() {
  if (!isEmailConfigured()) {
    log("⚠ Email system not configured (missing ANTHROPIC_API_KEY or RESEND_API_KEY)");
    return;
  }

  // Run every 5 minutes for more responsive email delivery
  cron.schedule("*/5 * * * *", () => {
    processEmailQueue();
    processAbandonedEmails();
  });

  // Also run once at startup (after 10 seconds to let DB connect)
  setTimeout(() => {
    processEmailQueue();
    processAbandonedEmails();
  }, 10_000);

  log("Email scheduler iniciado (cada 5 min)");
}
