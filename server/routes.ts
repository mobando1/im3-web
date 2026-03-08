import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq, asc, isNull } from "drizzle-orm";
import { db } from "./db";
import { diagnostics, contacts, emailTemplates, sentEmails, abandonedLeads, newsletterSubscribers } from "@shared/schema";
import { log } from "./index";
import { isGoogleDriveConfigured, createDiagnosticInDrive, cleanupServiceAccountDrive } from "./google-drive";
import { createCalendarEvent } from "./google-calendar";
import { isEmailConfigured, sendEmail } from "./email-sender";
import { generateEmailContent } from "./email-ai";

/**
 * Parse fechaCita + horaCita into a Date object.
 */
function parseFechaCita(fecha: string, hora: string): Date {
  let hours = 0;
  let minutes = 0;

  const ampmMatch = hora.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampmMatch) {
    hours = parseInt(ampmMatch[1]);
    minutes = parseInt(ampmMatch[2]);
    const period = ampmMatch[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  } else {
    const h24Match = hora.match(/(\d{1,2}):(\d{2})/);
    if (h24Match) {
      hours = parseInt(h24Match[1]);
      minutes = parseInt(h24Match[2]);
    }
  }

  const date = new Date(`${fecha}T00:00:00`);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Calculate when to send each email based on template name,
 * adaptive to the window between now and the appointment.
 */
function calculateEmailTime(
  templateName: string,
  now: Date,
  appointmentDate: Date,
  daysUntilCall: number
): Date | null {
  switch (templateName) {
    case "confirmacion":
      // Always send immediately
      return now;

    case "caso_exito":
      // Send next morning at 10 AM, only if 2+ days until call
      if (daysUntilCall < 2) return null;
      const nextMorning = new Date(now);
      nextMorning.setDate(nextMorning.getDate() + 1);
      nextMorning.setHours(10, 0, 0, 0);
      return nextMorning;

    case "insight_educativo":
      // Send day 3 at 10 AM, only if 5+ days until call
      if (daysUntilCall < 5) return null;
      const day3 = new Date(now);
      day3.setDate(day3.getDate() + 3);
      day3.setHours(10, 0, 0, 0);
      return day3;

    case "prep_agenda":
      // Send 24 hours before appointment
      const prep = new Date(appointmentDate);
      prep.setHours(prep.getHours() - 24);
      // Don't send if it's already past or too close to now
      if (prep.getTime() <= now.getTime() + 2 * 60 * 60 * 1000) return null;
      return prep;

    case "micro_recordatorio":
      // Send 1 hour before appointment
      const reminder = new Date(appointmentDate);
      reminder.setHours(reminder.getHours() - 1);
      if (reminder.getTime() <= now.getTime()) return null;
      return reminder;

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

          // Parse appointment date for adaptive scheduling
          const now = new Date();
          const appointmentDate = parseFechaCita(data.fechaCita, data.horaCita);
          const daysUntilCall = Math.max(0, Math.floor((appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

          let scheduled = 0;
          for (const template of sequenceTemplates) {
            const scheduledFor = calculateEmailTime(template.nombre, now, appointmentDate, daysUntilCall);
            if (!scheduledFor) continue; // Skip this email (adaptive logic)

            await db.insert(sentEmails).values({
              contactId: contact.id,
              templateId: template.id,
              scheduledFor,
            });
            scheduled++;
          }

          log(`Secuencia de ${scheduled} email(s) programada para ${data.email} (${daysUntilCall} días hasta la cita)`);
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
          .set({ isActive: true, unsubscribedAt: null, subscribedAt: new Date() })
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
  app.post("/api/admin/regenerate-drive", async (req, res) => {
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
  app.post("/api/admin/cleanup-drive", async (req, res) => {
    try {
      const result = await cleanupServiceAccountDrive();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
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
