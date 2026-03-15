import cron from "node-cron";
import { db } from "./db";
import { sentEmails, emailTemplates, contacts, diagnostics, abandonedLeads, activityLog, notifications, newsletterSubscribers, newsletterSends, blogPosts, blogCategories } from "@shared/schema";
import { eq, and, lte, not, gte, desc } from "drizzle-orm";
import { generateEmailContent, buildMicroReminderEmail, generateDailyNewsDigest } from "./email-ai";
import { sendEmail, isEmailConfigured } from "./email-sender";
import { parseFechaCita } from "./date-utils";
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

        // Check if pre-meeting email should be expired (appointment already passed)
        const PRE_MEETING_TEMPLATES = ["caso_exito", "insight_educativo", "prep_agenda", "micro_recordatorio"];
        if (diagnostic?.fechaCita && diagnostic?.horaCita) {
          const appointmentDate = parseFechaCita(diagnostic.fechaCita, diagnostic.horaCita);

          if (PRE_MEETING_TEMPLATES.includes(template.nombre) && now > appointmentDate) {
            log(`Email ${template.nombre} expirado — cita de ${contact.email} ya pasó`);
            await db.update(sentEmails).set({ status: "expired" }).where(eq(sentEmails.id, email.id));
            continue;
          }

          // Post-meeting follow-up: expire if more than 48h after appointment
          if (template.nombre === "seguimiento_post") {
            const hoursSinceMeeting = (now.getTime() - appointmentDate.getTime()) / (1000 * 60 * 60);
            if (hoursSinceMeeting > 48) {
              log(`Email seguimiento_post expirado — cita de ${contact.email} fue hace ${Math.round(hoursSinceMeeting)}h`);
              await db.update(sentEmails).set({ status: "expired" }).where(eq(sentEmails.id, email.id));
              continue;
            }
          }
        }

        let subject: string;
        let body: string;

        if (email.subject && email.body) {
          // Use pre-generated or admin-edited content
          subject = email.subject;
          body = email.body;
        } else if (template.nombre === "micro_recordatorio") {
          // E5 micro_recordatorio: use fixed template (no AI)
          const result = buildMicroReminderEmail(
            diagnostic?.participante || contact.nombre,
            diagnostic?.horaCita || "",
            diagnostic?.meetLink || null,
            contact.id
          );
          subject = result.subject;
          body = result.body;
        } else {
          // Generate content with AI (fallback for legacy or failed pre-gen)
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

        // Log activity
        try {
          await db.insert(activityLog).values({
            contactId: contact.id,
            type: "email_sent",
            description: `Email enviado: "${subject}"`,
            metadata: { emailId: email.id, templateName: template.nombre, subject },
          });
        } catch (_) {}

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

/**
 * Auto-update contact substatus based on email engagement patterns.
 * Runs periodically to classify contacts as warm/cold/interested.
 */
async function updateContactSubstatuses() {
  if (!db) return;

  try {
    // Get all active contacts (not opted out, not converted)
    const activeContacts = await db.select().from(contacts)
      .where(and(
        eq(contacts.optedOut, false),
        not(eq(contacts.status, "converted"))
      ));

    if (activeContacts.length === 0) return;

    for (const contact of activeContacts) {
      // Get all emails for this contact
      const emails = await db.select().from(sentEmails)
        .where(eq(sentEmails.contactId, contact.id));

      const sentCount = emails.filter(e => ["sent", "opened", "clicked"].includes(e.status)).length;
      const openedCount = emails.filter(e => e.status === "opened" || e.status === "clicked").length;
      const clickedCount = emails.filter(e => e.status === "clicked").length;

      let newSubstatus: string | null = null;

      // Determine substatus based on engagement
      if (clickedCount >= 1 || openedCount >= 2) {
        newSubstatus = "interested";
      } else if (contact.leadScore > 60) {
        newSubstatus = "warm";
      } else if (sentCount >= 3 && openedCount === 0) {
        newSubstatus = "cold";
      } else if (sentCount >= 2 && openedCount === 0) {
        newSubstatus = "no_response";
      }

      // Only update if substatus changed and isn't manually set to a post-sale status
      const manualStatuses = ["proposal_sent", "delivering", "completed"];
      if (newSubstatus && newSubstatus !== contact.substatus && !manualStatuses.includes(contact.substatus || "")) {
        await db.update(contacts)
          .set({ substatus: newSubstatus })
          .where(eq(contacts.id, contact.id));

        // Log activity for cold leads
        if (newSubstatus === "cold") {
          try {
            await db.insert(activityLog).values({
              contactId: contact.id,
              type: "status_changed",
              description: `Substatus auto-actualizado a "frio" — ${sentCount} emails sin apertura`,
            });
          } catch (_) {}
        }

        // Create notification based on substatus change
        if (newSubstatus === "cold") {
          try {
            await db.insert(notifications).values({
              type: "cold_lead",
              title: `❄️ Lead frío: ${contact.nombre}`,
              description: `${contact.empresa} — ${sentCount} emails sin abrir`,
              contactId: contact.id,
            });
          } catch (_) {}
        } else if (newSubstatus === "warm") {
          try {
            await db.insert(notifications).values({
              type: "hot_lead",
              title: `🔥 Lead caliente: ${contact.nombre}`,
              description: `${contact.empresa} — Score ${contact.leadScore}`,
              contactId: contact.id,
            });
            // Email admin about warm lead
            const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
            const baseUrl = process.env.BASE_URL || "https://im3systems.com";
            sendEmail(
              adminEmail,
              `🔥 Lead caliente: ${contact.nombre} — Score ${contact.leadScore}`,
              `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
                <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0">
                  <h1 style="color:#fff;font-size:18px;margin:0">🔥 Lead Caliente Detectado</h1>
                </div>
                <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                  <table style="width:100%;border-collapse:collapse;font-size:14px">
                    <tr><td style="padding:8px 0;color:#666">Nombre</td><td style="padding:8px 0;font-weight:600">${contact.nombre}</td></tr>
                    <tr><td style="padding:8px 0;color:#666">Empresa</td><td style="padding:8px 0">${contact.empresa}</td></tr>
                    <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0">${contact.email}</td></tr>
                    <tr><td style="padding:8px 0;color:#666">Score</td><td style="padding:8px 0;font-weight:600;color:#dc2626">${contact.leadScore}</td></tr>
                  </table>
                  <div style="margin-top:20px;text-align:center">
                    <a href="${baseUrl}/admin/contacts" style="background:#2B7A78;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px">Ver en CRM →</a>
                  </div>
                </div>
              </div>`
            ).catch((err) => log(`Error sending warm lead admin email: ${err}`));
          } catch (_) {}
        }
      }
    }
  } catch (err: any) {
    log(`Error updating substatuses: ${err?.message || err}`);
  }
}

/**
 * Check for overdue tasks and create notifications.
 */
async function checkOverdueTasks() {
  if (!db) return;

  try {
    const { tasks } = await import("@shared/schema");
    const now = new Date();
    const overdueTasks = await db.select().from(tasks)
      .where(and(eq(tasks.status, "pending"), lte(tasks.dueDate, now)));

    for (const task of overdueTasks) {
      if (!task.contactId) continue;
      // Check if notification already exists for this task (avoid duplicates)
      const existing = await db.select().from(notifications)
        .where(and(
          eq(notifications.type, "task_overdue"),
          eq(notifications.contactId, task.contactId)
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(notifications).values({
          type: "task_overdue",
          title: `Tarea vencida: ${task.title}`,
          description: task.dueDate ? `Vencio ${task.dueDate.toLocaleDateString("es-CO")}` : undefined,
          contactId: task.contactId,
        });

        // Email admin for high-priority overdue tasks
        if (task.priority === "high") {
          const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
          const baseUrl = process.env.BASE_URL || "https://im3systems.com";
          sendEmail(
            adminEmail,
            `⚠️ Tarea vencida (alta prioridad): ${task.title}`,
            `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
              <div style="background:#f59e0b;padding:20px 28px;border-radius:8px 8px 0 0">
                <h1 style="color:#fff;font-size:18px;margin:0">⚠️ Tarea Vencida — Alta Prioridad</h1>
              </div>
              <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                <p style="font-size:16px;font-weight:600;margin:0 0 12px">${task.title}</p>
                ${task.description ? `<p style="font-size:14px;color:#666;margin:0 0 12px">${task.description}</p>` : ""}
                ${task.dueDate ? `<p style="font-size:14px;color:#dc2626;margin:0 0 20px">Venció: ${task.dueDate.toLocaleDateString("es-CO")}</p>` : ""}
                <div style="text-align:center">
                  <a href="${baseUrl}/admin/contacts" style="background:#2B7A78;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px">Ver en CRM →</a>
                </div>
              </div>
            </div>`
          ).catch((err) => log(`Error sending overdue task admin email: ${err}`));
        }
      }
    }
  } catch (err: any) {
    log(`Error checking overdue tasks: ${err?.message || err}`);
  }
}

/**
 * Generate daily news digest, publish as blog post, and email to all subscribers.
 */
async function generateAndSendDailyNewsletter() {
  if (!db) return;

  try {
    // Check if already sent today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await db.select().from(newsletterSends)
      .where(gte(newsletterSends.sentAt, todayStart))
      .limit(1);

    if (existing.length > 0) {
      log("Newsletter diario ya enviado hoy — omitiendo");
      return;
    }

    log("Generando newsletter diario...");

    // Generate content with AI
    const digest = await generateDailyNewsDigest("es");

    // Find or create "Noticias Tech" category
    let [category] = await db.select().from(blogCategories)
      .where(eq(blogCategories.slug, "tendencias-tech"))
      .limit(1);

    if (!category) {
      [category] = await db.insert(blogCategories).values({
        name: "Tendencias Tech",
        slug: "tendencias-tech",
        description: "Últimas tendencias en tecnología",
      }).returning();
    }

    // Create blog post
    const today = new Date();
    const dateSlug = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const slug = `noticias-tech-${dateSlug}`;

    const [post] = await db.insert(blogPosts).values({
      title: digest.title,
      slug,
      excerpt: digest.excerpt,
      content: digest.htmlContent,
      categoryId: category.id,
      tags: digest.tags,
      authorName: "Equipo IM3",
      status: "published",
      language: "es",
      metaTitle: digest.title,
      metaDescription: digest.excerpt,
      readTimeMinutes: 3,
      publishedAt: today,
    }).returning();

    log(`Blog post creado: "${digest.title}" (${slug})`);

    // Get all active subscribers
    const subscribers = await db.select().from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.isActive, true));

    if (subscribers.length === 0) {
      log("No hay suscriptores activos — blog post publicado sin envío de email");
      await db.insert(newsletterSends).values({
        subject: digest.emailSubject,
        content: digest.emailHtml,
        blogPostId: post.id,
        recipientCount: 0,
        status: "sent",
      });
      return;
    }

    // Send email to each subscriber
    let sentCount = 0;
    for (const sub of subscribers) {
      try {
        // Replace {{EMAIL}} placeholder with actual email for unsubscribe link
        const personalizedHtml = digest.emailHtml.replace("{{EMAIL}}", encodeURIComponent(sub.email));
        await sendEmail(sub.email, digest.emailSubject, personalizedHtml);
        sentCount++;
      } catch (err: any) {
        log(`Error enviando newsletter a ${sub.email}: ${err?.message}`);
      }
    }

    // Record the send
    await db.insert(newsletterSends).values({
      subject: digest.emailSubject,
      content: digest.emailHtml,
      blogPostId: post.id,
      recipientCount: sentCount,
      status: "sent",
    });

    log(`Newsletter diario enviado a ${sentCount}/${subscribers.length} suscriptores`);
  } catch (err: any) {
    log(`Error en newsletter diario: ${err?.message || err}`);
  }
}

export function startEmailScheduler() {
  if (!isEmailConfigured()) {
    log("⚠ Email system not configured (missing ANTHROPIC_API_KEY or RESEND_API_KEY)");
    return;
  }

  // Run every 5 minutes for more responsive email delivery
  cron.schedule("*/5 * * * *", async () => {
    await processEmailQueue().catch(err => log(`Cron error queue: ${err}`));
    await processAbandonedEmails().catch(err => log(`Cron error abandoned: ${err}`));
  });

  // Run substatus updates and overdue task checks every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    await updateContactSubstatuses().catch(err => log(`Cron error substatus: ${err}`));
    await checkOverdueTasks().catch(err => log(`Cron error overdue: ${err}`));
  });

  // Daily newsletter at 7:00 AM Colombia time (12:00 UTC)
  cron.schedule("0 12 * * *", async () => {
    await generateAndSendDailyNewsletter().catch(err => log(`Cron error newsletter: ${err}`));
  });

  // Also run once at startup (after 10 seconds to let DB connect)
  setTimeout(() => {
    processEmailQueue();
    processAbandonedEmails();
  }, 10_000);

  log("Email scheduler iniciado (cada 5 min, newsletter diario 7AM COT)");
}
