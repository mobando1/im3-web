import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq, asc } from "drizzle-orm";
import { db } from "./db";
import { diagnostics, contacts, emailTemplates, sentEmails, abandonedLeads, newsletterSubscribers } from "@shared/schema";
import { log } from "./index";
import { isGoogleDriveConfigured, createDiagnosticInDrive } from "./google-drive";
import { isEmailConfigured, sendEmail } from "./email-sender";
import { generateEmailContent } from "./email-ai";

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
          log(`Google Drive creado: ${data.empresa}`);
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

    // Schedule email sequence (non-blocking)
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

          // Get active templates ordered by sequence
          const templates = await db
            .select()
            .from(emailTemplates)
            .where(eq(emailTemplates.isActive, true))
            .orderBy(asc(emailTemplates.sequenceOrder));

          // Schedule emails
          const now = new Date();
          for (const template of templates) {
            const scheduledFor = new Date(now);
            scheduledFor.setDate(scheduledFor.getDate() + template.delayDays);

            await db.insert(sentEmails).values({
              contactId: contact.id,
              templateId: template.id,
              scheduledFor,
            });
          }

          log(`Secuencia de ${templates.length} email(s) programada para ${data.email}`);
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

  // Temporary debug endpoint
  app.get("/api/debug-env", (_req, res) => {
    const gsa = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
    const gpk = process.env.GOOGLE_PRIVATE_KEY || "";
    const gdf = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
    const rk = process.env.RESEND_API_KEY || "";
    const ak = process.env.ANTHROPIC_API_KEY || "";
    res.json({
      google_email: gsa ? `${gsa.slice(0, 15)}... (${gsa.length} chars)` : "NOT SET",
      google_key: gpk ? `${gpk.slice(0, 20)}... (${gpk.length} chars)` : "NOT SET",
      google_folder: gdf || "NOT SET",
      resend: rk ? `${rk.slice(0, 6)}...${rk.slice(-4)} (${rk.length} chars)` : "NOT SET",
      anthropic: ak ? `${ak.slice(0, 10)}...${ak.slice(-4)} (${ak.length} chars)` : "NOT SET",
      googleDriveConfigured: !!(gsa && gpk && gdf),
    });
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

  return httpServer;
}
