import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq, asc, isNull, sql, and, gte, lte, ilike, or, desc, count } from "drizzle-orm";
import { db } from "./db";
import { diagnostics, contacts, emailTemplates, sentEmails, abandonedLeads, newsletterSubscribers, users, contactNotes, tasks, activityLog, aiInsightsCache, deals, notifications, appointments, blogPosts, blogCategories } from "@shared/schema";
import { generateBlogContent, improveBlogContent } from "./blog-ai";
import { log } from "./index";
import { isGoogleDriveConfigured, createDiagnosticInDrive, cleanupServiceAccountDrive } from "./google-drive";
import { createCalendarEvent } from "./google-calendar";
import { isEmailConfigured, sendEmail } from "./email-sender";
import { generateEmailContent, buildMicroReminderEmail, generateContactInsight, generateWhatsAppMessage } from "./email-ai";
import { parseFechaCita } from "./date-utils";
import { requireAuth, hashPassword } from "./auth";
import { calculateLeadScore } from "./lead-scoring";
import passport from "passport";

/**
 * Calculate when to send each email based on template name,
 * adaptive to the window between now and the appointment.
 */
function calculateEmailTime(
  templateName: string,
  now: Date,
  appointmentDate: Date,
  hoursUntilCall: number
): Date | null {
  switch (templateName) {
    case "confirmacion":
      // Always send immediately
      return now;

    case "caso_exito":
      // Send next morning at 10 AM Colombia, only if 36+ hours until call
      if (hoursUntilCall < 36) return null;
      const nextMorning = new Date(now);
      nextMorning.setUTCDate(nextMorning.getUTCDate() + 1);
      nextMorning.setUTCHours(15, 0, 0, 0); // 15:00 UTC = 10:00 AM Colombia
      return nextMorning;

    case "insight_educativo":
      // Send day 3 at 10 AM Colombia, only if 96+ hours until call
      if (hoursUntilCall < 96) return null;
      const day3 = new Date(now);
      day3.setUTCDate(day3.getUTCDate() + 3);
      day3.setUTCHours(15, 0, 0, 0); // 15:00 UTC = 10:00 AM Colombia
      return day3;

    case "prep_agenda":
      // Send 24 hours before appointment
      const prep = new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000);
      // Don't send if it's already past or too close to now
      if (prep.getTime() <= now.getTime() + 2 * 60 * 60 * 1000) return null;
      return prep;

    case "recordatorio_6h":
      // Send 6 hours before appointment
      if (hoursUntilCall < 2) return null;
      const reminder6h = new Date(appointmentDate.getTime() - 6 * 60 * 60 * 1000);
      if (reminder6h.getTime() <= now.getTime()) return null;
      return reminder6h;

    case "micro_recordatorio":
      // Send 1 hour before appointment
      const reminder = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
      if (reminder.getTime() <= now.getTime()) return null;
      return reminder;

    case "seguimiento_post":
      // Send 5 hours after appointment
      const followUp = new Date(appointmentDate.getTime() + 5 * 60 * 60 * 1000);
      if (followUp.getTime() <= now.getTime()) return null;
      return followUp;

    default:
      return null;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Helper: log activity to audit trail (non-throwing)
  async function logActivity(contactId: string, type: string, description: string, metadata?: Record<string, any>) {
    if (!db) return;
    try {
      await db.insert(activityLog).values({ contactId, type, description, metadata: metadata || null });
    } catch (err) {
      log(`Error logging activity: ${err}`);
    }
  }

  // Diagnostic form submission
  app.post("/api/diagnostic", async (req, res) => {
    const data = req.body;

    if (!data || !data.empresa) {
      res.status(400).json({ error: "Datos incompletos" });
      return;
    }

    log(`Diagnóstico recibido: ${data.empresa} — ${data.participante}`);

    let insertedId: string | null = null;

    // Save to PostgreSQL if database is available
    if (db) {
      try {
        const [inserted] = await db.insert(diagnostics).values({
          fechaCita: data.fechaCita,
          horaCita: data.horaCita,
          empresa: data.empresa,
          industria: data.industria,
          anosOperacion: data.anosOperacion,
          empleados: data.empleados,
          ciudades: data.ciudades,
          participante: data.participante,
          email: data.email,
          telefono: data.telefono || null,
          objetivos: data.objetivos,
          resultadoEsperado: data.resultadoEsperado,
          productos: data.productos,
          volumenMensual: data.volumenMensual,
          clientePrincipal: data.clientePrincipal,
          clientePrincipalOtro: data.clientePrincipalOtro || null,
          canalesAdquisicion: data.canalesAdquisicion,
          canalAdquisicionOtro: data.canalAdquisicionOtro || null,
          canalPrincipal: data.canalPrincipal,
          herramientas: data.herramientas,
          conectadas: data.conectadas,
          conectadasDetalle: data.conectadasDetalle || null,
          nivelTech: data.nivelTech,
          usaIA: data.usaIA,
          usaIAParaQue: data.usaIAParaQue || null,
          comodidadTech: data.comodidadTech,
          familiaridad: data.familiaridad,
          areaPrioridad: data.areaPrioridad,
          presupuesto: data.presupuesto,
        }).returning();

        insertedId = inserted.id;
        log(`Diagnóstico guardado en DB: ${inserted.id}`);
      } catch (err) {
        console.error("Error guardando en DB:", err);
        // Continue — still respond success and try GHL
      }
    } else {
      console.log("Datos del diagnóstico (sin DB):", JSON.stringify(data, null, 2));
    }

    // Create Google Drive folder + Sheet (non-blocking)
    if (isGoogleDriveConfigured()) {
      createDiagnosticInDrive(data)
        .then(({ folderUrl }) => {
          if (db && insertedId) {
            db.update(diagnostics)
              .set({ googleDriveUrl: folderUrl })
              .where(eq(diagnostics.id, insertedId))
              .catch((err: unknown) => log(`Error updating Drive URL: ${err}`));
          }
        })
        .catch((err: unknown) => {
          log(`Error creando Google Drive: ${err}`);
        });
    }

    // Send contact data to GHL webhook (non-blocking)
    const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL;
    if (GHL_WEBHOOK_URL) {
      fetch(GHL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: data.empresa,
          participante: data.participante,
          industria: data.industria,
          empleados: data.empleados,
          fechaCita: data.fechaCita,
          horaCita: data.horaCita,
          presupuesto: data.presupuesto,
        }),
      })
        .then(() => {
          log(`GHL webhook enviado: ${data.empresa}`);
          if (db && insertedId) {
            db.update(diagnostics)
              .set({ sentToGhl: true })
              .where(eq(diagnostics.id, insertedId))
              .catch((err: unknown) => log(`Error updating GHL status: ${err}`));
          }
        })
        .catch((err: unknown) => {
          log(`Error webhook GHL: ${err}`);
        });
    }

    // Create Google Calendar event with Meet link (non-blocking)
    if (db && insertedId && data.email) {
      createCalendarEvent({
        diagnosticId: insertedId,
        empresa: data.empresa,
        participante: data.participante,
        email: data.email,
        fechaCita: data.fechaCita,
        horaCita: data.horaCita,
      })
        .then((result) => {
          if (result?.meetLink && db && insertedId) {
            db.update(diagnostics)
              .set({ meetLink: result.meetLink })
              .where(eq(diagnostics.id, insertedId))
              .catch((err: unknown) => log(`Error saving Meet link: ${err}`));
          }
        })
        .catch((err: unknown) => {
          log(`Error creando evento Calendar: ${err}`);
        });
    }

    // Schedule adaptive email sequence (non-blocking)
    if (db && insertedId && data.email && isEmailConfigured()) {
      (async () => {
        try {
          // Check for existing contact (prevent duplicates on double-submit)
          const [existingContact] = await db.select().from(contacts)
            .where(eq(contacts.email, data.email)).limit(1);
          if (existingContact) {
            log(`Contacto ${data.email} ya existe — saltando secuencia duplicada`);
            return;
          }

          // Create contact
          const [contact] = await db.insert(contacts).values({
            diagnosticId: insertedId!,
            email: data.email,
            nombre: data.participante,
            empresa: data.empresa,
            telefono: data.telefono || null,
          }).returning();

          // Log form submission
          logActivity(contact.id, "form_submitted", `Formulario diagnóstico completado por ${data.participante}`, { empresa: data.empresa, diagnosticId: insertedId });

          // Fetch full diagnostic for AI context and lead scoring
          const [diagForAI] = await db.select().from(diagnostics).where(eq(diagnostics.id, insertedId!));

          // Calculate initial lead score
          try {
            const score = calculateLeadScore(contact, diagForAI || null, { sent: 0, opened: 0, clicked: 0 });
            await db.update(contacts).set({ leadScore: score }).where(eq(contacts.id, contact.id));
            logActivity(contact.id, "score_changed", `Lead score inicial: ${score}`, { oldScore: 0, newScore: score });
          } catch (err) {
            log(`Error calculating lead score: ${err}`);
          }

          // Get active sequence templates (exclude abandono at order 99)
          const templates = await db
            .select()
            .from(emailTemplates)
            .where(eq(emailTemplates.isActive, true))
            .orderBy(asc(emailTemplates.sequenceOrder));

          const sequenceTemplates = templates.filter(t => t.sequenceOrder < 90);

          if (sequenceTemplates.length === 0) {
            log("⚠ No se encontraron templates activos — correr seed");
          }

          // Parse appointment date for adaptive scheduling
          const now = new Date();
          const appointmentDate = parseFechaCita(data.fechaCita, data.horaCita);
          const hoursUntilCall = Math.max(0, (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60));

          let scheduled = 0;

          for (const template of sequenceTemplates) {
            const scheduledFor = calculateEmailTime(template.nombre, now, appointmentDate, hoursUntilCall);
            if (!scheduledFor) continue; // Skip this email (adaptive logic)

            // Pre-generate email content so admins can preview/edit before sending
            let subject: string | null = null;
            let body: string | null = null;
            try {
              if (template.nombre === "micro_recordatorio") {
                const r = buildMicroReminderEmail(
                  data.participante, data.horaCita,
                  diagForAI?.meetLink || null, contact.id
                );
                subject = r.subject;
                body = r.body;
              } else {
                const r = await generateEmailContent(template, diagForAI || null, contact.id);
                subject = r.subject;
                body = r.body;
              }
            } catch (err) {
              log(`Pre-gen failed for ${template.nombre}: ${err}`);
              // Fallback: cron will regenerate at send time
            }

            await db.insert(sentEmails).values({
              contactId: contact.id,
              templateId: template.id,
              scheduledFor,
              subject,
              body,
            });
            scheduled++;
          }

          log(`Secuencia de ${scheduled} email(s) programada para ${data.email} (${Math.round(hoursUntilCall)}h hasta la cita)`);

          // Auto-create follow-up tasks
          try {
            await db.insert(tasks).values({
              contactId: contact.id,
              title: `Revisar diagnóstico de ${data.empresa}`,
              priority: "high",
              dueDate: new Date(),
            });
            const postCitaDate = new Date(appointmentDate.getTime() + 24 * 60 * 60 * 1000);
            await db.insert(tasks).values({
              contactId: contact.id,
              title: `Follow-up post-cita con ${data.empresa}`,
              priority: "medium",
              dueDate: postCitaDate,
            });
            logActivity(contact.id, "task_created", "Tareas automáticas creadas para diagnóstico");
          } catch (taskErr) {
            log(`Error creating auto-tasks: ${taskErr}`);
          }

          // Create notification for new lead
          try {
            await db.insert(notifications).values({
              type: "new_lead",
              title: "Nuevo lead",
              description: `${data.participante} de ${data.empresa} completó el diagnóstico`,
              contactId: contact.id,
            });
          } catch (_) {}

          // Send email notification to admin (non-blocking)
          const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
          const baseUrl = process.env.BASE_URL || "https://im3systems.com";
          sendEmail(
            adminEmail,
            `🔔 Nuevo lead: ${data.participante} de ${data.empresa}`,
            `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
              <div style="background:#2B7A78;padding:20px 28px;border-radius:8px 8px 0 0">
                <h1 style="color:#fff;font-size:18px;margin:0">Nuevo Lead en IM3 CRM</h1>
              </div>
              <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                  <tr><td style="padding:6px 0;color:#666;width:120px">Nombre</td><td style="padding:6px 0;font-weight:600">${data.participante}</td></tr>
                  <tr><td style="padding:6px 0;color:#666">Empresa</td><td style="padding:6px 0;font-weight:600">${data.empresa}</td></tr>
                  <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${data.email}</td></tr>
                  ${data.telefono ? `<tr><td style="padding:6px 0;color:#666">Teléfono</td><td style="padding:6px 0">${data.telefono}</td></tr>` : ""}
                  <tr><td style="padding:6px 0;color:#666">Industria</td><td style="padding:6px 0">${data.industria || "—"}</td></tr>
                  <tr><td style="padding:6px 0;color:#666">Cita</td><td style="padding:6px 0">${data.fechaCita || "—"} ${data.horaCita || ""}</td></tr>
                  <tr><td style="padding:6px 0;color:#666">Presupuesto</td><td style="padding:6px 0">${data.presupuesto || "—"}</td></tr>
                </table>
                <div style="margin-top:20px">
                  <a href="${baseUrl}/admin/contacts/${contact.id}" style="display:inline-block;background:#2B7A78;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">Ver en CRM →</a>
                </div>
              </div>
            </div>`
          ).catch((err) => log(`Error sending admin notification: ${err}`));
        } catch (err) {
          log(`Error programando emails: ${err}`);
        }
      })();
    }

    // Mark abandoned lead as converted (non-blocking)
    if (db && data.email) {
      db.update(abandonedLeads)
        .set({ converted: true })
        .where(eq(abandonedLeads.email, data.email))
        .catch((err: unknown) => log(`Error marking lead converted: ${err}`));
    }

    res.json({ success: true, id: insertedId });
  });

  // Resend webhook for tracking (opens, clicks, bounces)
  app.post("/api/email-webhook", async (req, res) => {
    const event = req.body;

    if (!db || !event?.data?.email_id) {
      res.json({ received: true });
      return;
    }

    try {
      const messageId = event.data.email_id;
      const statusMap: Record<string, string> = {
        "email.opened": "opened",
        "email.clicked": "clicked",
        "email.bounced": "bounced",
        "email.complained": "bounced",
      };

      const newStatus = statusMap[event.type];
      if (newStatus) {
        const [updatedEmail] = await db
          .update(sentEmails)
          .set({ status: newStatus })
          .where(eq(sentEmails.resendMessageId, messageId))
          .returning();

        log(`Email webhook: ${event.type} para ${messageId}`);

        // Log activity for engagement events
        if (updatedEmail) {
          const eventTypeMap: Record<string, string> = { opened: "email_opened", clicked: "email_clicked", bounced: "email_bounced" };
          const eventDescMap: Record<string, string> = { opened: "abrió un email", clicked: "hizo click en un email", bounced: "email rebotó" };
          logActivity(updatedEmail.contactId, eventTypeMap[newStatus] || newStatus, eventDescMap[newStatus] || newStatus, { emailId: updatedEmail.id, subject: updatedEmail.subject });

          // Create notifications for engagement
          if (newStatus === "clicked") {
            db.insert(notifications).values({
              type: "email_clicked",
              title: "Email clickeado",
              description: `Un contacto hizo click en "${updatedEmail.subject || "email"}"`,
              contactId: updatedEmail.contactId,
            }).catch(() => {});
          }

          // Email admin for bounces/complaints
          if (newStatus === "bounced") {
            const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
            const eventLabel = event.type === "email.complained" ? "Complaint" : "Bounce";
            // Get contact email for the notification
            const [bounceContact] = await db.select().from(contacts).where(eq(contacts.id, updatedEmail.contactId));
            const recipientEmail = bounceContact?.email || "desconocido";
            sendEmail(
              adminEmail,
              `⚠️ Email ${eventLabel.toLowerCase()}: ${recipientEmail}`,
              `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
                <div style="background:#f59e0b;padding:20px 28px;border-radius:8px 8px 0 0">
                  <h1 style="color:#fff;font-size:18px;margin:0">⚠️ Email ${eventLabel}</h1>
                </div>
                <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                  <table style="width:100%;border-collapse:collapse;font-size:14px">
                    <tr><td style="padding:8px 0;color:#666">Tipo</td><td style="padding:8px 0;font-weight:600">${eventLabel}</td></tr>
                    <tr><td style="padding:8px 0;color:#666">Destinatario</td><td style="padding:8px 0">${recipientEmail}</td></tr>
                    <tr><td style="padding:8px 0;color:#666">Asunto</td><td style="padding:8px 0">${updatedEmail.subject || "N/A"}</td></tr>
                    <tr><td style="padding:8px 0;color:#666">Resend ID</td><td style="padding:8px 0;font-size:12px;color:#999">${messageId}</td></tr>
                  </table>
                  <p style="font-size:13px;color:#666;margin:16px 0 0">Revisa la lista de contactos para verificar el email o desactivar envíos a este destinatario.</p>
                </div>
              </div>`
            ).catch((err) => log(`Error sending bounce admin email: ${err}`));
          }
        }

        // Recalculate lead score on engagement events
        if (updatedEmail && (newStatus === "opened" || newStatus === "clicked")) {
          try {
            const [contact] = await db.select().from(contacts).where(eq(contacts.id, updatedEmail.contactId));
            if (contact) {
              const oldScore = contact.leadScore;
              const [diagnostic] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId!));
              const contactEmails = await db.select().from(sentEmails).where(eq(sentEmails.contactId, contact.id));
              const emailSummary = { sent: 0, opened: 0, clicked: 0 };
              for (const e of contactEmails) {
                if (e.status === "sent" || e.status === "opened" || e.status === "clicked") emailSummary.sent++;
                if (e.status === "opened") emailSummary.opened++;
                if (e.status === "clicked") emailSummary.clicked++;
              }
              const score = calculateLeadScore(contact, diagnostic || null, emailSummary);
              await db.update(contacts).set({ leadScore: score }).where(eq(contacts.id, contact.id));
              if (score !== oldScore) {
                logActivity(contact.id, "score_changed", `Lead score: ${oldScore} → ${score}`, { oldScore, newScore: score });
                // Hot lead notification
                if (score > 60 && oldScore <= 60) {
                  db.insert(notifications).values({
                    type: "hot_lead",
                    title: "Hot lead detectado",
                    description: `${contact.nombre} (${contact.empresa}) alcanzó score ${score}`,
                    contactId: contact.id,
                  }).catch(() => {});

                  // Email admin about hot lead
                  const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
                  const baseUrl = process.env.BASE_URL || "https://im3systems.com";
                  sendEmail(
                    adminEmail,
                    `🔥 Hot lead: ${contact.nombre} — Score ${score}`,
                    `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
                      <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0">
                        <h1 style="color:#fff;font-size:18px;margin:0">🔥 Hot Lead Detectado</h1>
                      </div>
                      <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                        <table style="width:100%;border-collapse:collapse;font-size:14px">
                          <tr><td style="padding:8px 0;color:#666">Nombre</td><td style="padding:8px 0;font-weight:600">${contact.nombre}</td></tr>
                          <tr><td style="padding:8px 0;color:#666">Empresa</td><td style="padding:8px 0">${contact.empresa}</td></tr>
                          <tr><td style="padding:8px 0;color:#666">Email</td><td style="padding:8px 0">${contact.email}</td></tr>
                          <tr><td style="padding:8px 0;color:#666">Score anterior</td><td style="padding:8px 0">${oldScore}</td></tr>
                          <tr><td style="padding:8px 0;color:#666">Score actual</td><td style="padding:8px 0;font-weight:600;color:#dc2626">${score}</td></tr>
                        </table>
                        <div style="margin-top:20px;text-align:center">
                          <a href="${baseUrl}/admin/contacts" style="background:#2B7A78;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px">Ver en CRM →</a>
                        </div>
                      </div>
                    </div>`
                  ).catch((err) => log(`Error sending hot lead admin email: ${err}`));
                }
              }
            }
          } catch (scoreErr) {
            log(`Error recalculating lead score: ${scoreErr}`);
          }
        }
      }
    } catch (err) {
      log(`Error procesando email webhook: ${err}`);
    }

    res.json({ received: true });
  });

  // Track email for abandonment detection
  app.post("/api/track-email", async (req, res) => {
    const { email } = req.body;

    if (!db || !email) {
      res.json({ tracked: true });
      return;
    }

    try {
      // Upsert: insert or update capturedAt if email already exists
      const existing = await db
        .select()
        .from(abandonedLeads)
        .where(eq(abandonedLeads.email, email))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(abandonedLeads)
          .set({ capturedAt: new Date(), converted: false, emailSent: false })
          .where(eq(abandonedLeads.email, email));
      } else {
        await db.insert(abandonedLeads).values({ email });
      }

      log(`Email tracked: ${email}`);
    } catch (err) {
      log(`Error tracking email: ${err}`);
    }

    res.json({ tracked: true });
  });

  // Newsletter subscription
  app.post("/api/newsletter/subscribe", async (req, res) => {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Email inválido" });
      return;
    }

    if (!db) {
      res.json({ success: true });
      return;
    }

    try {
      // Check if already subscribed
      const existing = await db
        .select()
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.email, email))
        .limit(1);

      const alreadySubscribed = existing.length > 0 && existing[0].isActive;

      // Handle newsletter subscriber record (create or reactivate)
      if (!alreadySubscribed) {
        if (existing.length > 0) {
          // Reactivate
          await db
            .update(newsletterSubscribers)
            .set({ isActive: true, unsubscribedAt: null })
            .where(eq(newsletterSubscribers.email, email));
        } else {
          await db.insert(newsletterSubscribers).values({ email });
        }
        log(`Newsletter subscriber: ${email}`);
      }

      // ALWAYS ensure CRM contact exists (even if already subscribed)
      let contactId: string | null = null;
      try {
        const existingContact = await db
          .select()
          .from(contacts)
          .where(eq(contacts.email, email))
          .limit(1);

        if (existingContact.length === 0) {
          const namePart = email.split("@")[0].replace(/[._-]/g, " ");
          const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

          const [newContact] = await db.insert(contacts).values({
            email,
            nombre: displayName,
            empresa: "—",
            status: "lead",
            tags: ["newsletter"],
            leadScore: 5,
          }).returning();
          contactId = newContact?.id || null;
          log(`CRM contact created from newsletter: ${email} → id: ${contactId}`);
        } else {
          contactId = existingContact[0].id;
          log(`CRM contact already exists for newsletter: ${email} → id: ${contactId}`);
        }
      } catch (contactErr) {
        log(`ERROR creating CRM contact for newsletter ${email}: ${contactErr}`);
      }

      // Log activity for newsletter subscription
      if (contactId) {
        logActivity(contactId, "newsletter_subscribed", `Se suscribió al newsletter con ${email}`);
      }

      // Send welcome email only for new subscriptions
      if (!alreadySubscribed && process.env.RESEND_API_KEY) {
        const welcomeSubject = "Bienvenido al newsletter de IM3 Systems";
        const welcomeHtml = `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
          <div style="background:#2B7A78;padding:24px 32px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:22px;margin:0">IM3 Systems</h1>
          </div>
          <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
            <h2 style="color:#2B7A78;font-size:20px;margin:0 0 16px">¡Gracias por suscribirte!</h2>
            <p style="line-height:1.6;margin:0 0 16px">Cada semana recibirás las tendencias más relevantes en inteligencia artificial, automatización y tecnología aplicada a empresas.</p>
            <p style="line-height:1.6;margin:0 0 16px">No solo noticias — te compartiremos <strong>3 pasos concretos</strong> que puedes implementar en tu empresa esa misma semana.</p>
            <p style="line-height:1.6;margin:0 0 24px">Nuestro objetivo: que en 2 minutos de lectura obtengas valor real para tu operación.</p>
            <p style="line-height:1.6;margin:0;color:#666">— Equipo IM3 Systems</p>
          </div>
        </div>`;

        sendEmail(email, welcomeSubject, welcomeHtml).catch((err) => {
          log(`Error sending newsletter welcome: ${err}`);
        });

        // Notify admin about new subscriber (non-blocking)
        const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
        sendEmail(
          adminEmail,
          `📬 Nueva suscripción newsletter: ${email}`,
          `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
            <div style="background:#2B7A78;padding:20px 28px;border-radius:8px 8px 0 0">
              <h1 style="color:#fff;font-size:18px;margin:0">Nueva Suscripción Newsletter</h1>
            </div>
            <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
              <p style="font-size:14px;line-height:1.6;margin:0 0 16px"><strong>${email}</strong> se suscribió al newsletter de IM3 Systems.</p>
              <p style="font-size:13px;color:#666;margin:0">Se creó un contacto en el CRM automáticamente.</p>
            </div>
          </div>`
        ).catch((err) => log(`Error sending admin newsletter notification: ${err}`));
      }

      res.json({ success: true, alreadySubscribed, contactCreated: !!contactId });
    } catch (err) {
      log(`Error newsletter subscribe: ${err}`);
      res.status(500).json({ error: "Error interno" });
    }
  });

  // Newsletter unsubscribe
  app.get("/api/newsletter/unsubscribe/:email", async (req, res) => {
    if (!db) return res.status(500).send("Error");
    try {
      const email = decodeURIComponent(req.params.email as string);
      await db.update(newsletterSubscribers)
        .set({ isActive: false, unsubscribedAt: new Date() })
        .where(eq(newsletterSubscribers.email, email));
      res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Te has desuscrito</h2><p>Ya no recibirás el newsletter de IM3 Systems.</p><a href="https://www.im3systems.com">Volver al sitio</a></body></html>`);
    } catch (err) {
      res.status(500).send("Error procesando la solicitud");
    }
  });

  // Regenerate Google Drive files for diagnostics that failed
  app.post("/api/admin/regenerate-drive", requireAuth, async (req, res) => {
    if (!db || !isGoogleDriveConfigured()) {
      res.status(400).json({ error: "DB or Google Drive not configured" });
      return;
    }

    try {
      // Find all diagnostics without a Drive URL
      const failed = await db
        .select()
        .from(diagnostics)
        .where(isNull(diagnostics.googleDriveUrl));

      if (failed.length === 0) {
        res.json({ message: "No hay diagnósticos pendientes", regenerated: 0 });
        return;
      }

      const results: { id: string; empresa: string; status: string; folderUrl?: string; error?: string }[] = [];

      for (const diag of failed) {
        try {
          const data = {
            fechaCita: diag.fechaCita,
            horaCita: diag.horaCita,
            empresa: diag.empresa,
            industria: diag.industria,
            anosOperacion: diag.anosOperacion,
            empleados: diag.empleados,
            ciudades: diag.ciudades,
            participante: diag.participante,
            objetivos: diag.objetivos as string[],
            resultadoEsperado: diag.resultadoEsperado,
            productos: diag.productos,
            volumenMensual: diag.volumenMensual,
            clientePrincipal: diag.clientePrincipal,
            clientePrincipalOtro: diag.clientePrincipalOtro || undefined,
            canalesAdquisicion: diag.canalesAdquisicion as string[],
            canalAdquisicionOtro: diag.canalAdquisicionOtro || undefined,
            canalPrincipal: diag.canalPrincipal,
            herramientas: diag.herramientas,
            conectadas: diag.conectadas,
            conectadasDetalle: diag.conectadasDetalle || undefined,
            nivelTech: diag.nivelTech,
            usaIA: diag.usaIA,
            usaIAParaQue: diag.usaIAParaQue || undefined,
            comodidadTech: diag.comodidadTech,
            familiaridad: diag.familiaridad as any,
            areaPrioridad: diag.areaPrioridad as string[],
            presupuesto: diag.presupuesto,
          };

          const { folderUrl } = await createDiagnosticInDrive(data);

          await db.update(diagnostics)
            .set({ googleDriveUrl: folderUrl })
            .where(eq(diagnostics.id, diag.id));

          results.push({ id: diag.id, empresa: diag.empresa, status: "ok", folderUrl });
        } catch (err: any) {
          results.push({ id: diag.id, empresa: diag.empresa, status: "error", error: err?.message || String(err) });
        }
      }

      res.json({ regenerated: results.filter(r => r.status === "ok").length, total: failed.length, results });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // Cleanup service account Drive storage (empty trash + delete empty folders)
  app.post("/api/admin/cleanup-drive", requireAuth, async (req, res) => {
    try {
      const result = await cleanupServiceAccountDrive();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // ========== AUTH ROUTES ==========

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Credenciales inválidas" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        res.json({ id: user.id, username: user.username });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: "Error cerrando sesión" });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "No autorizado" });
    const user = req.user as any;
    res.json({ id: user.id, username: user.username });
  });

  // ========== ADMIN API ENDPOINTS ==========

  // Dashboard stats
  app.get("/api/admin/stats", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const allContacts = await db.select().from(contacts);
      const statusCounts = { lead: 0, contacted: 0, scheduled: 0, converted: 0 };
      for (const c of allContacts) {
        const s = c.status as keyof typeof statusCounts;
        if (s in statusCounts) statusCounts[s]++;
      }

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const weekStart = new Date(now);
      weekStart.setUTCDate(weekStart.getUTCDate() - 7);

      const allEmails = await db.select().from(sentEmails);
      const sentToday = allEmails.filter(e => e.sentAt && e.sentAt >= todayStart).length;
      const sentWeek = allEmails.filter(e => e.sentAt && e.sentAt >= weekStart).length;
      const totalSent = allEmails.filter(e => e.status !== "pending" && e.status !== "failed" && e.status !== "expired").length;
      const totalOpened = allEmails.filter(e => e.status === "opened" || e.status === "clicked").length;
      const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

      const pendingAbandoned = await db.select().from(abandonedLeads)
        .where(and(eq(abandonedLeads.converted, false), eq(abandonedLeads.emailSent, false)));

      const activeSubscribers = await db.select().from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.isActive, true));

      res.json({
        contacts: {
          total: allContacts.length,
          ...statusCounts,
        },
        emails: {
          sentToday,
          sentWeek,
          totalSent,
          openRate,
        },
        abandonedLeads: pendingAbandoned.length,
        newsletterSubscribers: activeSubscribers.length,
      });
    } catch (err: any) {
      log(`Error admin stats: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo estadísticas" });
    }
  });

  // Comprehensive dashboard
  app.get("/api/admin/dashboard", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      // --- KPIs ---
      const allContacts = await db.select().from(contacts);
      const totalContacts = allContacts.length;
      const convertedCount = allContacts.filter(c => c.status === "converted").length;
      const conversionRate = totalContacts > 0 ? Math.round((convertedCount / totalContacts) * 100 * 10) / 10 : 0;

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setUTCDate(weekStart.getUTCDate() - 7);

      const allEmails = await db.select().from(sentEmails);
      const emailsThisWeek = allEmails.filter(e => e.sentAt && e.sentAt >= weekStart).length;

      const totalSent = allEmails.filter(e => e.status !== "pending" && e.status !== "failed" && e.status !== "expired").length;
      const totalOpened = allEmails.filter(e => e.status === "opened" || e.status === "clicked").length;
      const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100 * 10) / 10 : 0;

      // Upcoming appointments: contacts with status "scheduled" and fechaCita in the future
      const scheduledContacts = allContacts.filter(c => c.status === "scheduled");
      let upcomingAppointments = 0;
      if (scheduledContacts.length > 0) {
        const diagnosticIds = scheduledContacts.map(c => c.diagnosticId);
        const diags = await db.select().from(diagnostics)
          .where(sql`${diagnostics.id} IN (${sql.join(diagnosticIds.map(id => sql`${id}`), sql`, `)})`);
        for (const d of diags) {
          if (d.fechaCita) {
            const citaDate = new Date(d.fechaCita);
            if (citaDate >= now) upcomingAppointments++;
          }
        }
      }

      // --- Pipeline ---
      const pipeline = { lead: 0, contacted: 0, scheduled: 0, converted: 0 };
      for (const c of allContacts) {
        const s = c.status as keyof typeof pipeline;
        if (s in pipeline) pipeline[s]++;
      }

      // --- Email Performance (per template) ---
      const allTemplates = await db.select().from(emailTemplates);
      const templateMap: Record<string, string> = {};
      for (const t of allTemplates) templateMap[t.id] = t.nombre;

      const templateStats: Record<string, { sent: number; opened: number }> = {};
      for (const e of allEmails) {
        if (e.status === "pending" || e.status === "failed" || e.status === "expired") continue;
        const tName = templateMap[e.templateId] || "unknown";
        if (!templateStats[tName]) templateStats[tName] = { sent: 0, opened: 0 };
        templateStats[tName].sent++;
        if (e.status === "opened" || e.status === "clicked") templateStats[tName].opened++;
      }

      const emailPerformance = Object.entries(templateStats).map(([template, stats]) => ({
        template,
        sent: stats.sent,
        opened: stats.opened,
        rate: stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100 * 10) / 10 : 0,
      }));

      // --- Recent Activity (last 8 events) ---
      const recentEmails = allEmails
        .filter(e => e.status === "sent" || e.status === "opened" || e.status === "clicked")
        .sort((a, b) => {
          const dateA = a.sentAt ? a.sentAt.getTime() : 0;
          const dateB = b.sentAt ? b.sentAt.getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 8);

      const contactMap: Record<string, { nombre: string; id: string }> = {};
      for (const c of allContacts) contactMap[c.id] = { nombre: c.nombre, id: c.id };

      const recentActivity = recentEmails.map(e => ({
        type: e.status === "sent" ? "email_sent" : "email_opened",
        contactName: contactMap[e.contactId]?.nombre || "Unknown",
        contactId: e.contactId,
        detail: templateMap[e.templateId] || "unknown",
        timestamp: e.sentAt ? e.sentAt.toISOString() : "",
      }));

      // Pending tasks count
      let pendingTasks = 0;
      let overdueTasks = 0;
      try {
        const allTasks = await db.select().from(tasks).where(eq(tasks.status, "pending"));
        pendingTasks = allTasks.length;
        overdueTasks = allTasks.filter(t => t.dueDate && t.dueDate < now).length;
      } catch {}

      // Hot leads (score > 60)
      const hotLeads = allContacts.filter(c => c.leadScore > 60).length;

      // Upcoming tasks (next 5)
      let upcomingTasks: any[] = [];
      try {
        upcomingTasks = await db.select().from(tasks)
          .where(eq(tasks.status, "pending"))
          .orderBy(asc(tasks.dueDate))
          .limit(5);
      } catch {}

      // Revenue KPIs from deals
      let pipelineValue = 0;
      let dealsWonThisMonth = 0;
      let dealsWonValue = 0;
      let totalWon = 0;
      let totalClosed = 0;
      let avgDealSize = 0;
      let staleDeals: any[] = [];
      try {
        const allDeals = await db.select().from(deals);
        const openDeals = allDeals.filter(d => d.stage !== "closed_won" && d.stage !== "closed_lost");
        pipelineValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const wonDeals = allDeals.filter(d => d.stage === "closed_won");
        totalWon = wonDeals.length;
        totalClosed = wonDeals.length + allDeals.filter(d => d.stage === "closed_lost").length;
        dealsWonThisMonth = wonDeals.filter(d => d.closedAt && d.closedAt >= monthStart).length;
        dealsWonValue = wonDeals.filter(d => d.closedAt && d.closedAt >= monthStart).reduce((sum, d) => sum + (d.value || 0), 0);
        avgDealSize = totalWon > 0 ? Math.round(wonDeals.reduce((sum, d) => sum + (d.value || 0), 0) / totalWon) : 0;

        // Stale deals (no stage change in 7+ days, still open)
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        staleDeals = openDeals.filter(d => d.createdAt && d.createdAt < sevenDaysAgo).slice(0, 5);
      } catch {}

      // Unread notifications count
      let unreadNotifications = 0;
      try {
        const [result] = await db.select({ value: count() }).from(notifications).where(eq(notifications.isRead, false));
        unreadNotifications = result?.value || 0;
      } catch {}

      // Attention needed section
      const attentionItems: any[] = [];
      // Hot leads without recent notes
      try {
        const hotLeadContacts = allContacts.filter(c => c.leadScore > 60 && c.status !== "converted");
        for (const hl of hotLeadContacts.slice(0, 5)) {
          const recentNotes = await db.select().from(contactNotes)
            .where(and(eq(contactNotes.contactId, hl.id), gte(contactNotes.createdAt, new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000))));
          if (recentNotes.length === 0) {
            attentionItems.push({ type: "hot_no_followup", contactId: hl.id, nombre: hl.nombre, empresa: hl.empresa, score: hl.leadScore });
          }
        }
      } catch {}

      // Overdue tasks
      try {
        const overdue = await db.select().from(tasks)
          .where(and(eq(tasks.status, "pending"), lte(tasks.dueDate, now)));
        for (const t of overdue.slice(0, 5)) {
          attentionItems.push({ type: "task_overdue", taskId: t.id, title: t.title, contactId: t.contactId, dueDate: t.dueDate });
        }
      } catch {}

      res.json({
        kpis: {
          totalContacts,
          conversionRate,
          emailsThisWeek,
          upcomingAppointments,
          openRate,
          pendingTasks,
          overdueTasks,
          hotLeads,
          pipelineValue,
          dealsWonThisMonth,
          dealsWonValue,
          winRate: totalClosed > 0 ? Math.round((totalWon / totalClosed) * 100) : 0,
          avgDealSize,
          unreadNotifications,
        },
        pipeline,
        emailPerformance,
        recentActivity,
        upcomingTasks,
        attentionItems,
        staleDeals,
      });
    } catch (err: any) {
      log(`Error admin dashboard: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo dashboard" });
    }
  });

  // Contacts grouped by pipeline status
  app.get("/api/admin/contacts/pipeline", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const allContacts = await db.select().from(contacts).orderBy(desc(contacts.createdAt));

      // Get email counts for all contacts
      const allEmails = await db.select().from(sentEmails);
      const emailCounts: Record<string, { sent: number; opened: number }> = {};
      for (const e of allEmails) {
        if (!emailCounts[e.contactId]) emailCounts[e.contactId] = { sent: 0, opened: 0 };
        if (e.status === "sent" || e.status === "opened" || e.status === "clicked") emailCounts[e.contactId].sent++;
        if (e.status === "opened" || e.status === "clicked") emailCounts[e.contactId].opened++;
      }

      const grouped: Record<string, any[]> = { lead: [], contacted: [], scheduled: [], converted: [] };

      for (const c of allContacts) {
        const s = c.status as string;
        if (s in grouped) {
          grouped[s].push({
            id: c.id,
            nombre: c.nombre,
            empresa: c.empresa,
            email: c.email,
            createdAt: c.createdAt,
            leadScore: c.leadScore,
            emailsSent: emailCounts[c.id]?.sent || 0,
            emailsOpened: emailCounts[c.id]?.opened || 0,
          });
        }
      }

      res.json(grouped);
    } catch (err: any) {
      log(`Error admin contacts pipeline: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo pipeline" });
    }
  });

  // CSV Export (must be before :id route)
  app.get("/api/admin/contacts/export", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { status, search, minScore, maxScore, substatus: substatusFilter } = req.query as Record<string, string>;
      const conditions = [];
      if (status) conditions.push(eq(contacts.status, status));
      if (substatusFilter) conditions.push(eq(contacts.substatus, substatusFilter));
      if (search) {
        conditions.push(
          or(
            ilike(contacts.nombre, `%${search}%`),
            ilike(contacts.empresa, `%${search}%`),
            ilike(contacts.email, `%${search}%`)
          )!
        );
      }
      if (minScore) conditions.push(gte(contacts.leadScore, parseInt(minScore)));
      if (maxScore) conditions.push(lte(contacts.leadScore, parseInt(maxScore)));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const contactList = await db.select().from(contacts).where(whereClause).orderBy(desc(contacts.createdAt));

      // Get email counts
      const allEmails = await db.select().from(sentEmails);
      const emailCounts: Record<string, { sent: number; opened: number }> = {};
      for (const e of allEmails) {
        if (!emailCounts[e.contactId]) emailCounts[e.contactId] = { sent: 0, opened: 0 };
        if (e.status === "sent" || e.status === "opened" || e.status === "clicked") emailCounts[e.contactId].sent++;
        if (e.status === "opened" || e.status === "clicked") emailCounts[e.contactId].opened++;
      }

      // Get diagnostics for industry
      const diagIds = Array.from(new Set(contactList.map(c => c.diagnosticId)));
      let diagMap: Record<string, { industria: string }> = {};
      if (diagIds.length > 0) {
        const diags = await db.select().from(diagnostics)
          .where(sql`${diagnostics.id} IN (${sql.join(diagIds.map(id => sql`${id}`), sql`, `)})`);
        for (const d of diags) diagMap[d.id] = { industria: d.industria };
      }

      const csvHeader = "Nombre,Empresa,Email,Teléfono,Industria,Status,Substatus,Lead Score,Emails Enviados,Emails Abiertos,Fecha Registro\n";
      const csvRows = contactList.map(c => {
        const ec = emailCounts[c.id] || { sent: 0, opened: 0 };
        const industria = c.diagnosticId ? diagMap[c.diagnosticId]?.industria || "" : "";
        return [
          `"${(c.nombre || "").replace(/"/g, '""')}"`,
          `"${(c.empresa || "").replace(/"/g, '""')}"`,
          `"${c.email}"`,
          `"${c.telefono || ""}"`,
          `"${industria.replace(/"/g, '""')}"`,
          c.status,
          c.substatus || "",
          c.leadScore,
          ec.sent,
          ec.opened,
          c.createdAt ? new Date(c.createdAt).toISOString().split("T")[0] : "",
        ].join(",");
      }).join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=contactos-im3.csv");
      res.send("\uFEFF" + csvHeader + csvRows); // BOM for Excel
    } catch (err: any) {
      log(`Error exporting contacts: ${err?.message}`);
      res.status(500).json({ error: "Error exportando contactos" });
    }
  });

  // Contacts list with filters
  app.get("/api/admin/contacts", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { status, search, page = "1", limit = "20", minScore, maxScore, substatus: substatusFilter, createdAfter, createdBefore, sortBy } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;

      // Build conditions
      const conditions = [];
      if (status) conditions.push(eq(contacts.status, status));
      if (substatusFilter) conditions.push(eq(contacts.substatus, substatusFilter));
      if (minScore) conditions.push(gte(contacts.leadScore, parseInt(minScore)));
      if (maxScore) conditions.push(lte(contacts.leadScore, parseInt(maxScore)));
      if (createdAfter) conditions.push(gte(contacts.createdAt, new Date(createdAfter)));
      if (createdBefore) conditions.push(lte(contacts.createdAt, new Date(createdBefore)));
      if (search) {
        conditions.push(
          or(
            ilike(contacts.nombre, `%${search}%`),
            ilike(contacts.empresa, `%${search}%`),
            ilike(contacts.email, `%${search}%`)
          )!
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const contactList = await db
        .select()
        .from(contacts)
        .where(whereClause)
        .orderBy(desc(contacts.createdAt))
        .limit(limitNum)
        .offset(offset);

      // Get total count for pagination
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(contacts)
        .where(whereClause);

      // Get email counts per contact
      const contactIds = contactList.map(c => c.id);
      let emailCounts: Record<string, { sent: number; opened: number }> = {};

      if (contactIds.length > 0) {
        const emails = await db.select().from(sentEmails)
          .where(sql`${sentEmails.contactId} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);

        for (const e of emails) {
          if (!emailCounts[e.contactId]) emailCounts[e.contactId] = { sent: 0, opened: 0 };
          if (e.status === "sent" || e.status === "opened" || e.status === "clicked") emailCounts[e.contactId].sent++;
          if (e.status === "opened" || e.status === "clicked") emailCounts[e.contactId].opened++;
        }
      }

      const enriched = contactList.map(c => ({
        ...c,
        emailsSent: emailCounts[c.id]?.sent || 0,
        emailsOpened: emailCounts[c.id]?.opened || 0,
      }));

      res.json({
        contacts: enriched,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      log(`Error admin contacts: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo contactos" });
    }
  });

  // Contact detail
  app.get("/api/admin/contacts/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    try {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

      const [diagnostic] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId!));

      const emails = await db
        .select({
          id: sentEmails.id,
          subject: sentEmails.subject,
          body: sentEmails.body,
          status: sentEmails.status,
          scheduledFor: sentEmails.scheduledFor,
          sentAt: sentEmails.sentAt,
          templateId: sentEmails.templateId,
        })
        .from(sentEmails)
        .where(eq(sentEmails.contactId, contact.id))
        .orderBy(asc(sentEmails.scheduledFor));

      // Get template names for emails
      const templateIds = Array.from(new Set(emails.map(e => e.templateId)));
      const templateNames: Record<string, string> = {};
      if (templateIds.length > 0) {
        const templates = await db.select().from(emailTemplates)
          .where(sql`${emailTemplates.id} IN (${sql.join(templateIds.map(id => sql`${id}`), sql`, `)})`);
        for (const t of templates) templateNames[t.id] = t.nombre;
      }

      const emailTimeline = emails.map(e => ({
        ...e,
        templateName: templateNames[e.templateId] || "unknown",
      }));

      res.json({ contact, diagnostic, emails: emailTimeline });
    } catch (err: any) {
      log(`Error admin contact detail: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo detalle" });
    }
  });

  // Update contact status
  app.patch("/api/admin/contacts/:id/status", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    const { status } = req.body;
    const validStatuses = ["lead", "contacted", "scheduled", "converted"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Status inválido" });
    }

    try {
      // Fetch old status for audit
      const [current] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!current) return res.status(404).json({ error: "Contacto no encontrado" });
      const oldStatus = current.status;

      const updateFields: Record<string, any> = { status };

      // Accept optional substatus
      const { substatus } = req.body;
      if (substatus !== undefined) updateFields.substatus = substatus;

      const [updated] = await db.update(contacts)
        .set(updateFields)
        .where(eq(contacts.id, contactId))
        .returning();

      logActivity(contactId, "status_changed", `Status: ${oldStatus} → ${status}`, { oldStatus, newStatus: status, substatus: substatus || null });

      log(`Contact ${updated.email} status → ${status}`);
      res.json(updated);
    } catch (err: any) {
      log(`Error updating status: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando status" });
    }
  });

  // Update contact info
  app.patch("/api/admin/contacts/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    const { nombre, empresa, email, telefono, substatus, tags } = req.body;
    const updates: Record<string, any> = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (empresa !== undefined) updates.empresa = empresa;
    if (email !== undefined) updates.email = email;
    if (telefono !== undefined) updates.telefono = telefono;
    if (substatus !== undefined) updates.substatus = substatus;
    if (tags !== undefined) updates.tags = tags;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    try {
      const [updated] = await db.update(contacts)
        .set(updates)
        .where(eq(contacts.id, contactId))
        .returning();

      if (!updated) return res.status(404).json({ error: "Contacto no encontrado" });

      logActivity(contactId, "contact_edited", `Información actualizada: ${Object.keys(updates).join(", ")}`, { changes: updates });

      log(`Contact ${updated.email} info updated`);
      res.json(updated);
    } catch (err: any) {
      log(`Error updating contact: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando contacto" });
    }
  });

  // Contact notes - list
  app.get("/api/admin/contacts/:id/notes", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    try {
      const notes = await db.select().from(contactNotes)
        .where(eq(contactNotes.contactId, contactId))
        .orderBy(desc(contactNotes.createdAt));
      res.json(notes);
    } catch (err: any) {
      log(`Error fetching notes: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo notas" });
    }
  });

  // Contact notes - create
  app.post("/api/admin/contacts/:id/notes", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Contenido requerido" });
    }

    try {
      const [note] = await db.insert(contactNotes).values({
        contactId,
        content: content.trim(),
        authorId: (req.user as any)?.id || null,
      }).returning();

      logActivity(contactId, "note_added", `Nota agregada`, { noteId: note.id });
      log(`Note added for contact ${contactId}`);
      res.json(note);
    } catch (err: any) {
      log(`Error creating note: ${err?.message}`);
      res.status(500).json({ error: "Error creando nota" });
    }
  });

  // Contact notes - delete
  app.delete("/api/admin/contacts/:id/notes/:noteId", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const noteId = req.params.noteId as string;

    try {
      const [deleted] = await db.delete(contactNotes)
        .where(eq(contactNotes.id, noteId))
        .returning();

      if (!deleted) return res.status(404).json({ error: "Nota no encontrada" });
      logActivity(req.params.id as string, "note_deleted", `Nota eliminada`, { noteId: noteId });
      res.json({ success: true });
    } catch (err: any) {
      log(`Error deleting note: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando nota" });
    }
  });

  // Email detail (body content)
  app.get("/api/admin/emails/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const emailId = req.params.id as string;

    try {
      const [email] = await db.select().from(sentEmails).where(eq(sentEmails.id, emailId));
      if (!email) return res.status(404).json({ error: "Email no encontrado" });

      // Get template name
      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, email.templateId));

      res.json({
        ...email,
        templateName: template?.nombre || "unknown",
      });
    } catch (err: any) {
      log(`Error fetching email: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo email" });
    }
  });

  // Update scheduled email (before sending)
  app.patch("/api/admin/emails/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const emailId = req.params.id as string;

    try {
      const [email] = await db.select().from(sentEmails).where(eq(sentEmails.id, emailId));
      if (!email) return res.status(404).json({ error: "Email no encontrado" });

      if (email.status !== "pending") {
        return res.status(400).json({ error: "Solo se pueden editar emails pendientes" });
      }

      const { subject, body } = req.body;
      const updates: Record<string, any> = {};
      if (subject !== undefined) updates.subject = subject;
      if (body !== undefined) updates.body = body;

      const [updated] = await db.update(sentEmails)
        .set(updates)
        .where(eq(sentEmails.id, emailId))
        .returning();

      log(`Email ${emailId} updated`);
      res.json(updated);
    } catch (err: any) {
      log(`Error updating email: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando email" });
    }
  });

  // Regenerate email content with AI
  app.post("/api/admin/emails/:id/regenerate", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const emailId = req.params.id as string;

    try {
      const [email] = await db.select().from(sentEmails).where(eq(sentEmails.id, emailId));
      if (!email) return res.status(404).json({ error: "Email no encontrado" });
      if (email.status !== "pending") {
        return res.status(400).json({ error: "Solo se pueden regenerar emails pendientes" });
      }

      // Get template, contact, diagnostic
      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, email.templateId));
      if (!template) return res.status(404).json({ error: "Template no encontrado" });

      const [contact] = await db.select().from(contacts).where(eq(contacts.id, email.contactId));
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

      const [diagnostic] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId!));

      let subject: string;
      let body: string;

      if (template.nombre === "micro_recordatorio") {
        const r = buildMicroReminderEmail(
          diagnostic?.participante || contact.nombre,
          diagnostic?.horaCita || "",
          diagnostic?.meetLink || null,
          contact.id
        );
        subject = r.subject;
        body = r.body;
      } else {
        const r = await generateEmailContent(template, diagnostic || null, contact.id);
        subject = r.subject;
        body = r.body;
      }

      const [updated] = await db.update(sentEmails)
        .set({ subject, body })
        .where(eq(sentEmails.id, emailId))
        .returning();

      log(`Email ${emailId} regenerated for ${contact.email}`);
      res.json(updated);
    } catch (err: any) {
      log(`Error regenerating email: ${err?.message}`);
      res.status(500).json({ error: "Error regenerando email" });
    }
  });

  // Calendar - upcoming appointments
  app.get("/api/admin/calendar", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const allDiagnostics = await db.select().from(diagnostics).orderBy(desc(diagnostics.createdAt));
      const allContacts = await db.select().from(contacts);
      const contactMap: Record<string, { nombre: string; empresa: string; id: string }> = {};
      for (const c of allContacts) {
        if (c.diagnosticId) contactMap[c.diagnosticId] = { nombre: c.nombre, empresa: c.empresa, id: c.id };
      }

      const appointments = allDiagnostics
        .filter(d => d.fechaCita && d.horaCita)
        .map(d => ({
          id: d.id,
          fechaCita: d.fechaCita,
          horaCita: d.horaCita,
          contactName: contactMap[d.id]?.nombre || "Unknown",
          contactCompany: contactMap[d.id]?.empresa || "",
          contactId: contactMap[d.id]?.id || "",
          meetLink: d.meetLink,
          googleDriveUrl: d.googleDriveUrl,
        }));

      res.json(appointments);
    } catch (err: any) {
      log(`Error fetching calendar: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo calendario" });
    }
  });

  // Tasks - list with filters
  app.get("/api/admin/tasks", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { status, priority, contactId, filter } = req.query as Record<string, string>;
      const conditions = [];

      if (status) conditions.push(eq(tasks.status, status));
      if (priority) conditions.push(eq(tasks.priority, priority));
      if (contactId) conditions.push(eq(tasks.contactId, contactId));

      if (filter === "today") {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        conditions.push(gte(tasks.dueDate, startOfDay));
        conditions.push(lte(tasks.dueDate, endOfDay));
      } else if (filter === "overdue") {
        conditions.push(eq(tasks.status, "pending"));
        conditions.push(lte(tasks.dueDate, new Date()));
      } else if (filter === "week") {
        const endOfWeek = new Date();
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        conditions.push(lte(tasks.dueDate, endOfWeek));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const taskList = await db.select().from(tasks)
        .where(whereClause)
        .orderBy(asc(tasks.dueDate), desc(tasks.createdAt));

      // Enrich with contact names
      const contactIds = Array.from(new Set(taskList.filter(t => t.contactId).map(t => t.contactId!)));
      const contactNames: Record<string, string> = {};
      if (contactIds.length > 0) {
        const contactList = await db.select({ id: contacts.id, nombre: contacts.nombre })
          .from(contacts)
          .where(sql`${contacts.id} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);
        for (const c of contactList) contactNames[c.id] = c.nombre;
      }

      const enriched = taskList.map(t => ({
        ...t,
        contactName: t.contactId ? (contactNames[t.contactId] || null) : null,
      }));

      res.json(enriched);
    } catch (err: any) {
      log(`Error fetching tasks: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo tareas" });
    }
  });

  // Tasks - create
  app.post("/api/admin/tasks", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    const { title, description, dueDate, priority, contactId } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Titulo requerido" });
    }

    try {
      const [task] = await db.insert(tasks).values({
        title: title.trim(),
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || "medium",
        contactId: contactId || null,
      }).returning();

      if (task.contactId) {
        logActivity(task.contactId, "task_created", `Tarea creada: ${task.title}`, { taskId: task.id });
      }

      res.json(task);
    } catch (err: any) {
      log(`Error creating task: ${err?.message}`);
      res.status(500).json({ error: "Error creando tarea" });
    }
  });

  // Tasks - update/complete
  app.patch("/api/admin/tasks/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const taskId = req.params.id as string;

    const updates: Record<string, any> = {};
    const { title, description, dueDate, priority, status } = req.body;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) {
      updates.status = status;
      if (status === "completed") updates.completedAt = new Date();
      if (status === "pending") updates.completedAt = null;
    }

    try {
      const [updated] = await db.update(tasks)
        .set(updates)
        .where(eq(tasks.id, taskId))
        .returning();

      if (!updated) return res.status(404).json({ error: "Tarea no encontrada" });

      if (updated.contactId && status === "completed") {
        logActivity(updated.contactId, "task_completed", `Tarea completada: ${updated.title}`, { taskId: updated.id });
      }

      res.json(updated);
    } catch (err: any) {
      log(`Error updating task: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando tarea" });
    }
  });

  // Tasks - delete
  app.delete("/api/admin/tasks/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const taskId = req.params.id as string;

    try {
      const [deleted] = await db.delete(tasks)
        .where(eq(tasks.id, taskId))
        .returning();

      if (!deleted) return res.status(404).json({ error: "Tarea no encontrada" });
      res.json({ success: true });
    } catch (err: any) {
      log(`Error deleting task: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando tarea" });
    }
  });

  // Seed admin user (one-time setup)
  app.post("/api/admin/setup", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      // Check if any admin user exists
      const existing = await db.select().from(users).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ error: "Admin ya existe" });
      }

      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username y password requeridos" });
      }

      const hashedPassword = await hashPassword(password);
      const [user] = await db.insert(users).values({
        username,
        password: hashedPassword,
      }).returning();

      log(`Admin user created: ${user.username}`);
      res.json({ success: true, username: user.username });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Activity log for a contact
  app.get("/api/admin/contacts/:id/activity", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    try {
      const activities = await db.select().from(activityLog)
        .where(eq(activityLog.contactId, contactId))
        .orderBy(desc(activityLog.createdAt))
        .limit(100);

      res.json(activities);
    } catch (err: any) {
      log(`Error fetching activity: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo actividad" });
    }
  });

  // AI insight for a contact (cached)
  app.get("/api/admin/contacts/:id/ai-insight", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    try {
      // Check cache (valid for 24h)
      const [cached] = await db.select().from(aiInsightsCache)
        .where(eq(aiInsightsCache.contactId, contactId));

      if (cached) {
        const age = Date.now() - new Date(cached.generatedAt).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          return res.json(cached);
        }
      }

      // Generate new insight
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

      const [diagnostic] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId!));
      const contactEmails = await db.select().from(sentEmails).where(eq(sentEmails.contactId, contactId));
      const notes = await db.select().from(contactNotes).where(eq(contactNotes.contactId, contactId));

      const insight = await generateContactInsight(contact, diagnostic || null, contactEmails, notes);

      // Upsert cache
      if (cached) {
        await db.update(aiInsightsCache)
          .set({ insight, generatedAt: new Date() })
          .where(eq(aiInsightsCache.contactId, contactId));
      } else {
        await db.insert(aiInsightsCache).values({ contactId, insight });
      }

      const [result] = await db.select().from(aiInsightsCache)
        .where(eq(aiInsightsCache.contactId, contactId));

      res.json(result);
    } catch (err: any) {
      log(`Error generating AI insight: ${err?.message}`);
      res.status(500).json({ error: "Error generando análisis AI" });
    }
  });

  // Regenerate AI insight
  app.post("/api/admin/contacts/:id/ai-insight/regenerate", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    try {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

      const [diagnostic] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId!));
      const contactEmails = await db.select().from(sentEmails).where(eq(sentEmails.contactId, contactId));
      const notes = await db.select().from(contactNotes).where(eq(contactNotes.contactId, contactId));

      const insight = await generateContactInsight(contact, diagnostic || null, contactEmails, notes);

      // Upsert cache
      const [existing] = await db.select().from(aiInsightsCache)
        .where(eq(aiInsightsCache.contactId, contactId));

      if (existing) {
        await db.update(aiInsightsCache)
          .set({ insight, generatedAt: new Date() })
          .where(eq(aiInsightsCache.contactId, contactId));
      } else {
        await db.insert(aiInsightsCache).values({ contactId, insight });
      }

      const [result] = await db.select().from(aiInsightsCache)
        .where(eq(aiInsightsCache.contactId, contactId));

      logActivity(contactId, "ai_insight_generated", "Análisis AI regenerado");
      res.json(result);
    } catch (err: any) {
      log(`Error regenerating AI insight: ${err?.message}`);
      res.status(500).json({ error: "Error regenerando análisis AI" });
    }
  });

  // ============ DEALS CRUD ============

  // List deals (with optional filters: stage, contactId)
  app.get("/api/admin/deals", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { stage, contactId } = req.query as Record<string, string>;
      const conditions = [];
      if (stage) conditions.push(eq(deals.stage, stage));
      if (contactId) conditions.push(eq(deals.contactId, contactId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const dealList = await db.select().from(deals).where(whereClause).orderBy(desc(deals.createdAt));

      // Enrich with contact info
      const contactIds = Array.from(new Set(dealList.map(d => d.contactId)));
      let contactMap: Record<string, { nombre: string; empresa: string }> = {};
      if (contactIds.length > 0) {
        const contactList = await db.select().from(contacts)
          .where(sql`${contacts.id} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);
        for (const c of contactList) contactMap[c.id] = { nombre: c.nombre, empresa: c.empresa };
      }

      const enriched = dealList.map(d => ({
        ...d,
        contactName: contactMap[d.contactId]?.nombre || "Unknown",
        contactEmpresa: contactMap[d.contactId]?.empresa || "",
      }));

      res.json(enriched);
    } catch (err: any) {
      log(`Error listing deals: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo deals" });
    }
  });

  // Create deal
  app.post("/api/admin/deals", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { contactId, title, value, stage, expectedCloseDate, notes } = req.body;
      if (!contactId || !title) return res.status(400).json({ error: "contactId y title son requeridos" });

      const [deal] = await db.insert(deals).values({
        contactId,
        title,
        value: value || null,
        stage: stage || "qualification",
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
        notes: notes || null,
      }).returning();

      logActivity(contactId, "deal_created", `Deal creado: "${title}"${value ? ` — $${value}` : ""}`, { dealId: deal.id, stage: deal.stage });

      // Create notification for new deal
      await db.insert(notifications).values({
        type: "deal_stage_changed",
        title: `Nuevo deal: ${title}`,
        description: `${value ? `$${value.toLocaleString()} — ` : ""}${stage || "qualification"}`,
        contactId,
      });

      res.json(deal);
    } catch (err: any) {
      log(`Error creating deal: ${err?.message}`);
      res.status(500).json({ error: "Error creando deal" });
    }
  });

  // Update deal
  app.patch("/api/admin/deals/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const dealId = req.params.id as string;
      const { title, value, stage, lostReason, expectedCloseDate, closedAt, notes } = req.body;

      const [existing] = await db.select().from(deals).where(eq(deals.id, dealId));
      if (!existing) return res.status(404).json({ error: "Deal no encontrado" });

      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (value !== undefined) updates.value = value;
      if (stage !== undefined) updates.stage = stage;
      if (lostReason !== undefined) updates.lostReason = lostReason;
      if (expectedCloseDate !== undefined) updates.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
      if (notes !== undefined) updates.notes = notes;

      // Auto-set closedAt when moving to closed stages
      if (stage === "closed_won" || stage === "closed_lost") {
        updates.closedAt = closedAt ? new Date(closedAt) : new Date();
      } else if (stage && stage !== "closed_won" && stage !== "closed_lost") {
        updates.closedAt = null;
      }

      const [updated] = await db.update(deals).set(updates).where(eq(deals.id, dealId)).returning();

      if (stage && stage !== existing.stage) {
        logActivity(existing.contactId, "deal_stage_changed", `Deal "${existing.title}" movido de ${existing.stage} a ${stage}`, { dealId, oldStage: existing.stage, newStage: stage });

        await db.insert(notifications).values({
          type: "deal_stage_changed",
          title: `Deal actualizado: ${existing.title}`,
          description: `${existing.stage} → ${stage}${stage === "closed_won" && updated.value ? ` — $${updated.value.toLocaleString()}` : ""}`,
          contactId: existing.contactId,
        });
      }

      res.json(updated);
    } catch (err: any) {
      log(`Error updating deal: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando deal" });
    }
  });

  // Delete deal
  app.delete("/api/admin/deals/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const dealId = req.params.id as string;
      const [existing] = await db.select().from(deals).where(eq(deals.id, dealId));
      if (!existing) return res.status(404).json({ error: "Deal no encontrado" });

      await db.delete(deals).where(eq(deals.id, dealId));
      logActivity(existing.contactId, "deal_deleted", `Deal eliminado: "${existing.title}"`);
      res.json({ success: true });
    } catch (err: any) {
      log(`Error deleting deal: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando deal" });
    }
  });

  // ============ NOTIFICATIONS ============

  // List notifications (with optional unread filter)
  app.get("/api/admin/notifications", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { unread } = req.query as Record<string, string>;
      const conditions = [];
      if (unread === "true") conditions.push(eq(notifications.isRead, false));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const notifList = await db.select().from(notifications)
        .where(whereClause)
        .orderBy(desc(notifications.createdAt))
        .limit(50);

      const unreadCount = await db.select({ value: count() }).from(notifications)
        .where(eq(notifications.isRead, false));

      res.json({ notifications: notifList, unreadCount: unreadCount[0]?.value || 0 });
    } catch (err: any) {
      log(`Error listing notifications: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo notificaciones" });
    }
  });

  // Mark notification as read
  app.patch("/api/admin/notifications/:id/read", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      log(`Error marking notification read: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando notificación" });
    }
  });

  // Mark all notifications as read
  app.post("/api/admin/notifications/mark-all-read", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      await db.update(notifications).set({ isRead: true }).where(eq(notifications.isRead, false));
      res.json({ success: true });
    } catch (err: any) {
      log(`Error marking all read: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando notificaciones" });
    }
  });

  // ============ WHATSAPP ============

  // Generate personalized WhatsApp message for a contact
  app.post("/api/admin/contacts/:id/whatsapp-message", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const contactId = req.params.id as string;
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

      const [diagnostic] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId!));

      const message = await generateWhatsAppMessage(contact, diagnostic || null);

      // Format phone for WhatsApp (remove spaces, dashes, add +57 if needed)
      let phone = (contact.telefono || "").replace(/[\s\-\(\)]/g, "");
      if (phone && !phone.startsWith("+")) {
        if (phone.startsWith("57")) phone = "+" + phone;
        else phone = "+57" + phone;
      }

      // Log activity
      logActivity(contactId, "whatsapp_sent", `Mensaje WhatsApp generado para ${contact.nombre}`, { phone, messagePreview: message.substring(0, 100) });

      res.json({ message, phone, whatsappUrl: phone ? `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(message)}` : null });
    } catch (err: any) {
      log(`Error generating WhatsApp message: ${err?.message}`);
      res.status(500).json({ error: "Error generando mensaje WhatsApp" });
    }
  });

  // ============ GLOBAL SEARCH ============

  app.get("/api/admin/search", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const q = (req.query.q as string || "").trim();
      if (!q || q.length < 2) return res.json({ contacts: [], deals: [], tasks: [] });

      const pattern = `%${q}%`;

      const contactResults = await db.select({
        id: contacts.id,
        nombre: contacts.nombre,
        empresa: contacts.empresa,
        email: contacts.email,
        status: contacts.status,
        leadScore: contacts.leadScore,
      }).from(contacts)
        .where(or(ilike(contacts.nombre, pattern), ilike(contacts.empresa, pattern), ilike(contacts.email, pattern))!)
        .orderBy(desc(contacts.createdAt))
        .limit(8);

      const dealResults = await db.select({
        id: deals.id,
        title: deals.title,
        value: deals.value,
        stage: deals.stage,
        contactId: deals.contactId,
      }).from(deals)
        .where(ilike(deals.title, pattern))
        .orderBy(desc(deals.createdAt))
        .limit(5);

      const taskResults = await db.select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        contactId: tasks.contactId,
      }).from(tasks)
        .where(ilike(tasks.title, pattern))
        .orderBy(desc(tasks.createdAt))
        .limit(5);

      res.json({ contacts: contactResults, deals: dealResults, tasks: taskResults });
    } catch (err: any) {
      log(`Error global search: ${err?.message}`);
      res.status(500).json({ error: "Error en búsqueda" });
    }
  });

  // ============ EMAIL TEMPLATES MANAGEMENT ============

  app.get("/api/admin/templates", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const templates = await db.select().from(emailTemplates).orderBy(asc(emailTemplates.sequenceOrder));
      res.json(templates);
    } catch (err: any) {
      log(`Error listing templates: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo templates" });
    }
  });

  app.patch("/api/admin/templates/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const { subjectPrompt, bodyPrompt, isActive } = req.body;
      const updates: any = {};
      if (subjectPrompt !== undefined) updates.subjectPrompt = subjectPrompt;
      if (bodyPrompt !== undefined) updates.bodyPrompt = bodyPrompt;
      if (isActive !== undefined) updates.isActive = isActive;

      const [updated] = await db.update(emailTemplates).set(updates).where(eq(emailTemplates.id, req.params.id as string)).returning();
      res.json(updated);
    } catch (err: any) {
      log(`Error updating template: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando template" });
    }
  });

  app.post("/api/admin/templates/:id/preview", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, req.params.id as string));
      if (!template) return res.status(404).json({ error: "Template no encontrado" });

      // Generate preview with sample data
      const sampleData = {
        empresa: "Empresa Demo",
        industria: "Tecnología",
        participante: "Juan Pérez",
        email: "demo@ejemplo.com",
        empleados: "11-50",
        objetivos: ["Automatizar procesos", "Implementar CRM"],
        herramientas: "Excel, Google Workspace",
        nivelTech: "Medio",
        usaIA: "No",
        areaPrioridad: ["Ventas", "Operaciones"],
        presupuesto: "$1,000 - $5,000 USD",
        fechaCita: "2026-03-20",
        horaCita: "10:00 AM",
      };

      const { subject, body } = await generateEmailContent(template, sampleData as any);
      res.json({ subject, body });
    } catch (err: any) {
      log(`Error previewing template: ${err?.message}`);
      res.status(500).json({ error: "Error generando preview" });
    }
  });

  app.post("/api/admin/templates/:id/test-send", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email requerido" });

      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, req.params.id as string));
      if (!template) return res.status(404).json({ error: "Template no encontrado" });

      const sampleData = {
        empresa: "Empresa Demo",
        industria: "Tecnología",
        participante: "Juan Pérez",
        objetivos: ["Automatizar procesos"],
        herramientas: "Excel",
        nivelTech: "Medio",
        presupuesto: "$1,000 - $5,000 USD",
      };

      const { subject, body } = await generateEmailContent(template, sampleData as any);
      await sendEmail(email, `[TEST] ${subject}`, body);
      res.json({ success: true, subject });
    } catch (err: any) {
      log(`Error test-sending template: ${err?.message}`);
      res.status(500).json({ error: "Error enviando test" });
    }
  });

  // ============ BULK CONTACT ACTIONS ============

  app.post("/api/admin/contacts/bulk", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { ids, action, payload } = req.body as { ids: string[]; action: string; payload?: any };
      if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "IDs requeridos" });

      let affected = 0;

      for (const id of ids) {
        try {
          switch (action) {
            case "change_status":
              if (payload?.status) {
                await db.update(contacts).set({ status: payload.status, substatus: payload.substatus || null }).where(eq(contacts.id, id));
                logActivity(id, "status_changed", `Status cambiado a "${payload.status}" (acción masiva)`);
                affected++;
              }
              break;
            case "add_tag":
              if (payload?.tag) {
                const [c] = await db.select().from(contacts).where(eq(contacts.id, id));
                if (c) {
                  const currentTags = (c.tags as string[]) || [];
                  if (!currentTags.includes(payload.tag)) {
                    await db.update(contacts).set({ tags: [...currentTags, payload.tag] }).where(eq(contacts.id, id));
                    logActivity(id, "contact_edited", `Tag agregado: "${payload.tag}" (acción masiva)`);
                    affected++;
                  }
                }
              }
              break;
            case "opt_out":
              await db.update(contacts).set({ optedOut: true }).where(eq(contacts.id, id));
              logActivity(id, "opted_out", "Opt-out via acción masiva");
              affected++;
              break;
          }
        } catch (err) {
          log(`Bulk action error for ${id}: ${err}`);
        }
      }

      res.json({ success: true, affected });
    } catch (err: any) {
      log(`Error bulk action: ${err?.message}`);
      res.status(500).json({ error: "Error en acción masiva" });
    }
  });

  // ============ APPOINTMENTS ============

  app.get("/api/admin/appointments", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const appts = await db.select().from(appointments).orderBy(desc(appointments.createdAt));

      // Enrich with contact info
      const contactIds = Array.from(new Set(appts.filter(a => a.contactId).map(a => a.contactId!)));
      let contactMap: Record<string, { nombre: string; empresa: string }> = {};
      if (contactIds.length > 0) {
        const contactList = await db.select().from(contacts)
          .where(sql`${contacts.id} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);
        for (const c of contactList) contactMap[c.id] = { nombre: c.nombre, empresa: c.empresa };
      }

      const enriched = appts.map(a => ({
        ...a,
        contactName: a.contactId ? contactMap[a.contactId]?.nombre || "" : "",
        contactCompany: a.contactId ? contactMap[a.contactId]?.empresa || "" : "",
      }));

      res.json(enriched);
    } catch (err: any) {
      log(`Error listing appointments: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo citas" });
    }
  });

  app.post("/api/admin/appointments", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { contactId, title, date, time, duration, notes } = req.body;
      if (!title || !date || !time) return res.status(400).json({ error: "title, date y time son requeridos" });

      // Try to create Google Calendar event
      let meetLink: string | null = null;
      let eventId: string | null = null;
      try {
        const calResult = await createCalendarEvent({
          diagnosticId: `appt-${Date.now()}`,
          empresa: title,
          participante: "",
          email: "",
          fechaCita: date,
          horaCita: time,
        });
        if (calResult) {
          meetLink = calResult.meetLink;
          eventId = calResult.eventId;
        }
      } catch (err) {
        log(`Calendar event creation failed for appointment: ${err}`);
      }

      const [appt] = await db.insert(appointments).values({
        contactId: contactId || null,
        title,
        date,
        time,
        duration: duration || 45,
        notes: notes || null,
        meetLink,
        googleCalendarEventId: eventId,
      }).returning();

      if (contactId) {
        logActivity(contactId, "task_created", `Cita creada: "${title}" — ${date} ${time}`);
      }

      res.json(appt);
    } catch (err: any) {
      log(`Error creating appointment: ${err?.message}`);
      res.status(500).json({ error: "Error creando cita" });
    }
  });

  app.patch("/api/admin/appointments/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { title, date, time, duration, notes, contactId } = req.body;
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (date !== undefined) updates.date = date;
      if (time !== undefined) updates.time = time;
      if (duration !== undefined) updates.duration = duration;
      if (notes !== undefined) updates.notes = notes;
      if (contactId !== undefined) updates.contactId = contactId;

      const [updated] = await db.update(appointments).set(updates).where(eq(appointments.id, req.params.id as string)).returning();
      res.json(updated);
    } catch (err: any) {
      log(`Error updating appointment: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando cita" });
    }
  });

  app.delete("/api/admin/appointments/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      await db.delete(appointments).where(eq(appointments.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      log(`Error deleting appointment: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando cita" });
    }
  });

  // ========== BLOG PUBLIC API ==========

  // List published blog posts (with filters)
  app.get("/api/blog/posts", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { category, search, language, page = "1", limit = "12" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
      const offset = (pageNum - 1) * limitNum;

      const conditions: any[] = [eq(blogPosts.status, "published")];
      if (category) conditions.push(eq(blogPosts.categoryId, category as string));
      if (language) conditions.push(eq(blogPosts.language, language as string));
      if (search) {
        conditions.push(
          or(
            ilike(blogPosts.title, `%${search}%`),
            ilike(blogPosts.excerpt, `%${search}%`)
          )
        );
      }

      const where = conditions.length === 1 ? conditions[0] : and(...conditions);

      const [posts, [{ total }]] = await Promise.all([
        db.select().from(blogPosts).where(where).orderBy(desc(blogPosts.publishedAt)).limit(limitNum).offset(offset),
        db.select({ total: count() }).from(blogPosts).where(where),
      ]);

      // Attach category info
      const allCategories = await db.select().from(blogCategories);
      const categoryMap: Record<string, any> = {};
      allCategories.forEach(c => { categoryMap[c.id] = c; });

      const enriched = posts.map(p => ({
        ...p,
        category: p.categoryId ? categoryMap[p.categoryId] || null : null,
      }));

      res.json({ posts: enriched, total, totalPages: Math.ceil(total / limitNum), page: pageNum });
    } catch (err: any) {
      log(`Error listing blog posts: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo posts" });
    }
  });

  // Get single published blog post by slug
  app.get("/api/blog/posts/:slug", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const [post] = await db.select().from(blogPosts)
        .where(and(eq(blogPosts.slug, req.params.slug as string), eq(blogPosts.status, "published")));

      if (!post) return res.status(404).json({ error: "Post no encontrado" });

      let category = null;
      if (post.categoryId) {
        const [cat] = await db.select().from(blogCategories).where(eq(blogCategories.id, post.categoryId));
        category = cat || null;
      }

      // Get related posts (same category, exclude current)
      let relatedPosts: any[] = [];
      if (post.categoryId) {
        relatedPosts = await db.select().from(blogPosts)
          .where(and(
            eq(blogPosts.status, "published"),
            eq(blogPosts.categoryId, post.categoryId),
            sql`${blogPosts.id} != ${post.id}`
          ))
          .orderBy(desc(blogPosts.publishedAt))
          .limit(3);
      }
      if (relatedPosts.length < 3) {
        const morePostIds = [post.id, ...relatedPosts.map(p => p.id)];
        const morePosts = await db.select().from(blogPosts)
          .where(and(
            eq(blogPosts.status, "published"),
            sql`${blogPosts.id} NOT IN (${sql.join(morePostIds.map(id => sql`${id}`), sql`, `)})`
          ))
          .orderBy(desc(blogPosts.publishedAt))
          .limit(3 - relatedPosts.length);
        relatedPosts = [...relatedPosts, ...morePosts];
      }

      res.json({ ...post, category, relatedPosts });
    } catch (err: any) {
      log(`Error getting blog post: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo post" });
    }
  });

  // List blog categories
  app.get("/api/blog/categories", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const categories = await db.select().from(blogCategories).orderBy(asc(blogCategories.name));
      res.json(categories);
    } catch (err: any) {
      log(`Error listing blog categories: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo categorías" });
    }
  });

  // Latest 3 published posts (for homepage preview)
  app.get("/api/blog/latest", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const posts = await db.select().from(blogPosts)
        .where(eq(blogPosts.status, "published"))
        .orderBy(desc(blogPosts.publishedAt))
        .limit(3);

      const allCategories = await db.select().from(blogCategories);
      const categoryMap: Record<string, any> = {};
      allCategories.forEach(c => { categoryMap[c.id] = c; });

      const enriched = posts.map(p => ({
        ...p,
        category: p.categoryId ? categoryMap[p.categoryId] || null : null,
      }));

      res.json(enriched);
    } catch (err: any) {
      log(`Error getting latest posts: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo posts" });
    }
  });

  // Dynamic blog sitemap
  app.get("/sitemap-blog.xml", async (req, res) => {
    if (!db) return res.status(404).send("Not found");

    try {
      const posts = await db.select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt })
        .from(blogPosts)
        .where(eq(blogPosts.status, "published"))
        .orderBy(desc(blogPosts.publishedAt));

      const urls = posts.map(p => `  <url>
    <loc>https://www.im3systems.com/blog/${p.slug}</loc>
    <lastmod>${p.updatedAt.toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join("\n");

      res.set("Content-Type", "application/xml");
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.im3systems.com/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
${urls}
</urlset>`);
    } catch (err: any) {
      log(`Error generating blog sitemap: ${err?.message}`);
      res.status(500).send("Error generating sitemap");
    }
  });

  // ========== BLOG ADMIN API ==========

  // List all blog posts (admin)
  app.get("/api/admin/blog/posts", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { status, search } = req.query;
      const conditions: any[] = [];
      if (status) conditions.push(eq(blogPosts.status, status as string));
      if (search) {
        conditions.push(
          or(ilike(blogPosts.title, `%${search}%`), ilike(blogPosts.excerpt, `%${search}%`))
        );
      }

      const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

      const posts = await db.select().from(blogPosts).where(where).orderBy(desc(blogPosts.createdAt));

      const allCategories = await db.select().from(blogCategories);
      const categoryMap: Record<string, any> = {};
      allCategories.forEach(c => { categoryMap[c.id] = c; });

      const enriched = posts.map(p => ({
        ...p,
        category: p.categoryId ? categoryMap[p.categoryId] || null : null,
      }));

      res.json(enriched);
    } catch (err: any) {
      log(`Error listing admin blog posts: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo posts" });
    }
  });

  // Get single blog post by ID (admin)
  app.get("/api/admin/blog/posts/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, req.params.id as string));
      if (!post) return res.status(404).json({ error: "Post no encontrado" });
      res.json(post);
    } catch (err: any) {
      log(`Error getting blog post: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo post" });
    }
  });

  // Create blog post
  app.post("/api/admin/blog/posts", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { title, slug, excerpt, content, categoryId, tags, featuredImageUrl, authorName, status, language, metaTitle, metaDescription, readTimeMinutes } = req.body;
      if (!title || !slug || !excerpt || !content) return res.status(400).json({ error: "title, slug, excerpt y content son requeridos" });

      const [post] = await db.insert(blogPosts).values({
        title, slug, excerpt, content,
        categoryId: categoryId || null,
        tags: tags || [],
        featuredImageUrl: featuredImageUrl || null,
        authorName: authorName || "Equipo IM3",
        status: status || "draft",
        language: language || "es",
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        readTimeMinutes: readTimeMinutes || Math.ceil(content.replace(/<[^>]*>/g, "").split(/\s+/).length / 200),
        publishedAt: status === "published" ? new Date() : null,
      }).returning();

      res.json(post);
    } catch (err: any) {
      if (err?.message?.includes("unique")) return res.status(400).json({ error: "El slug ya existe" });
      log(`Error creating blog post: ${err?.message}`);
      res.status(500).json({ error: "Error creando post" });
    }
  });

  // Update blog post
  app.patch("/api/admin/blog/posts/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const updates: any = { updatedAt: new Date() };
      const fields = ["title", "slug", "excerpt", "content", "categoryId", "tags", "featuredImageUrl", "authorName", "status", "language", "metaTitle", "metaDescription", "readTimeMinutes"];
      fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

      // Auto-calculate read time if content changed
      if (updates.content && !req.body.readTimeMinutes) {
        updates.readTimeMinutes = Math.ceil(updates.content.replace(/<[^>]*>/g, "").split(/\s+/).length / 200);
      }

      const [updated] = await db.update(blogPosts).set(updates).where(eq(blogPosts.id, req.params.id as string)).returning();
      res.json(updated);
    } catch (err: any) {
      if (err?.message?.includes("unique")) return res.status(400).json({ error: "El slug ya existe" });
      log(`Error updating blog post: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando post" });
    }
  });

  // Publish blog post
  app.post("/api/admin/blog/posts/:id/publish", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const [updated] = await db.update(blogPosts)
        .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(blogPosts.id, req.params.id as string)).returning();
      res.json(updated);
    } catch (err: any) {
      log(`Error publishing blog post: ${err?.message}`);
      res.status(500).json({ error: "Error publicando post" });
    }
  });

  // Unpublish blog post
  app.post("/api/admin/blog/posts/:id/unpublish", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const [updated] = await db.update(blogPosts)
        .set({ status: "draft", updatedAt: new Date() })
        .where(eq(blogPosts.id, req.params.id as string)).returning();
      res.json(updated);
    } catch (err: any) {
      log(`Error unpublishing blog post: ${err?.message}`);
      res.status(500).json({ error: "Error despublicando post" });
    }
  });

  // Delete blog post
  app.delete("/api/admin/blog/posts/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      await db.delete(blogPosts).where(eq(blogPosts.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      log(`Error deleting blog post: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando post" });
    }
  });

  // Blog categories CRUD (admin)
  app.get("/api/admin/blog/categories", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const categories = await db.select().from(blogCategories).orderBy(asc(blogCategories.name));
      res.json(categories);
    } catch (err: any) {
      res.status(500).json({ error: "Error obteniendo categorías" });
    }
  });

  app.post("/api/admin/blog/categories", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const { name, slug, description } = req.body;
      if (!name || !slug) return res.status(400).json({ error: "name y slug son requeridos" });
      const [cat] = await db.insert(blogCategories).values({ name, slug, description: description || null }).returning();
      res.json(cat);
    } catch (err: any) {
      if (err?.message?.includes("unique")) return res.status(400).json({ error: "El slug ya existe" });
      res.status(500).json({ error: "Error creando categoría" });
    }
  });

  app.patch("/api/admin/blog/categories/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.slug !== undefined) updates.slug = req.body.slug;
      if (req.body.description !== undefined) updates.description = req.body.description;
      const [updated] = await db.update(blogCategories).set(updates).where(eq(blogCategories.id, req.params.id as string)).returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: "Error actualizando categoría" });
    }
  });

  app.delete("/api/admin/blog/categories/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(blogCategories).where(eq(blogCategories.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Error eliminando categoría" });
    }
  });

  // Blog AI assist
  app.post("/api/admin/blog/ai/generate", requireAuth, async (req, res) => {
    try {
      const { prompt, language } = req.body;
      if (!prompt) return res.status(400).json({ error: "prompt es requerido" });
      const result = await generateBlogContent(prompt, language || "es");
      if (!result) return res.status(500).json({ error: "Error generando contenido (API key no configurada o error)" });
      res.json(result);
    } catch (err: any) {
      log(`Error AI blog generate: ${err?.message}`);
      res.status(500).json({ error: "Error generando contenido" });
    }
  });

  app.post("/api/admin/blog/ai/improve", requireAuth, async (req, res) => {
    try {
      const { content, instruction, language } = req.body;
      if (!content || !instruction) return res.status(400).json({ error: "content e instruction son requeridos" });
      const result = await improveBlogContent(content, instruction, language || "es");
      if (!result) return res.status(500).json({ error: "Error mejorando contenido" });
      res.json({ content: result });
    } catch (err: any) {
      log(`Error AI blog improve: ${err?.message}`);
      res.status(500).json({ error: "Error mejorando contenido" });
    }
  });

  // Seed blog with sample posts (one-time use)
  app.post("/api/admin/blog/seed", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      // Check if posts already exist
      const existing = await db.select({ total: count() }).from(blogPosts);
      if (existing[0].total > 0) return res.json({ message: "Blog already seeded", count: existing[0].total });

      // Create categories
      const [catIA] = await db.insert(blogCategories).values({ name: "IA Aplicada", slug: "ia-aplicada", description: "Inteligencia artificial aplicada a negocios" }).returning();
      const [catAuto] = await db.insert(blogCategories).values({ name: "Automatización", slug: "automatizacion", description: "Automatización de procesos empresariales" }).returning();
      const [catTech] = await db.insert(blogCategories).values({ name: "Tendencias Tech", slug: "tendencias-tech", description: "Últimas tendencias en tecnología" }).returning();

      const now = new Date();

      // Post 1
      await db.insert(blogPosts).values({
        title: "Cómo la IA está transformando las PYMEs en Latinoamérica",
        slug: "ia-transformando-pymes-latinoamerica",
        excerpt: "La inteligencia artificial ya no es exclusiva de las grandes corporaciones. Descubre cómo las PYMEs en la región están usando IA para competir mejor.",
        content: `<h2>La IA ya no es ciencia ficción para las PYMEs</h2>
<p>Hace cinco años, hablar de inteligencia artificial en una PYME latinoamericana sonaba a ciencia ficción. Hoy, es una realidad que está cambiando las reglas del juego. Y no estamos hablando de robots o algoritmos complejos — estamos hablando de herramientas prácticas que resuelven problemas reales.</p>

<h2>¿Qué están haciendo las PYMEs con IA?</h2>
<p>Las empresas que están adoptando IA en la región lo hacen de formas muy concretas:</p>
<ul>
<li><strong>Chatbots de ventas en WhatsApp</strong> que atienden clientes 24/7, califican leads y cierran ventas sin intervención humana.</li>
<li><strong>Automatización de procesos repetitivos</strong> como facturación, seguimiento de pedidos y gestión de inventario.</li>
<li><strong>Dashboards inteligentes</strong> que no solo muestran datos, sino que sugieren qué hacer con ellos.</li>
<li><strong>Clasificación automática</strong> de documentos, emails y solicitudes de clientes.</li>
</ul>

<h2>El mito del costo prohibitivo</h2>
<p>Uno de los principales mitos es que implementar IA es caro. La realidad es que el costo de <strong>no</strong> implementarla es mayor. Cada hora que un empleado dedica a tareas repetitivas es una hora que no dedica a generar valor.</p>
<blockquote><p>Una empresa de logística en Colombia automatizó su proceso de cotización con IA y redujo el tiempo de respuesta de 24 horas a 3 minutos. El resultado: 40% más de cierres en el primer mes.</p></blockquote>

<h2>Por dónde empezar</h2>
<p>No necesitas una transformación digital masiva. Empieza por identificar:</p>
<ol>
<li>¿Qué procesos consumen más tiempo de tu equipo?</li>
<li>¿Dónde están los cuellos de botella en tu operación?</li>
<li>¿Qué tareas son repetitivas y predecibles?</li>
</ol>
<p>Esas son exactamente las áreas donde la IA genera mayor impacto con menor inversión.</p>

<h2>El momento es ahora</h2>
<p>Las PYMEs que están adoptando IA hoy van a tener una ventaja competitiva difícil de alcanzar en dos años. No se trata de reemplazar personas — se trata de darles superpoderes para que se enfoquen en lo que realmente importa: hacer crecer el negocio.</p>`,
        categoryId: catIA.id,
        tags: ["inteligencia artificial", "pymes", "latinoamerica", "transformacion digital"],
        authorName: "Equipo IM3",
        status: "published",
        language: "es",
        metaTitle: "Cómo la IA está transformando las PYMEs en Latinoamérica",
        metaDescription: "Descubre cómo las PYMEs en Latinoamérica están usando inteligencia artificial para automatizar procesos, vender más y competir mejor.",
        readTimeMinutes: 5,
        publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      });

      // Post 2
      await db.insert(blogPosts).values({
        title: "5 procesos que toda empresa debería automatizar hoy",
        slug: "5-procesos-automatizar-empresa",
        excerpt: "Hay tareas que tus empleados hacen todos los días que podrían funcionar solas. Estos son los 5 procesos con mayor retorno al automatizarlos.",
        content: `<h2>La automatización no es un lujo — es una necesidad</h2>
<p>Si tu equipo pasa más de 2 horas al día en tareas repetitivas, estás quemando dinero. La automatización no se trata de reducir personal — se trata de liberar tiempo para que las personas se enfoquen en lo que genera valor.</p>

<h2>1. Seguimiento de leads y clientes</h2>
<p>¿Cuántos leads se pierden porque nadie les hizo seguimiento a tiempo? Un sistema automatizado puede:</p>
<ul>
<li>Enviar un email de bienvenida en el momento exacto en que alguien muestra interés</li>
<li>Programar recordatorios automáticos para seguimiento</li>
<li>Clasificar leads por nivel de interés usando IA</li>
<li>Alertar al equipo de ventas cuando un lead está listo para cerrar</li>
</ul>

<h2>2. Facturación y cobros</h2>
<p>La facturación manual es una de las principales fuentes de errores y atrasos. Automatizar este proceso significa:</p>
<ul>
<li>Facturas generadas automáticamente al completar un servicio</li>
<li>Recordatorios de pago enviados sin intervención humana</li>
<li>Conciliación automática entre pagos recibidos y facturas pendientes</li>
</ul>

<h2>3. Reportería y dashboards</h2>
<p>Si alguien de tu equipo pasa horas armando reportes en Excel cada semana, eso debería estar automatizado. Un dashboard en tiempo real te da:</p>
<ul>
<li>Visibilidad inmediata del estado de la operación</li>
<li>Alertas automáticas cuando algo se sale de rango</li>
<li>Datos consolidados de múltiples fuentes sin copiar y pegar</li>
</ul>

<h2>4. Onboarding de clientes</h2>
<p>El proceso de integrar un nuevo cliente puede estandarizarse:</p>
<ul>
<li>Envío automático de documentos y formularios</li>
<li>Checklist digital que avanza solo al completar cada paso</li>
<li>Notificaciones al equipo responsable en cada etapa</li>
</ul>

<h2>5. Atención al cliente con chatbots</h2>
<p>El 70% de las consultas que recibe tu equipo de soporte son preguntas frecuentes. Un chatbot inteligente en WhatsApp puede resolver estas consultas 24/7, escalando a un humano solo cuando es necesario.</p>

<h2>¿Por dónde empiezo?</h2>
<p>Empieza por el proceso que más tiempo consume y que más se repite. Un diagnóstico rápido de tu operación puede revelar oportunidades que no sabías que tenías.</p>`,
        categoryId: catAuto.id,
        tags: ["automatización", "procesos", "productividad", "eficiencia"],
        authorName: "Equipo IM3",
        status: "published",
        language: "es",
        metaTitle: "5 procesos que toda empresa debería automatizar",
        metaDescription: "Descubre los 5 procesos empresariales con mayor retorno al automatizarlos: leads, facturación, reportes, onboarding y atención al cliente.",
        readTimeMinutes: 6,
        publishedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      });

      // Post 3
      await db.insert(blogPosts).values({
        title: "Chatbots de WhatsApp con IA: por qué tu negocio necesita uno",
        slug: "chatbots-whatsapp-ia-negocio",
        excerpt: "WhatsApp es el canal #1 de comunicación en Latinoamérica. Un chatbot con IA puede transformar ese canal en tu mejor vendedor.",
        content: `<h2>WhatsApp: el canal que tu negocio está subutilizando</h2>
<p>En Latinoamérica, WhatsApp no es solo una app de mensajería — es la infraestructura de comunicación de negocios. Tus clientes ya están ahí. La pregunta es: ¿estás aprovechando ese canal al máximo?</p>

<h2>¿Qué puede hacer un chatbot de WhatsApp con IA?</h2>
<p>No estamos hablando de un bot que responde "Presione 1 para ventas". Un chatbot con inteligencia artificial puede:</p>
<ul>
<li><strong>Entender preguntas en lenguaje natural</strong> — "¿Tienen el modelo azul en talla M?" y responder con precisión</li>
<li><strong>Calificar leads automáticamente</strong> — Identifica quién está listo para comprar y quién solo está explorando</li>
<li><strong>Procesar pedidos</strong> — Desde tomar el pedido hasta confirmar el pago, sin intervención humana</li>
<li><strong>Dar seguimiento post-venta</strong> — Preguntar cómo estuvo el servicio, ofrecer productos relacionados</li>
<li><strong>Escalar a un humano</strong> — Cuando la consulta requiere atención personalizada, transfiere con todo el contexto</li>
</ul>

<h2>Resultados reales</h2>
<blockquote><p>"Implementamos un chatbot de ventas en WhatsApp y en el primer mes cerramos un 35% más de ventas. Los clientes reciben respuesta inmediata, 24/7, y nuestro equipo solo interviene en los casos que realmente lo necesitan." — Cliente de IM3 Systems</p></blockquote>

<h2>La ventaja competitiva</h2>
<p>Mientras tu competencia tarda 4 horas en responder un WhatsApp, tu chatbot responde en 3 segundos. Esa diferencia es la que cierra ventas.</p>
<p>Algunos datos que lo respaldan:</p>
<ul>
<li>El 82% de los consumidores espera respuesta inmediata en WhatsApp</li>
<li>Los negocios que responden en menos de 5 minutos tienen 21x más probabilidad de cerrar la venta</li>
<li>Un chatbot puede manejar cientos de conversaciones simultáneas sin perder calidad</li>
</ul>

<h2>¿Es complicado implementar uno?</h2>
<p>No. Con la tecnología actual, un chatbot de WhatsApp con IA se puede tener funcionando en semanas, no meses. Lo importante es:</p>
<ol>
<li>Definir los flujos de conversación más importantes</li>
<li>Entrenar la IA con información real de tu negocio</li>
<li>Integrar con tus sistemas existentes (CRM, inventario, pagos)</li>
<li>Iterar basándote en conversaciones reales</li>
</ol>

<h2>El mejor momento para empezar es ahora</h2>
<p>Cada día sin chatbot es un día de ventas perdidas y clientes frustrados por la espera. La IA en WhatsApp no es el futuro — es el presente. Y los negocios que lo entienden primero son los que lideran.</p>`,
        categoryId: catIA.id,
        tags: ["chatbots", "whatsapp", "ia", "ventas", "atención al cliente"],
        authorName: "Equipo IM3",
        status: "published",
        language: "es",
        metaTitle: "Chatbots de WhatsApp con IA para negocios",
        metaDescription: "Descubre cómo un chatbot de WhatsApp con inteligencia artificial puede transformar tu canal de ventas y atención al cliente 24/7.",
        readTimeMinutes: 5,
        publishedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      });

      res.json({ message: "Blog seeded with 3 categories and 3 posts", categories: 3, posts: 3 });
    } catch (err: any) {
      log(`Error seeding blog: ${err?.message}`);
      res.status(500).json({ error: `Error seeding blog: ${err?.message}` });
    }
  });

  // Unsubscribe from email sequence
  app.get("/api/unsubscribe/:contactId", async (req, res) => {
    const { contactId } = req.params;

    if (!db) {
      res.send("<html><body><h2>No se pudo procesar la solicitud.</h2></body></html>");
      return;
    }

    try {
      await db.update(contacts)
        .set({ optedOut: true })
        .where(eq(contacts.id, contactId));

      logActivity(contactId, "opted_out", "Contacto se dio de baja de emails");
      log(`Contact unsubscribed: ${contactId}`);

      res.send(`<html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="font-family:sans-serif;max-width:500px;margin:60px auto;text-align:center;color:#333">
          <h2 style="color:#2B7A78">Te has dado de baja</h2>
          <p>No recibirás más emails de esta secuencia.</p>
          <p style="color:#999;font-size:14px">— Equipo IM3 Systems</p>
        </body>
      </html>`);
    } catch (err) {
      log(`Error unsubscribe: ${err}`);
      res.status(500).send("<html><body><h2>Error procesando solicitud.</h2></body></html>");
    }
  });

  return httpServer;
}
