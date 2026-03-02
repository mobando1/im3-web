import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Diagnostic form submission
  app.post("/api/diagnostic", (req, res) => {
    const data = req.body;

    if (!data || !data.empresa) {
      res.status(400).json({ error: "Datos incompletos" });
      return;
    }

    console.log("=== NUEVO DIAGNÓSTICO RECIBIDO ===");
    console.log(`Empresa: ${data.empresa}`);
    console.log(`Industria: ${data.industria}`);
    console.log(`Participante: ${data.participante}`);
    console.log(`Fecha: ${new Date().toISOString()}`);
    console.log("Datos completos:", JSON.stringify(data, null, 2));
    console.log("=================================");

    // TODO: Forward to GHL webhook when URL is configured
    // const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL;
    // if (GHL_WEBHOOK_URL) {
    //   fetch(GHL_WEBHOOK_URL, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify(data),
    //   }).catch(err => console.error("GHL webhook error:", err));
    // }

    res.json({ success: true });
  });

  return httpServer;
}
