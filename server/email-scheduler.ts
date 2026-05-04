import cron from "node-cron";
import { db } from "./db";
import { sentEmails, emailTemplates, contacts, diagnostics, abandonedLeads, activityLog, notifications, newsletterSubscribers, newsletterSends, blogPosts, blogCategories, appointments, whatsappMessages, clientProjects, projectTasks, proposals } from "@shared/schema";
import { eq, and, lte, not, gte, desc, inArray, or, asc } from "drizzle-orm";
import { generateEmailContent, build6hReminderEmail, buildMicroReminderEmail, generateDailyNewsDigest, generateWhatsAppMessage, generateReengagement, buildProjectNotificationEmail } from "./email-ai";
import { sendEmail, isEmailConfigured } from "./email-sender";
import { isWhatsAppConfigured, sendWhatsAppText, sendWhatsAppTemplate } from "./whatsapp";
import { parseFechaCita } from "./date-utils";
import { syncGmailEmails, isGmailConfigured } from "./google-gmail";
import { log } from "./index";
import { runAgent } from "./agents/runner";
import { runErrorSupervisor } from "./agents/error-supervisor";
import { runMeetingPrep } from "./agents/meeting-prep";
import { runFollowupWriter } from "./agents/followup-writer";
import { runCostReferenceFreshness } from "./agents/cost-reference-freshness";
import { runAnalyticsSync } from "./agents/analytics-sync";
import { runAnalyticsMonthlyReport } from "./agents/analytics-monthly-report";
import { getIndustriaLabel } from "@shared/industrias";

export { syncGmailEmails };

const MAX_RETRIES = 3;

export async function processEmailQueue() {
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

        // Proposal follow-up checks — skip if proposal already accepted/rejected
        if (email.templateId.startsWith("propuesta_")) {
          const [latestProposal] = await db.select({ status: proposals.status, viewedAt: proposals.viewedAt })
            .from(proposals)
            .where(eq(proposals.contactId, email.contactId))
            .orderBy(desc(proposals.sentAt))
            .limit(1);

          if (latestProposal) {
            // Cancel all follow-ups if accepted or rejected
            if (latestProposal.status === "accepted" || latestProposal.status === "rejected") {
              log(`Proposal ${latestProposal.status} — cancelling follow-up ${email.templateId}`);
              await db.update(sentEmails).set({ status: "expired" }).where(eq(sentEmails.id, email.id));
              continue;
            }
            // Skip 3-day reminder if proposal was already viewed
            if (email.templateId === "propuesta_recordatorio" && latestProposal.viewedAt) {
              log(`Proposal already viewed — skipping reminder`);
              await db.update(sentEmails).set({ status: "expired" }).where(eq(sentEmails.id, email.id));
              continue;
            }
          }

          // Proposal follow-ups already have subject and body pre-set, send directly
          if (email.subject && email.body) {
            const result = await sendEmail(contact.email, email.subject, email.body);
            await db.update(sentEmails).set({
              status: result ? "sent" : "failed",
              sentAt: new Date(),
              resendMessageId: result?.messageId || null,
            }).where(eq(sentEmails.id, email.id));
            if (result) log(`Proposal follow-up sent: ${email.templateId} → ${contact.email}`);
            continue;
          }

          // If no body yet, generate it with AI (for propuesta_recordatorio, propuesta_valor, propuesta_cierre)
          // These need the proposal URL, so fetch it
          const [prop] = await db.select({ accessToken: proposals.accessToken, title: proposals.title })
            .from(proposals).where(eq(proposals.contactId, email.contactId)).orderBy(desc(proposals.sentAt)).limit(1);

          if (prop) {
            const baseUrl = process.env.BASE_URL || "https://im3systems.com";
            const proposalUrl = `${baseUrl}/proposal/${prop.accessToken}`;
            let body = "";

            if (email.templateId === "propuesta_recordatorio") {
              body = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><p>Hola ${contact.nombre.split(" ")[0]},</p><p>Hace unos días te compartimos una propuesta para <strong>${contact.empresa}</strong>. Queríamos saber si tuviste oportunidad de revisarla.</p><p><a href="${proposalUrl}" style="display:inline-block;padding:12px 24px;background:#2FA4A9;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Ver propuesta →</a></p><p>Si tienes preguntas o necesitas ajustes, responde a este email y lo conversamos.</p><p>Saludos,<br/>Equipo IM3 Systems</p></div>`;
            } else if (email.templateId === "propuesta_valor") {
              body = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><p>Hola ${contact.nombre.split(" ")[0]},</p><p>Quería compartirte que recientemente implementamos un proyecto similar al que le propusimos a <strong>${contact.empresa}</strong>, con resultados muy positivos en automatización y eficiencia.</p><p>Tu propuesta sigue disponible aquí:</p><p><a href="${proposalUrl}" style="display:inline-block;padding:12px 24px;background:#2FA4A9;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Revisar propuesta →</a></p><p>¿Te gustaría agendar una llamada de 15 minutos para resolver cualquier duda?</p><p>Saludos,<br/>Equipo IM3 Systems</p></div>`;
            } else if (email.templateId === "propuesta_cierre") {
              body = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><p>Hola ${contact.nombre.split(" ")[0]},</p><p>Han pasado un par de semanas desde que enviamos la propuesta para <strong>${contact.empresa}</strong>. Entendemos que estos procesos toman tiempo.</p><p>¿Hay algo que podamos ajustar en la propuesta? Estamos abiertos a adaptar el alcance, timeline o inversión según tus necesidades.</p><p><a href="${proposalUrl}" style="display:inline-block;padding:12px 24px;background:#2FA4A9;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Ver propuesta →</a></p><p>Saludos,<br/>Equipo IM3 Systems</p></div>`;
            }

            if (body) {
              await db.update(sentEmails).set({ body }).where(eq(sentEmails.id, email.id));
              const result = await sendEmail(contact.email, email.subject!, body);
              await db.update(sentEmails).set({
                status: result ? "sent" : "failed",
                sentAt: new Date(),
                resendMessageId: result?.messageId || null,
              }).where(eq(sentEmails.id, email.id));
              if (result) log(`Proposal follow-up sent: ${email.templateId} → ${contact.email}`);
              continue;
            }
          }
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

          // Post-meeting follow-up: only send if meeting was completed, expire otherwise
          if (template.nombre === "seguimiento_post") {
            if (diagnostic?.meetingStatus !== "completed") {
              log(`Email seguimiento_post cancelado — reunión de ${contact.email} no fue completada (status: ${diagnostic?.meetingStatus})`);
              await db.update(sentEmails).set({ status: "expired" }).where(eq(sentEmails.id, email.id));
              continue;
            }
            const hoursSinceMeeting = (now.getTime() - appointmentDate.getTime()) / (1000 * 60 * 60);
            if (hoursSinceMeeting > 48) {
              log(`Email seguimiento_post expirado — cita de ${contact.email} fue hace ${Math.round(hoursSinceMeeting)}h`);
              await db.update(sentEmails).set({ status: "expired" }).where(eq(sentEmails.id, email.id));
              continue;
            }
          }
        }

        // Inject follow-up appointment context for seguimiento_post email
        let diagnosticForEmail = diagnostic;
        if (template.nombre === "seguimiento_post" && !email.subject) {
          try {
            const followUpAppts = await db.select().from(appointments)
              .where(and(
                eq(appointments.contactId, contact.id),
                eq(appointments.appointmentType, "follow_up"),
                eq(appointments.status, "scheduled")
              ))
              .limit(1);

            if (followUpAppts.length > 0) {
              const followUp = followUpAppts[0];
              diagnosticForEmail = diagnostic ? { ...diagnostic } : {} as any;
              (diagnosticForEmail as any)._followUpDate = followUp.date;
              (diagnosticForEmail as any)._followUpTime = followUp.time;
              (diagnosticForEmail as any)._followUpMeetLink = followUp.meetLink;
              log(`Seguimiento_post: inyectando contexto de follow-up (${followUp.date} ${followUp.time}) para ${contact.email}`);
            }
          } catch (err) {
            log(`Error checking follow-up for seguimiento_post: ${err}`);
          }
        }

        let subject: string;
        let body: string;
        const lang = contact.idioma || "es";

        // Fixed templates: ALWAYS regenerate with current meetLink from DB
        // (meetLink may have been created after pre-generation, or changed by reschedule)
        if (template.nombre === "recordatorio_6h") {
          const result = build6hReminderEmail(
            diagnostic?.participante || contact.nombre,
            diagnostic?.horaCita || "",
            diagnostic?.meetLink || null,
            contact.id,
            undefined,
            lang
          );
          subject = result.subject;
          body = result.body;
        } else if (template.nombre === "micro_recordatorio") {
          const result = buildMicroReminderEmail(
            diagnostic?.participante || contact.nombre,
            diagnostic?.horaCita || "",
            diagnostic?.meetLink || null,
            contact.id,
            lang
          );
          subject = result.subject;
          body = result.body;
        } else if (email.subject && email.body) {
          // Use pre-generated or admin-edited content for AI templates
          subject = email.subject;
          body = email.body;
        } else {
          // Generate content with AI (fallback for legacy or failed pre-gen)
          const result = await generateEmailContent(
            template,
            diagnosticForEmail || null,
            contact.id,
            lang
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

export async function processAbandonedEmails() {
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
export async function processWhatsAppQueue() {
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

        // Conditional WA: skip if linked email was already opened
        if (msg.conditionType === "if_email_not_opened" && msg.conditionEmailTemplate) {
          const [template] = await db.select().from(emailTemplates)
            .where(eq(emailTemplates.nombre, msg.conditionEmailTemplate))
            .limit(1);
          if (template) {
            const [openedEmail] = await db.select({ id: sentEmails.id }).from(sentEmails)
              .where(and(
                eq(sentEmails.contactId, msg.contactId),
                eq(sentEmails.templateId, template.id),
                or(eq(sentEmails.status, "opened"), eq(sentEmails.status, "clicked"))
              ))
              .limit(1);
            if (openedEmail) {
              await db.update(whatsappMessages)
                .set({ status: "failed", errorMessage: "Skipped: linked email was opened" })
                .where(eq(whatsappMessages.id, msg.id));
              log(`WhatsApp condicional omitido para ${msg.phone} (email ${msg.conditionEmailTemplate} ya abierto)`);
              continue;
            }
          }
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
            messageText = await generateWhatsAppMessage(contact, diagnostic || null, contact.idioma || "es");
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
export async function updateContactSubstatuses() {
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

          // Auto re-engagement: schedule disruptive email + conditional WhatsApp
          try {
            const reengTemplate = await db.select().from(emailTemplates)
              .where(eq(emailTemplates.nombre, "reengagement")).limit(1);
            if (reengTemplate.length > 0) {
              const [diagnostic] = contact.diagnosticId
                ? await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId))
                : [null];
              const reeng = await generateReengagement(contact, diagnostic, contact.id, contact.idioma || "es");
              await db.insert(sentEmails).values({
                contactId: contact.id,
                templateId: reengTemplate[0].id,
                scheduledFor: new Date(Date.now() + 2 * 3600000), // +2 hours
                subject: reeng.subject,
                body: reeng.body,
              });

              // WhatsApp follow-up if email not opened after 48h
              if (contact.telefono && isWhatsAppConfigured()) {
                await db.insert(whatsappMessages).values({
                  contactId: contact.id,
                  phone: contact.telefono,
                  message: `Hola ${contact.nombre}, ¿sigue siendo buen momento para hablar sobre automatización en ${contact.empresa}? Si prefieres, podemos reagendar. — Equipo IM3`,
                  scheduledFor: new Date(Date.now() + 50 * 3600000), // +50 hours
                  conditionType: "if_email_not_opened",
                  conditionEmailTemplate: "reengagement",
                });
              }
              log(`Re-engagement programado para lead frío: ${contact.nombre} (${contact.empresa})`);
            }
          } catch (reengErr) {
            log(`Error programando re-engagement: ${reengErr}`);
          }
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
export async function checkOverdueTasks() {
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
export async function generateAndSendDailyNewsletter() {
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
export async function processPostMeetingRecordings() {
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

/**
 * Send admin a daily briefing with today's meetings + client info + Meet links.
 * Runs every morning at 7:00 AM Colombia (12:00 UTC).
 */
export async function sendAdminDailyBriefing() {
  if (!db || !isEmailConfigured()) return;

  try {
    const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
    const baseUrl = process.env.BASE_URL || "https://im3systems.com";

    // Get all scheduled diagnostics
    const allDiags = await db.select().from(diagnostics)
      .where(eq(diagnostics.meetingStatus, "scheduled"));

    if (allDiags.length === 0) return;

    const now = new Date();
    const todayMeetings: Array<{ diag: typeof allDiags[0]; contact: any }> = [];

    for (const diag of allDiags) {
      if (!diag.fechaCita || !diag.horaCita) continue;

      const appointmentDate = parseFechaCita(diag.fechaCita, diag.horaCita);
      const hoursUntil = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Include meetings happening in the next 24 hours
      if (hoursUntil > 0 && hoursUntil <= 24) {
        // Find the associated contact
        const [contact] = await db.select().from(contacts)
          .where(eq(contacts.diagnosticId, diag.id)).limit(1);
        if (contact) {
          todayMeetings.push({ diag, contact });
        }
      }
    }

    if (todayMeetings.length === 0) return;

    // Build the briefing email
    const meetingsHtml = todayMeetings.map(({ diag, contact }) => {
      const meetBtn = diag.meetLink
        ? `<a href="${diag.meetLink}" style="display:inline-block;background:#10B981;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;margin-top:8px">Unirse a Meet →</a>`
        : `<span style="color:#EF4444;font-size:13px">⚠ Sin link de Meet</span>`;

      return `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <h3 style="margin:0 0 4px;font-size:16px;color:#0F172A">${diag.participante}</h3>
            <p style="margin:0;color:#3B82F6;font-weight:600;font-size:14px">${diag.empresa}</p>
          </div>
          <div style="text-align:right">
            <p style="margin:0;font-weight:700;font-size:15px;color:#0F172A">${diag.horaCita}</p>
            <p style="margin:0;color:#64748B;font-size:13px">${diag.fechaCita}</p>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
          <tr><td style="padding:4px 0;color:#666;width:120px">Email</td><td style="padding:4px 0">${diag.email}</td></tr>
          ${diag.telefono ? `<tr><td style="padding:4px 0;color:#666">Teléfono</td><td style="padding:4px 0">${diag.telefono}</td></tr>` : ""}
          ${diag.industria ? `<tr><td style="padding:4px 0;color:#666">Industria</td><td style="padding:4px 0">${getIndustriaLabel(diag.industria)}${diag.industria === "otro" && diag.industriaOtro ? ` (${diag.industriaOtro})` : ""}</td></tr>` : ""}
          ${diag.empleados ? `<tr><td style="padding:4px 0;color:#666">Empleados</td><td style="padding:4px 0">${diag.empleados}</td></tr>` : ""}
          ${diag.areaPrioridad ? `<tr><td style="padding:4px 0;color:#666">Área prioritaria</td><td style="padding:4px 0">${diag.areaPrioridad}</td></tr>` : ""}
          ${diag.objetivos ? `<tr><td style="padding:4px 0;color:#666">Objetivos</td><td style="padding:4px 0">${diag.objetivos}</td></tr>` : ""}
          ${diag.herramientas ? `<tr><td style="padding:4px 0;color:#666">Herramientas</td><td style="padding:4px 0">${diag.herramientas}</td></tr>` : ""}
          ${diag.presupuesto ? `<tr><td style="padding:4px 0;color:#666">Presupuesto</td><td style="padding:4px 0">${diag.presupuesto}</td></tr>` : ""}
        </table>
        <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
          ${meetBtn}
          <a href="${baseUrl}/admin/contacts/${contact.id}" style="display:inline-block;color:#3B82F6;font-size:13px;text-decoration:none;margin-left:8px">Ver en CRM →</a>
        </div>
      </div>`;
    }).join("");

    await sendEmail(
      adminEmail,
      `📋 Hoy tienes ${todayMeetings.length} reunión${todayMeetings.length > 1 ? "es" : ""} programada${todayMeetings.length > 1 ? "s" : ""}`,
      `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
        <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:20px 28px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;font-size:18px;margin:0">📋 Briefing del día — ${todayMeetings.length} reunión${todayMeetings.length > 1 ? "es" : ""}</h1>
        </div>
        <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
          ${meetingsHtml}
          <p style="color:#94A3B8;font-size:13px;margin-top:24px;text-align:center">— IM3 Systems CRM</p>
        </div>
      </div>`
    );

    log(`Admin briefing enviado: ${todayMeetings.length} reunión(es) hoy`);
  } catch (err: any) {
    log(`Error en admin daily briefing: ${err?.message || err}`);
  }
}

/**
 * Auto-analyze recent GitHub commits for all projects with AI tracking enabled.
 * Fetches last 10 commits from GitHub API and processes any new ones.
 */
export async function autoAnalyzeProjectCommits() {
  if (!db) return;

  try {
    const { analyzeCommitsForProject } = await import("./project-ai");
    const { projectActivityEntries } = await import("@shared/schema");

    // Get projects with AI tracking enabled and a GitHub repo configured
    const projects = await db.select().from(clientProjects)
      .where(and(
        eq(clientProjects.aiTrackingEnabled, true),
        not(eq(clientProjects.status, "completed"))
      ));

    if (projects.length === 0) return;

    let totalEntries = 0;

    for (const project of projects) {
      if (!project.githubRepoUrl) continue;

      try {
        const repoPath = project.githubRepoUrl.replace("https://github.com/", "").replace(/\/$/, "");
        const ghHeaders: Record<string, string> = { "Accept": "application/vnd.github.v3+json", "User-Agent": "IM3-Systems-CRM" };
        if (process.env.GITHUB_TOKEN) ghHeaders["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;

        const ghRes = await fetch(`https://api.github.com/repos/${repoPath}/commits?per_page=10&since=${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`, { headers: ghHeaders });
        if (!ghRes.ok) {
          log(`Auto-analyze: GitHub API error ${ghRes.status} for ${repoPath}`);
          continue;
        }

        const ghCommits = await ghRes.json() as any[];
        if (!ghCommits.length) continue;

        // Check which commits we've already processed
        const existingEntries = await db.select({ commitShas: projectActivityEntries.commitShas })
          .from(projectActivityEntries)
          .where(eq(projectActivityEntries.projectId, project.id));

        const processedShas = new Set<string>();
        for (const e of existingEntries) {
          const shas = e.commitShas as string[] | null;
          if (shas) shas.forEach(s => processedShas.add(s));
        }

        const newCommits = ghCommits.filter((c: any) => !processedShas.has(c.sha));
        if (newCommits.length === 0) continue;

        const commits = newCommits.map((c: any) => ({
          sha: c.sha as string,
          message: (c.commit?.message || "") as string,
          filesChanged: [] as string[],
          timestamp: (c.commit?.author?.date || new Date().toISOString()) as string,
        }));

        const results = await analyzeCommitsForProject(project.id, commits);
        const commitShas = commits.map(c => c.sha);

        for (const result of results) {
          await db.insert(projectActivityEntries).values({
            projectId: project.id,
            source: "github_webhook",
            commitShas: commitShas,
            summaryLevel1: result.summaryLevel1,
            summaryLevel2: result.summaryLevel2 || null,
            summaryLevel3: result.summaryLevel3 || null,
            category: result.category,
            aiGenerated: true,
            isSignificant: result.isSignificant,
          });
          totalEntries++;
        }
      } catch (err: any) {
        log(`Auto-analyze error for project ${project.name}: ${err?.message}`);
      }
    }

    if (totalEntries > 0) {
      log(`Auto-analyze completado: ${totalEntries} entradas creadas para ${projects.length} proyecto(s)`);
    }
  } catch (err: any) {
    log(`Error en auto-analyze de proyectos: ${err?.message || err}`);
  }
}

/**
 * Send weekly project summary emails to all active project clients.
 * Uses generateWeeklySummary() from project-ai.ts to create AI summaries.
 */
export async function sendWeeklyProjectSummaries() {
  if (!db || !isEmailConfigured()) return;

  try {
    const { generateWeeklySummary } = await import("./project-ai");

    // Get all active projects (in_progress or planning)
    const activeProjects = await db.select().from(clientProjects)
      .where(not(eq(clientProjects.status, "completed")));

    if (activeProjects.length === 0) return;

    let sentCount = 0;
    const baseUrl = process.env.BASE_URL || "https://im3systems.com";

    for (const project of activeProjects) {
      if (!project.contactId) continue;

      // Get client contact
      const [contact] = await db.select({ email: contacts.email, nombre: contacts.nombre, optedOut: contacts.optedOut })
        .from(contacts).where(eq(contacts.id, project.contactId)).limit(1);
      if (!contact?.email || contact.optedOut) continue;

      // Generate AI summary
      const summary = await generateWeeklySummary(project.id).catch(() => null);
      if (!summary) continue;

      // Calculate progress
      const allTasks = await db.select({ status: projectTasks.status })
        .from(projectTasks).where(eq(projectTasks.projectId, project.id));
      const completedCount = allTasks.filter(t => t.status === "completed").length;
      const progress = allTasks.length > 0 ? Math.round((completedCount / allTasks.length) * 100) : 0;

      const portalUrl = `${baseUrl}/portal/${project.accessToken}`;
      const html = buildProjectNotificationEmail({
        projectName: project.name,
        clientName: contact.nombre,
        title: "Resumen semanal",
        headerEmoji: "📊",
        headerColor: "linear-gradient(135deg,#0F172A,#1E293B)",
        bodyLines: [
          `Aquí tienes el resumen de esta semana en tu proyecto:`,
          `<div style="background:#f8fafc;border-left:3px solid #2FA4A9;padding:12px 16px;border-radius:4px">${summary}</div>`,
          `Progreso general: <strong>${progress}%</strong> (${completedCount}/${allTasks.length} tareas completadas)`,
        ],
        ctaText: "Ver mi proyecto →",
        ctaUrl: portalUrl,
        footerNote: "Recibes este resumen cada lunes.",
      });

      await sendEmail(contact.email, `📊 Resumen semanal: ${project.name}`, html).catch(() => {});
      sentCount++;

      // Also post as a message in the portal
      await db.insert((await import("@shared/schema")).projectMessages).values({
        projectId: project.id,
        senderType: "team",
        senderName: "Resumen semanal",
        content: summary,
      }).catch(() => {});

      // Update last summary timestamp
      await db.update(clientProjects)
        .set({ lastWeeklySummaryAt: new Date() })
        .where(eq(clientProjects.id, project.id)).catch(() => {});
    }

    if (sentCount > 0) {
      log(`Resúmenes semanales enviados: ${sentCount} proyecto(s)`);
    }
  } catch (err: any) {
    log(`Error en resúmenes semanales de proyectos: ${err?.message || err}`);
  }
}

// Auto-purga propuestas en la papelera con más de 30 días.
// Después de purgar, no se pueden recuperar.
export async function purgeOldDeletedProposals(): Promise<{ recordsProcessed: number }> {
  if (!db) return { recordsProcessed: 0 };
  const RETENTION_DAYS = 30;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const { sql } = await import("drizzle-orm");
    const { proposalViews } = await import("@shared/schema");
    const oldDeleted = await db.select({ id: proposals.id })
      .from(proposals)
      .where(sql`${proposals.deletedAt} IS NOT NULL AND ${proposals.deletedAt} <= ${cutoff}`);

    if (oldDeleted.length === 0) return { recordsProcessed: 0 };

    const ids = oldDeleted.map(p => p.id);
    await db.delete(proposalViews).where(inArray(proposalViews.proposalId, ids)).catch(() => {});
    await db.delete(proposals).where(inArray(proposals.id, ids));

    log(`[purge-trash] Purgadas ${oldDeleted.length} propuestas con más de ${RETENTION_DAYS} días en papelera`);
    return { recordsProcessed: oldDeleted.length };
  } catch (err: any) {
    log(`Error purgando papelera de propuestas: ${err?.message || err}`);
    return { recordsProcessed: 0 };
  }
}

export function startEmailScheduler() {
  // Gmail sync runs independently of email system configuration
  if (isGmailConfigured()) {
    cron.schedule("*/15 * * * *", async () => {
      await runAgent("gmail-sync", syncGmailEmails).catch(err => log(`Cron error gmail sync: ${err}`));
    }, { timezone: "America/Bogota" });
    log("Gmail sync cron scheduled (every 15 min)");
  }

  if (!isEmailConfigured()) {
    log("⚠ Email system not configured (missing ANTHROPIC_API_KEY or RESEND_API_KEY)");
    return;
  }

  // Run every 5 minutes for more responsive email/WhatsApp delivery
  cron.schedule("*/15 * * * *", async () => {
    await runAgent("email-queue", processEmailQueue).catch(err => log(`Cron error queue: ${err}`));
    await runAgent("abandoned-followup", processAbandonedEmails).catch(err => log(`Cron error abandoned: ${err}`));
    await runAgent("whatsapp-queue", processWhatsAppQueue).catch(err => log(`Cron error whatsapp: ${err}`));
  }, { timezone: "America/Bogota" });

  // Run substatus updates, overdue task checks, and post-meeting recordings every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    await runAgent("substatus-updater", updateContactSubstatuses).catch(err => log(`Cron error substatus: ${err}`));
    await runAgent("overdue-tasks", checkOverdueTasks).catch(err => log(`Cron error overdue: ${err}`));
    await runAgent("post-meeting-recordings", processPostMeetingRecordings).catch(err => log(`Cron error post-meeting: ${err}`));
  }, { timezone: "America/Bogota" });

  // Fase 2: agentes IA (supervisor + meeting prep + followup writer) cada 30 min
  cron.schedule("*/30 * * * *", async () => {
    await runAgent("error-supervisor", runErrorSupervisor).catch(err => log(`Cron error supervisor: ${err}`));
    await runAgent("meeting-prep", runMeetingPrep).catch(err => log(`Cron error meeting-prep: ${err}`));
    await runAgent("followup-writer", runFollowupWriter).catch(err => log(`Cron error followup-writer: ${err}`));
  }, { timezone: "America/Bogota" });

  // Daily admin briefing at 7:00 AM Colombia time (12:00 UTC) every day
  cron.schedule("0 12 * * *", async () => {
    await runAgent("admin-briefing", sendAdminDailyBriefing).catch(err => log(`Cron error admin briefing: ${err}`));
  }, { timezone: "America/Bogota" });

  // Daily GitHub commit analysis at 6:00 AM Colombia time (11:00 UTC)
  cron.schedule("0 11 * * *", async () => {
    await runAgent("commit-analyzer", autoAnalyzeProjectCommits).catch(err => log(`Cron error auto-analyze: ${err}`));
  }, { timezone: "America/Bogota" });

  // Weekly project summaries every Monday at 7:15 AM Colombia time (12:15 UTC)
  cron.schedule("15 12 * * 1", async () => {
    await runAgent("weekly-summaries", sendWeeklyProjectSummaries).catch(err => log(`Cron error project summaries: ${err}`));
  }, { timezone: "America/Bogota" });

  // Weekly newsletter every Monday at 7:30 AM Colombia time (12:30 UTC)
  cron.schedule("30 12 * * 1", async () => {
    await runAgent("newsletter-digest", generateAndSendDailyNewsletter).catch(err => log(`Cron error newsletter: ${err}`));
  }, { timezone: "America/Bogota" });

  // Monthly cost reference freshness check (día 1 de cada mes, 9 AM COT = 14:00 UTC)
  cron.schedule("0 14 1 * *", async () => {
    await runAgent("cost-reference-freshness", runCostReferenceFreshness).catch(err => log(`Cron error cost freshness: ${err}`));
  }, { timezone: "America/Bogota" });

  // Daily purge of trashed proposals older than 30 days (3 AM COT = 8:00 UTC)
  cron.schedule("0 8 * * *", async () => {
    await runAgent("proposal-trash-purge", purgeOldDeletedProposals).catch(err => log(`Cron error proposal purge: ${err}`));
  }, { timezone: "America/Bogota" });

  // Daily GA4 analytics sync at 6:00 AM Colombia time (11:00 UTC)
  cron.schedule("0 11 * * *", async () => {
    await runAgent("analytics-sync", runAnalyticsSync).catch(err => log(`Cron error analytics sync: ${err}`));
  }, { timezone: "America/Bogota" });

  // Monthly analytics report (día 1 de cada mes, 9 AM COT = 14:00 UTC)
  cron.schedule("0 14 1 * *", async () => {
    await runAgent("analytics-monthly-report", runAnalyticsMonthlyReport).catch(err => log(`Cron error analytics monthly: ${err}`));
  }, { timezone: "America/Bogota" });

  // Also run once at startup (after 10 seconds to let DB connect)
  setTimeout(() => {
    runAgent("email-queue", processEmailQueue, { triggeredBy: "startup" }).catch(() => {});
    runAgent("abandoned-followup", processAbandonedEmails, { triggeredBy: "startup" }).catch(() => {});
    runAgent("whatsapp-queue", processWhatsAppQueue, { triggeredBy: "startup" }).catch(() => {});
  }, 10_000);

  // Catch-up: if today is Monday and newsletter hasn't been sent yet, send it now
  // (handles server restarts/deploys that cause the cron to miss its window)
  setTimeout(async () => {
    const now = new Date();
    if (now.getUTCDay() === 1) { // Monday in UTC
      log("Monday catch-up: checking if newsletter was sent today...");
      await runAgent("newsletter-digest", generateAndSendDailyNewsletter, { triggeredBy: "startup" }).catch(err => log(`Catch-up newsletter error: ${err}`));
    }
  }, 15_000);

  log("Email scheduler iniciado (cada 15 min, briefing admin 7AM, resúmenes proyecto lunes 7:15AM, newsletter lunes 7:30AM COT)");
}
