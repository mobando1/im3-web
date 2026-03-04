import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq, asc } from "drizzle-orm";
import { db } from "./db";
import { diagnostics, contacts, emailTemplates, sentEmails } from "@shared/schema";
import { log } from "./index";
import { isGoogleDriveConfigured, createDiagnosticInDrive } from "./google-drive";
import { isEmailConfigured } from "./email-sender";

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

  return httpServer;
}
