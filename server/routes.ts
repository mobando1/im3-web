import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq, asc, isNull, sql, and, gte, ilike, or, desc, count } from "drizzle-orm";
import { db } from "./db";
import { diagnostics, contacts, emailTemplates, sentEmails, abandonedLeads, newsletterSubscribers, users } from "@shared/schema";
import { log } from "./index";
import { isGoogleDriveConfigured, createDiagnosticInDrive, cleanupServiceAccountDrive } from "./google-drive";
import { createCalendarEvent } from "./google-calendar";
import { isEmailConfigured, sendEmail } from "./email-sender";
import { generateEmailContent } from "./email-ai";
import { parseFechaCita } from "./date-utils";
import { requireAuth, hashPassword } from "./auth";
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

    case "micro_recordatorio":
      // Send 1 hour before appointment
      const reminder = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
      if (reminder.getTime() <= now.getTime()) return null;
      return reminder;

    case "seguimiento_post":
      // Send 2 hours after appointment
      const followUp = new Date(appointmentDate.getTime() + 2 * 60 * 60 * 1000);
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

            await db.insert(sentEmails).values({
              contactId: contact.id,
              templateId: template.id,
              scheduledFor,
            });
            scheduled++;
          }

          log(`Secuencia de ${scheduled} email(s) programada para ${data.email} (${Math.round(hoursUntilCall)}h hasta la cita)`);
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
        await db
          .update(sentEmails)
          .set({ status: newStatus })
          .where(eq(sentEmails.resendMessageId, messageId));

        log(`Email webhook: ${event.type} para ${messageId}`);
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

      if (existing.length > 0 && existing[0].isActive) {
        res.json({ success: true, alreadySubscribed: true });
        return;
      }

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

      // Send welcome email (fixed template, no AI dependency)
      if (process.env.RESEND_API_KEY) {
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
      }

      res.json({ success: true });
    } catch (err) {
      log(`Error newsletter subscribe: ${err}`);
      res.status(500).json({ error: "Error interno" });
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

      res.json({
        kpis: {
          totalContacts,
          conversionRate,
          emailsThisWeek,
          upcomingAppointments,
          openRate,
        },
        pipeline,
        emailPerformance,
        recentActivity,
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

  // Contacts list with filters
  app.get("/api/admin/contacts", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { status, search, page = "1", limit = "20" } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;

      // Build conditions
      const conditions = [];
      if (status) conditions.push(eq(contacts.status, status));
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

      const [diagnostic] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId));

      const emails = await db
        .select({
          id: sentEmails.id,
          subject: sentEmails.subject,
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
      const [updated] = await db.update(contacts)
        .set({ status })
        .where(eq(contacts.id, contactId))
        .returning();

      if (!updated) return res.status(404).json({ error: "Contacto no encontrado" });

      log(`Contact ${updated.email} status → ${status}`);
      res.json(updated);
    } catch (err: any) {
      log(`Error updating status: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando status" });
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
