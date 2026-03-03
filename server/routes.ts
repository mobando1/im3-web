import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { diagnostics } from "@shared/schema";
import { log } from "./index";
import { isGoogleDriveConfigured, createDiagnosticInDrive } from "./google-drive";

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

    res.json({ success: true, id: insertedId });
  });

  return httpServer;
}
