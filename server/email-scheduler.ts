import cron from "node-cron";
import { db } from "./db";
import { sentEmails, emailTemplates, contacts, diagnostics, abandonedLeads, activityLog, notifications, newsletterSubscribers, newsletterSends, blogPosts, blogCategories, appointments, whatsappMessages } from "@shared/schema";
import { eq, and, lte, not, gte, desc, inArray } from "drizzle-orm";
import { generateEmailContent, build6hReminderEmail, buildMicroReminderEmail, generateDailyNewsDigest, generateWhatsAppMessage } from "./email-ai";
import { sendEmail, isEmailConfigured } from "./email-sender";
import { isWhatsAppConfigured, sendWhatsAppText, sendWhatsAppTemplate } from "./whatsapp";
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
        const [diagnostic] = contact.diagnosticId
          ? await db
              .select()
              .from(diagnostics)
              .where(eq(diagnostics.id, contact.diagnosticId))
          : [undefined];

        // Check if pre-meeting email should be expired (appointment already passed)
        const PRE_MEETING_TEMPLATES = ["caso_exito", "insight_educativo", "prep_agenda", "recordatorio_6h", "micro_recordatorio"];
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
        } else if (template.nombre === "recordatorio_6h") {
          // Recordatorio 6h: use fixed template (no AI)
          const result = build6hReminderEmail(
            diagnostic?.participante || contact.nombre,
            diagnostic?.horaCita || "",
            diagnostic?.meetLink || null,
            contact.id
          );
          subject = result.subject;
          body = result.body;
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
 * Process pending WhatsApp messages from the queue.
 * Similar to processEmailQueue but for WhatsApp Business API.
 */
async function processWhatsAppQueue() {
  if (!db || !isWhatsAppConfigured()) return;

  try {
    const now = new Date();

    const pendingMessages = await db
      .select()
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.status, "pending"),
          lte(whatsappMessages.scheduledFor, now)
        )
      )
      .limit(5);

    if (pendingMessages.length === 0) return;

    log(`Procesando ${pendingMessages.length} WhatsApp(s) pendientes`);

    for (const msg of pendingMessages) {
      try {
        // Get contact to check opt-out
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, msg.contactId));

        if (!contact || contact.optedOut) {
          await db.update(whatsappMessages)
            .set({ status: "failed", errorMessage: contact ? "Contact opted out" : "Contact not found" })
            .where(eq(whatsappMessages.id, msg.id));
          continue;
        }

        let result;

        if (msg.templateName) {
          // Send template message (approved by Meta)
          result = await sendWhatsAppTemplate(
            msg.phone,
            msg.templateName,
            (msg.templateParams as Record<string, string>) || {}
          );
        } else {
          // Send text message (within 24h window or AI-generated)
          let messageText = msg.message;

          // If no message pre-generated, generate now with AI
          if (!messageText) {
            const [diagnostic] = contact.diagnosticId
              ? await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId))
              : [undefined];
            messageText = await generateWhatsAppMessage(contact, diagnostic || null);
          }

          result = await sendWhatsAppText(msg.phone, messageText);
        }

        if (result.status === "sent") {
          await db.update(whatsappMessages)
            .set({
              status: "sent",
              sentAt: new Date(),
              whatsappMessageId: result.messageId,
              message: msg.message || "template message",
            })
            .where(eq(whatsappMessages.id, msg.id));

          // Log activity
          try {
            await db.insert(activityLog).values({
              contactId: msg.contactId,
              type: "whatsapp_sent",
              description: `WhatsApp enviado a ${msg.phone}${msg.templateName ? ` (template: ${msg.templateName})` : ""}`,
              metadata: { whatsappMessageId: result.messageId, templateName: msg.templateName },
            });
          } catch (_) {}

          log(`WhatsApp enviado → ${msg.phone}`);
        } else {
          const newRetry = (msg.retryCount || 0) + 1;
          const isFinal = newRetry >= MAX_RETRIES;

          await db.update(whatsappMessages)
            .set({
              retryCount: newRetry,
              status: isFinal ? "failed" : "pending",
              errorMessage: result.error || "Unknown error",
            })
            .where(eq(whatsappMessages.id, msg.id));

          log(`WhatsApp error ${msg.id} (intento ${newRetry}/${MAX_RETRIES}): ${result.error}`);
        }
      } catch (err: any) {
        const newRetry = (msg.retryCount || 0) + 1;
        await db.update(whatsappMessages)
          .set({
            retryCount: newRetry,
            status: newRetry >= MAX_RETRIES ? "failed" : "pending",
            errorMessage: err?.message || "Unknown error",
          })
          .where(eq(whatsappMessages.id, msg.id));

        log(`WhatsApp error ${msg.id}: ${err?.message || err}`);
      }
    }
  } catch (err: any) {
    log(`Error en WhatsApp scheduler: ${err?.message || err}`);
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

    // Batch fetch ALL sent emails for active contacts in ONE query (fixes N+1)
    const contactIds = activeContacts.map(c => c.id);
    const allEmails = await db.select().from(sentEmails)
      .where(inArray(sentEmails.contactId, contactIds));

    // Group emails by contactId in memory
    const emailsByContact = new Map<string, (typeof allEmails)[number][]>();
    for (const email of allEmails) {
      const existing = emailsByContact.get(email.contactId) || [];
      existing.push(email);
      emailsByContact.set(email.contactId, existing);
    }

    for (const contact of activeContacts) {
      const emails = emailsByContact.get(contact.id) || [];

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
                    <a href="${baseUrl}/admin/contacts" style="background:#3B82F6;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px">Ver en CRM →</a>
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
                  <a href="${baseUrl}/admin/contacts" style="background:#3B82F6;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px">Ver en CRM →</a>
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
      log("Newsletter semanal ya enviado esta semana — omitiendo");
      return;
    }

    log("Generando newsletter semanal...");

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
      log("No hay suscriptores activos — blog post publicado sin envio de email");
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

    log(`Newsletter semanal enviado a ${sentCount}/${subscribers.length} suscriptores`);
  } catch (err: any) {
    log(`Error en newsletter semanal: ${err?.message || err}`);
  }
}

/**
 * Post-meeting automation: check for completed meetings, search for
 * recordings/transcripts in Drive, and move them to client folders.
 */
async function processPostMeetingRecordings() {
  if (!db) return;

  try {
    const { moveRecordingToClientFolder, extractFolderIdFromUrl } = await import("./google-drive");

    // Find completed meetings that don't have recordings yet
    const completedDiags = await db.select().from(diagnostics)
      .where(and(
        eq(diagnostics.meetingStatus, "completed"),
        not(eq(diagnostics.googleDriveUrl, ""))
      ));

    for (const diag of completedDiags) {
      if (!diag.googleDriveUrl || !diag.meetLink) continue;

      const folderId = extractFolderIdFromUrl(diag.googleDriveUrl);
      if (!folderId) continue;

      const meetingTitle = `Diagnóstico IM3 — ${diag.empresa}`;

      try {
        const { recordingUrl, transcriptUrl } = await moveRecordingToClientFolder(meetingTitle, folderId);

        if (recordingUrl || transcriptUrl) {
          // Find the contact associated with this diagnostic to log activity
          const [contact] = await db.select().from(contacts)
            .where(eq(contacts.diagnosticId, diag.id)).limit(1);

          if (contact) {
            if (recordingUrl) {
              await db.insert(activityLog).values({
                contactId: contact.id,
                type: "recording_saved",
                description: `Grabación de reunión guardada en Google Drive`,
                metadata: { recordingUrl },
              }).catch(() => {});
            }
            if (transcriptUrl) {
              await db.insert(activityLog).values({
                contactId: contact.id,
                type: "transcript_saved",
                description: `Transcripción de reunión guardada en Google Drive`,
                metadata: { transcriptUrl },
              }).catch(() => {});
            }
          }

          log(`[Post-Meeting] Archivos movidos para ${diag.empresa}: recording=${!!recordingUrl}, transcript=${!!transcriptUrl}`);
        }
      } catch (err: any) {
        log(`[Post-Meeting] Error procesando ${diag.empresa}: ${err?.message}`);
      }
    }

    // Also check manual appointments that are completed
    const completedAppts = await db.select().from(appointments)
      .where(eq(appointments.status, "completed"));

    for (const appt of completedAppts) {
      // Skip if already has recording URL
      if (appt.recordingUrl) continue;
      if (!appt.contactId) continue;

      // Find the contact's diagnostic to get the Drive folder
      const [contact] = await db.select().from(contacts)
        .where(eq(contacts.id, appt.contactId)).limit(1);
      if (!contact?.diagnosticId) continue;

      const [diag] = await db.select().from(diagnostics)
        .where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
      if (!diag?.googleDriveUrl) continue;

      const folderId = extractFolderIdFromUrl(diag.googleDriveUrl);
      if (!folderId) continue;

      try {
        const { recordingUrl, transcriptUrl } = await moveRecordingToClientFolder(appt.title, folderId);

        if (recordingUrl || transcriptUrl) {
          await db.update(appointments).set({
            recordingUrl: recordingUrl || undefined,
            transcriptUrl: transcriptUrl || undefined,
          }).where(eq(appointments.id, appt.id));

          if (recordingUrl) {
            await db.insert(activityLog).values({
              contactId: appt.contactId,
              type: "recording_saved",
              description: `Grabación guardada: "${appt.title}"`,
              metadata: { recordingUrl },
            }).catch(() => {});
          }

          log(`[Post-Meeting] Archivos de cita "${appt.title}" movidos`);
        }
      } catch (err: any) {
        log(`[Post-Meeting] Error en cita "${appt.title}": ${err?.message}`);
      }
    }
  } catch (err: any) {
    log(`Error en processPostMeetingRecordings: ${err?.message || err}`);
  }
}

export function startEmailScheduler() {
  if (!isEmailConfigured()) {
    log("⚠ Email system not configured (missing ANTHROPIC_API_KEY or RESEND_API_KEY)");
    return;
  }

  // Run every 5 minutes for more responsive email/WhatsApp delivery
  cron.schedule("*/15 * * * *", async () => {
    await processEmailQueue().catch(err => log(`Cron error queue: ${err}`));
    await processAbandonedEmails().catch(err => log(`Cron error abandoned: ${err}`));
    await processWhatsAppQueue().catch(err => log(`Cron error whatsapp: ${err}`));
  });

  // Run substatus updates, overdue task checks, and post-meeting recordings every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    await updateContactSubstatuses().catch(err => log(`Cron error substatus: ${err}`));
    await checkOverdueTasks().catch(err => log(`Cron error overdue: ${err}`));
    await processPostMeetingRecordings().catch(err => log(`Cron error post-meeting: ${err}`));
  });

  // Weekly newsletter every Monday at 7:00 AM Colombia time (12:00 UTC)
  cron.schedule("0 12 * * 1", async () => {
    await generateAndSendDailyNewsletter().catch(err => log(`Cron error newsletter: ${err}`));
  });

  // Also run once at startup (after 10 seconds to let DB connect)
  setTimeout(() => {
    processEmailQueue();
    processAbandonedEmails();
    processWhatsAppQueue();
  }, 10_000);

  // Catch-up: if today is Monday and newsletter hasn't been sent yet, send it now
  // (handles server restarts/deploys that cause the cron to miss its window)
  setTimeout(async () => {
    const now = new Date();
    if (now.getUTCDay() === 1) { // Monday in UTC
      log("Monday catch-up: checking if newsletter was sent today...");
      await generateAndSendDailyNewsletter().catch(err => log(`Catch-up newsletter error: ${err}`));
    }
  }, 15_000);

  log("Email scheduler iniciado (cada 5 min, newsletter semanal lunes 7AM COT)");
}
