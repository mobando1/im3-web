import cron from "node-cron";
import { db } from "./db";
import { sentEmails, emailTemplates, contacts, diagnostics, abandonedLeads } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { generateEmailContent } from "./email-ai";
import { sendEmail, isEmailConfigured } from "./email-sender";
import { log } from "./index";

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
        // Get template
        const [template] = await db
          .select()
          .from(emailTemplates)
          .where(eq(emailTemplates.id, email.templateId));

        if (!template) {
          log(`Template ${email.templateId} no encontrado, saltando`);
          continue;
        }

        // Get contact
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, email.contactId));

        if (!contact) {
          log(`Contacto ${email.contactId} no encontrado, saltando`);
          continue;
        }

        // Get diagnostic data
        const [diagnostic] = await db
          .select()
          .from(diagnostics)
          .where(eq(diagnostics.id, contact.diagnosticId));

        if (!diagnostic) {
          log(`Diagnóstico ${contact.diagnosticId} no encontrado, saltando`);
          continue;
        }

        // Generate content with AI
        const { subject, body } = await generateEmailContent(template, diagnostic);

        // Send email
        const result = await sendEmail(contact.email, subject, body);

        // Update record
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
      } catch (err) {
        log(`Error procesando email ${email.id}: ${err}`);
        // Don't mark as failed — will retry next cycle
      }
    }
  } catch (err) {
    log(`Error en email scheduler: ${err}`);
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
      .where(eq(emailTemplates.nombre, "abandono"));

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
      } catch (err) {
        log(`Error enviando email de abandono a ${lead.email}: ${err}`);
      }
    }
  } catch (err) {
    log(`Error en processAbandonedEmails: ${err}`);
  }
}

export function startEmailScheduler() {
  if (!isEmailConfigured()) {
    log("⚠ Email system not configured (missing ANTHROPIC_API_KEY or RESEND_API_KEY)");
    return;
  }

  // Run every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    processEmailQueue();
    processAbandonedEmails();
  });

  // Also run once at startup (after 10 seconds to let DB connect)
  setTimeout(() => {
    processEmailQueue();
    processAbandonedEmails();
  }, 10_000);

  log("Email scheduler iniciado (cada 15 min)");
}
