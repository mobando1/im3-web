import type { Express } from "express";
import { createServer, type Server } from "http";
import { eq, asc, isNull, sql, and, gte, lte, ilike, or, desc, count } from "drizzle-orm";
import { db } from "./db";
import { diagnostics, contacts, emailTemplates, sentEmails, abandonedLeads, newsletterSubscribers, users, contactNotes, tasks, activityLog, aiInsightsCache, deals, notifications, appointments, blogPosts, blogCategories, whatsappMessages, clientProjects, projectPhases, projectTasks, projectDeliverables, projectTimeLog, projectMessages, projectActivityEntries, githubWebhookEvents, projectSessions, projectFiles, projectIdeas, proposals, proposalViews, gmailEmails, gmailSyncState, contactEmails, contactFiles, agentRuns, clientUsers, clientUserProjects, clientInvites, clientPasswordResets, clientMagicTokens } from "@shared/schema";
import { AGENT_REGISTRY, AGENT_DOMAINS, findAgent } from "./agents/registry";
import { runAgent } from "./agents/runner";
import { syncGmailEmails, isGmailConfigured } from "./google-gmail";
import { generateBlogContent, improveBlogContent } from "./blog-ai";
import { log } from "./index";
import { isGoogleDriveConfigured, createDiagnosticInDrive, cleanupServiceAccountDrive, uploadFileToDrive, createProjectFolder, readGoogleDriveContent, extractFolderIdFromUrl, findOrCreateClientFolder } from "./google-drive";
import multer from "multer";
import { createCalendarEvent, deleteCalendarEvent } from "./google-calendar";
import { isEmailConfigured, sendEmail } from "./email-sender";
import { generateEmailContent, buildMicroReminderEmail, build6hReminderEmail, buildFollowUpConfirmationEmail, buildNoShowEmail, generateDailyNewsDigest, generateContactInsight, generateWhatsAppMessage, generateNewsletterWelcome, generateMiniAudit, classifyWhatsAppIntent, generateWhatsAppAutoReply, buildWhatsAppNotificationEmail, buildProjectNotificationEmail, escapeHtml } from "./email-ai";
import { parseFechaCita } from "./date-utils";
import { requireAuth, hashPassword } from "./auth";
import { requireClient, publicClientUser, sendInviteEmail, sendPasswordResetEmail, createMagicToken, magicLinkUrl, sendMagicLinkLoginEmail, MAGIC_LINK_TTL_MINUTES } from "./client-auth";
import { calculateLeadScore } from "./lead-scoring";
import { isWhatsAppConfigured, calculateWhatsAppSchedule, WHATSAPP_SEQUENCE, sendWhatsAppText } from "./whatsapp";
import passport from "passport";
import { z } from "zod";
import { analyzeCommitsForProject, generateWeeklySummary, calculateProjectHealth, generateProjectFromProposal } from "./project-ai";
import { syncDriveFilesToProject } from "./drive-file-sync";
import { generateProposal, regenerateProposalSection, generateSectionOptions, applySectionOption } from "./proposal-ai";
import crypto from "crypto";
import { getIndustriaLabel } from "@shared/industrias";

type ProjectNotificationContent = {
  title: string;
  headerColor?: string;
  headerEmoji?: string;
  bodyLines: string[];
  ctaText: string;
  footerNote?: string;
};

/**
 * Send a project notification email to all client_users linked to the project.
 * Each recipient gets a personalized single-use magic link (TTL ~30min) that
 * auto-logs them into the portal — no password required.
 *
 * If no client_user is linked yet (legacy projects), auto-creates one from
 * the project's contactId so the new flow takes over going forward.
 *
 * Non-blocking — errors are logged but don't affect the caller.
 */
async function notifyProjectClient(
  projectId: string,
  subject: string,
  content: ProjectNotificationContent,
) {
  if (!db) return;
  try {
    const [project] = await db.select().from(clientProjects).where(eq(clientProjects.id, projectId)).limit(1);
    if (!project) return;

    // 1) Get all linked client_users (active/invited, never disabled)
    let recipients = await db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        name: clientUsers.name,
        status: clientUsers.status,
      })
      .from(clientUserProjects)
      .innerJoin(clientUsers, eq(clientUsers.id, clientUserProjects.clientUserId))
      .where(eq(clientUserProjects.clientProjectId, projectId));
    recipients = recipients.filter((r) => r.status !== "disabled");

    // 2) Legacy fallback — proyecto sin client_users vinculados pero con contacto:
    //    auto-crear client_user (sin password) y vincular para que la próxima
    //    notificación ya tenga destinatario en el sistema nuevo.
    if (recipients.length === 0 && project.contactId) {
      const [contact] = await db
        .select({ email: contacts.email, nombre: contacts.nombre, optedOut: contacts.optedOut })
        .from(contacts).where(eq(contacts.id, project.contactId)).limit(1);
      if (!contact?.email || contact.optedOut) return;
      const lower = contact.email.toLowerCase().trim();

      const [existing] = await db.select().from(clientUsers).where(eq(clientUsers.email, lower));
      let userId: string;
      let userName: string | null;
      if (existing) {
        userId = existing.id;
        userName = existing.name ?? contact.nombre ?? null;
        if (existing.status === "disabled") return;
      } else {
        const [created] = await db
          .insert(clientUsers)
          .values({ email: lower, name: contact.nombre ?? null, status: "active", acceptedAt: sql`now()` as any })
          .returning();
        userId = created.id;
        userName = created.name;
      }

      await db
        .insert(clientUserProjects)
        .values({ clientUserId: userId, clientProjectId: projectId })
        .onConflictDoNothing()
        .catch(() => {});

      recipients = [{ id: userId, email: lower, name: userName, status: "active" }];
    }

    if (recipients.length === 0) return;

    // 3) For each recipient, generate a personalized magic link and send.
    for (const r of recipients) {
      try {
        const token = await createMagicToken({ clientUserId: r.id, clientProjectId: projectId });
        const html = buildProjectNotificationEmail({
          projectName: project.name,
          clientName: r.name || "cliente",
          title: content.title,
          headerColor: content.headerColor,
          headerEmoji: content.headerEmoji,
          bodyLines: content.bodyLines,
          ctaText: content.ctaText,
          ctaUrl: magicLinkUrl(token),
          footerNote: content.footerNote,
        });
        sendEmail(r.email, subject, html).catch((err) => log(`Error sending project notification to ${r.email}: ${err}`));
      } catch (err) {
        log(`Error preparing magic-link for ${r.email}: ${err}`);
      }
    }
  } catch (err) {
    log(`Error in notifyProjectClient: ${err}`);
  }
}

/**
 * Auto-distribute phase dates proportionally based on estimated hours.
 * Only updates phases that don't have manually-set dates (or all if force=true).
 * Completed phases keep their existing dates.
 */
async function autoDistributePhaseDates(projectId: string, force = false) {
  if (!db) return;

  const [project] = await db.select().from(clientProjects).where(eq(clientProjects.id, projectId)).limit(1);
  if (!project?.startDate || !project?.estimatedEndDate) return;

  const phases = await db.select().from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.orderIndex));

  if (phases.length === 0) return;

  const projectStart = project.startDate.getTime();
  const projectEnd = project.estimatedEndDate.getTime();
  const totalMs = projectEnd - projectStart;

  // Calculate total estimated hours (use 1 as minimum for phases without estimate)
  const totalHours = phases.reduce((sum, p) => sum + (p.estimatedHours || 1), 0);

  let cursor = projectStart;

  for (const phase of phases) {
    // Skip completed phases that already have dates (unless force)
    if (!force && phase.status === "completed" && phase.startDate && phase.endDate) continue;
    // Skip phases with manually-set dates (unless force)
    if (!force && phase.startDate && phase.endDate) continue;

    const phaseHours = phase.estimatedHours || 1;
    const phaseDuration = Math.round((phaseHours / totalHours) * totalMs);
    const phaseStart = new Date(cursor);
    const phaseEnd = new Date(cursor + phaseDuration);

    await db.update(projectPhases)
      .set({ startDate: phaseStart, endDate: phaseEnd })
      .where(eq(projectPhases.id, phase.id));

    cursor += phaseDuration;
  }
}

/**
 * COT timezone helpers — Colombia is UTC-5 with no DST.
 */
function cotDayStartUTC(d: Date): Date {
  // 00:00 COT = 05:00 UTC. If UTC hour < 5, we're still in the previous COT day.
  const r = new Date(d);
  if (r.getUTCHours() < 5) r.setUTCDate(r.getUTCDate() - 1);
  r.setUTCHours(5, 0, 0, 0);
  return r;
}

function setCOTHour(refDate: Date, cotHour: number, cotMin = 0): Date {
  const start = cotDayStartUTC(refDate);
  return new Date(start.getTime() + (cotHour * 60 + cotMin) * 60_000);
}

/**
 * Calculate when to send each email based on template name,
 * adaptive to the window between now and the appointment.
 * All times are COT-aware (UTC-5).
 */
function calculateEmailTime(
  templateName: string,
  now: Date,
  appointmentDate: Date,
  hoursUntilCall: number
): Date | null {
  const MIN_BUFFER_MS = 30 * 60 * 1000; // Must be at least 30 min in the future

  function validOrNull(candidate: Date): Date | null {
    if (candidate.getTime() <= now.getTime() + MIN_BUFFER_MS) return null;
    if (candidate.getTime() >= appointmentDate.getTime()) return null;
    return candidate;
  }

  switch (templateName) {
    case "confirmacion":
      return now;

    case "caso_exito": {
      // Long window (36h+): next morning 10 AM COT
      // Medium window (12-36h): same evening 7 PM COT, fallback next morning 8 AM COT
      // Short (<12h): skip
      if (hoursUntilCall < 12) return null;

      if (hoursUntilCall >= 36) {
        const nextDay10AM = new Date(cotDayStartUTC(now).getTime() + (24 + 10) * 3600_000);
        return validOrNull(nextDay10AM);
      }

      // Medium window: try same evening 7 PM COT
      const evening = setCOTHour(now, 19, 0);
      const ev = validOrNull(evening);
      if (ev) return ev;

      // Fallback: next morning 8 AM COT
      const nextMorning8 = new Date(cotDayStartUTC(now).getTime() + (24 + 8) * 3600_000);
      return validOrNull(nextMorning8);
    }

    case "insight_educativo": {
      // Long window (96h+): day 3 at 10 AM COT
      // Medium window (60-96h): day 2 at 10 AM COT
      // Short (<60h): skip
      if (hoursUntilCall < 60) return null;
      const dayOffset = hoursUntilCall < 96 ? 2 : 3;
      const candidate = new Date(cotDayStartUTC(now).getTime() + (dayOffset * 24 + 10) * 3600_000);
      return validOrNull(candidate);
    }

    case "prep_agenda": {
      // Primary: 24h before appointment
      // Fallback 1: morning of appointment 9 AM COT
      // Fallback 2: morning of appointment 8 AM COT
      // Must not collide with caso_exito (at least 2h after)
      const casoTime = calculateEmailTime("caso_exito", now, appointmentDate, hoursUntilCall);

      const prep24 = validOrNull(new Date(appointmentDate.getTime() - 24 * 3600_000));
      if (prep24 && (!casoTime || prep24.getTime() >= casoTime.getTime() + 2 * 3600_000)) {
        return prep24;
      }

      const morning9 = setCOTHour(appointmentDate, 9, 0);
      const m9 = validOrNull(morning9);
      if (m9 && (!casoTime || m9.getTime() >= casoTime.getTime() + 2 * 3600_000)) {
        return m9;
      }

      const morning8 = setCOTHour(appointmentDate, 8, 0);
      const m8 = validOrNull(morning8);
      if (m8 && (!casoTime || m8.getTime() >= casoTime.getTime() + 2 * 3600_000)) {
        return m8;
      }

      return null;
    }

    case "recordatorio_6h": {
      const reminder6h = new Date(appointmentDate.getTime() - 6 * 3600_000);
      return validOrNull(reminder6h);
    }

    case "micro_recordatorio": {
      const reminder1h = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
      return validOrNull(reminder1h);
    }

    case "seguimiento_post":
      // Triggered manually when meeting is marked "completed" in CRM
      return null;

    default:
      return null;
  }
}

/**
 * Build a Google Calendar "Add to Calendar" URL for the diagnostic session.
 */
function buildGoogleCalendarUrl(
  empresa: string,
  fechaCita: string,
  horaCita: string,
  meetLink: string | null
): string {
  // Parse date and time
  const { parseFechaCita } = require("./date-utils");
  const start = parseFechaCita(fechaCita, horaCita);
  const end = new Date(start.getTime() + 45 * 60 * 1000); // 45 min

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const title = encodeURIComponent(`Diagnóstico IM3 — ${empresa}`);
  const details = encodeURIComponent(
    `Sesión de diagnóstico tecnológico con IM3 Systems (45 min).${meetLink ? `\n\nLink de la reunión: ${meetLink}` : ""}`
  );
  const location = meetLink ? encodeURIComponent(meetLink) : "";

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`;
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
      // Update last activity timestamp for lead score decay
      await db.update(contacts).set({ lastActivityAt: new Date() }).where(eq(contacts.id, contactId));
    } catch (err) {
      log(`Error logging activity: ${err}`);
    }
  }

  // Zod schema for diagnostic form — Fase 1 obligatoria (booking)
  const diagnosticSchema = z.object({
    fechaCita: z.string().min(1),
    horaCita: z.string().min(1),
    email: z.string().email(),
    participante: z.string().min(1),
    empresa: z.string().min(1),
    telefono: z.string().min(1),
    industria: z.string().min(1),
    industriaOtro: z.string().nullish().transform(v => v ?? undefined),
    empleados: z.string().min(1),
    areaPrioridad: z.array(z.string()).min(1),
    presupuesto: z.string().min(1),
    formDurationMinutes: z.number().optional(),
  });

  // Zod schema for Fase 2 (PATCH, todos opcionales)
  const phase2PatchSchema = z.object({
    objetivos: z.array(z.string()).optional(),
    productos: z.string().optional(),
    volumenMensual: z.string().optional(),
    canalesAdquisicion: z.array(z.string()).optional(),
    herramientas: z.array(z.string()).optional(),
    herramientasOtras: z.string().optional(),
    conectadas: z.string().optional(),
    madurezTech: z.string().optional(),
    usaIA: z.string().optional(),
  });

  // Newsletter subscription email validation
  const newsletterEmailSchema = z.object({
    email: z.string().email("Email inválido"),
    language: z.enum(["es", "en"]).optional().default("es"),
  });

  // Booked slots for a given date (public, no auth)
  app.get("/api/booked-slots", async (req, res) => {
    if (!db) return res.json([]);
    const date = req.query.date as string;
    if (!date) return res.json([]);
    const booked = await db.select({ horaCita: diagnostics.horaCita })
      .from(diagnostics)
      .where(eq(diagnostics.fechaCita, date));
    res.json(booked.map(b => b.horaCita).filter(Boolean));
  });

  // Diagnostic form submission
  app.post("/api/diagnostic", async (req, res) => {
    const parsed = diagnosticSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Datos incompletos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const data = parsed.data;
    const diagLanguage: string = req.body.language === "en" ? "en" : "es";

    log(`Diagnóstico recibido: ${data.empresa} — ${data.participante} (${diagLanguage})`);

    let insertedId: string | null = null;

    // Save to PostgreSQL if database is available
    if (db) {
      // Check for slot conflict
      if (data.fechaCita && data.horaCita) {
        const conflict = await db.select({ id: diagnostics.id })
          .from(diagnostics)
          .where(and(
            eq(diagnostics.fechaCita, data.fechaCita),
            eq(diagnostics.horaCita, data.horaCita)
          )).limit(1);
        if (conflict.length > 0) {
          res.status(409).json({ message: "Este horario ya fue reservado. Por favor selecciona otro." });
          return;
        }
      }

      try {
        const [inserted] = await db.insert(diagnostics).values({
          fechaCita: data.fechaCita,
          horaCita: data.horaCita,
          empresa: data.empresa,
          industria: data.industria,
          industriaOtro: data.industriaOtro || null,
          empleados: data.empleados,
          participante: data.participante,
          email: data.email,
          telefono: data.telefono || null,
          areaPrioridad: data.areaPrioridad,
          presupuesto: data.presupuesto,
          formDurationMinutes: data.formDurationMinutes || null,
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
          industria: getIndustriaLabel(data.industria) + (data.industria === "otro" && data.industriaOtro ? ` (${data.industriaOtro})` : ""),
          industriaCode: data.industria,
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

    // Create Google Calendar event with Meet link (AWAIT — must complete before email scheduling)
    let generatedMeetLink: string | null = null;
    let generatedEventId: string | null = null;
    if (db && insertedId && data.email) {
      try {
        const calResult = await createCalendarEvent({
          diagnosticId: insertedId,
          empresa: data.empresa,
          participante: data.participante,
          email: data.email,
          fechaCita: data.fechaCita,
          horaCita: data.horaCita,
        });
        if (calResult && db) {
          generatedMeetLink = calResult.meetLink || null;
          generatedEventId = calResult.eventId || null;
          await db.update(diagnostics)
            .set({
              meetLink: generatedMeetLink,
              googleCalendarEventId: generatedEventId,
            })
            .where(eq(diagnostics.id, insertedId));
          log(`Meet link creado: ${generatedMeetLink} (eventId: ${generatedEventId})`);
        }
      } catch (err) {
        log(`Error creando evento Calendar: ${err}`);
      }
    }

    // Create CRM contact (non-blocking, independent of email config)
    if (db && insertedId && data.email) {
      (async () => {
        try {
          // Check for existing contact — update if exists, create if new
          const [existingContact] = await db.select().from(contacts)
            .where(eq(contacts.email, data.email)).limit(1);

          let contact;
          let isReturning = false;

          if (existingContact) {
            // Update existing contact with diagnostic data (e.g., newsletter subscriber booking a diagnostic)
            const mergedTags = [...new Set([...(existingContact.tags as string[] || []), "diagnostic"])];
            [contact] = await db.update(contacts).set({
              diagnosticId: insertedId!,
              nombre: data.participante,
              empresa: data.empresa,
              telefono: data.telefono || existingContact.telefono,
              status: "scheduled",
              tags: mergedTags,
              idioma: diagLanguage,
            }).where(eq(contacts.id, existingContact.id)).returning();
            isReturning = true;
            log(`Contacto ${data.email} actualizado con diagnóstico (contacto existente)`);
            logActivity(contact.id, "form_submitted", `Contacto existente completó diagnóstico — ${data.participante} de ${data.empresa}`, { empresa: data.empresa, diagnosticId: insertedId, returning: true });

            // Alert admin when a newsletter subscriber books a diagnostic (warm lead conversion)
            const wasNewsletterSubscriber = (existingContact.tags as string[] || []).includes("newsletter");
            if (wasNewsletterSubscriber) {
              await db.insert(notifications).values({
                type: "lead_converted",
                title: "Suscriptor de newsletter agendó cita",
                description: `${data.participante} de ${data.empresa} era suscriptor del newsletter y acaba de agendar una auditoría`,
                contactId: contact.id,
              });

              const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
              const baseUrl = process.env.BASE_URL || "https://im3systems.com";
              sendEmail(
                adminEmail,
                `🔥 Conversión: suscriptor de newsletter agendó cita — ${data.participante}`,
                `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
                  <div style="background:#B45309;padding:20px 28px;border-radius:8px 8px 0 0">
                    <h1 style="color:#fff;font-size:18px;margin:0">🔥 Conversión Newsletter → Auditoría</h1>
                  </div>
                  <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                    <p style="font-size:14px;margin:0 0 16px"><strong>${data.participante}</strong> de <strong>${data.empresa}</strong> estaba suscrito al newsletter y acaba de agendar una auditoría de diagnóstico.</p>
                    <p style="font-size:13px;color:#B45309;font-weight:600;margin:0 0 16px">Este contacto ya estaba caliente — prioridad alta.</p>
                    <table style="width:100%;border-collapse:collapse;font-size:14px">
                      <tr><td style="padding:6px 0;color:#666;width:120px">Email</td><td style="padding:6px 0">${data.email}</td></tr>
                      ${data.telefono ? `<tr><td style="padding:6px 0;color:#666">Teléfono</td><td style="padding:6px 0">${data.telefono}</td></tr>` : ""}
                      <tr><td style="padding:6px 0;color:#666">Industria</td><td style="padding:6px 0">${getIndustriaLabel(data.industria, "—")}${data.industria === "otro" && data.industriaOtro ? ` (${data.industriaOtro})` : ""}</td></tr>
                      <tr><td style="padding:6px 0;color:#666">Cita</td><td style="padding:6px 0">${data.fechaCita || "—"} ${data.horaCita || ""}</td></tr>
                    </table>
                    <div style="margin-top:20px">
                      <a href="${baseUrl}/admin/contacts/${contact.id}" style="display:inline-block;background:#B45309;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">Ver en CRM →</a>
                    </div>
                  </div>
                </div>`
              ).catch((err) => log(`Error sending newsletter conversion alert: ${err}`));
            }
          } else {
            // Create new contact
            [contact] = await db.insert(contacts).values({
              diagnosticId: insertedId!,
              email: data.email,
              nombre: data.participante,
              empresa: data.empresa,
              telefono: data.telefono || null,
              idioma: diagLanguage,
            }).returning();
            logActivity(contact.id, "form_submitted", `Formulario diagnóstico completado por ${data.participante}`, { empresa: data.empresa, diagnosticId: insertedId });
          }

          // Auto-create deal for pipeline
          if (isReturning) {
            const existingDeal = await db.select().from(deals)
              .where(eq(deals.contactId, contact.id)).limit(1);
            if (existingDeal.length === 0) {
              await db.insert(deals).values({
                contactId: contact.id,
                title: `Diagnóstico — ${data.empresa}`,
                stage: "qualification",
              });
            }
          } else {
            await db.insert(deals).values({
              contactId: contact.id,
              title: `Diagnóstico — ${data.empresa}`,
              stage: "qualification",
            });
          }

          // Fetch full diagnostic for lead scoring
          const [diagForAI] = await db.select().from(diagnostics).where(eq(diagnostics.id, insertedId!));

          // Calculate initial lead score
          try {
            const score = calculateLeadScore(contact, diagForAI || null, { sent: 0, opened: 0, clicked: 0 });
            await db.update(contacts).set({ leadScore: score }).where(eq(contacts.id, contact.id));
            logActivity(contact.id, "score_changed", `Lead score inicial: ${score}`, { oldScore: 0, newScore: score });
          } catch (err) {
            log(`Error calculating lead score: ${err}`);
          }

          // Auto-create follow-up tasks
          try {
            const appointmentDate = parseFechaCita(data.fechaCita, data.horaCita);
            await db.insert(tasks).values({
              contactId: contact.id,
              title: `Revisar diagnóstico de ${data.empresa}`,
              priority: "high",
              dueDate: appointmentDate,
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

          // Calculate appointment timing (shared by email + WhatsApp)
          const appointmentDate = parseFechaCita(data.fechaCita, data.horaCita);

          // Enrich diagForAI with meet link, calendar URL, and action links
          if (diagForAI) {
            // Ensure meetLink is set (may have been saved after initial fetch)
            if (!diagForAI.meetLink && generatedMeetLink) {
              (diagForAI as any).meetLink = generatedMeetLink;
            }
            const baseUrl = process.env.BASE_URL || "https://im3systems.com";
            (diagForAI as any)._calendarAddUrl = buildGoogleCalendarUrl(
              data.empresa, data.fechaCita, data.horaCita, diagForAI.meetLink || generatedMeetLink
            );
            (diagForAI as any)._rescheduleUrl = `${baseUrl}/api/reschedule/${contact.id}`;
            (diagForAI as any)._cancelUrl = `${baseUrl}/api/cancel/${contact.id}`;
          }

          // Flag returning contacts so AI emails acknowledge them
          if (isReturning && diagForAI) {
            (diagForAI as any)._isReturningContact = true;
          }

          // Schedule email sequence (only if email system is configured)
          if (isEmailConfigured()) {
            try {
              const templates = await db
                .select()
                .from(emailTemplates)
                .where(eq(emailTemplates.isActive, true))
                .orderBy(asc(emailTemplates.sequenceOrder));

              const sequenceTemplates = templates.filter(t => t.sequenceOrder < 90);

              if (sequenceTemplates.length === 0) {
                log("⚠ No se encontraron templates activos — correr seed");
              }

              const now = new Date();
              const hoursUntilCall = Math.max(0, (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60));

              let scheduled = 0;

              for (const template of sequenceTemplates) {
                const scheduledFor = calculateEmailTime(template.nombre, now, appointmentDate, hoursUntilCall);
                if (!scheduledFor) continue;

                let subject: string | null = null;
                let body: string | null = null;
                try {
                  if (template.nombre === "micro_recordatorio") {
                    const r = buildMicroReminderEmail(
                      data.participante, data.horaCita,
                      diagForAI?.meetLink || null, contact.id, diagLanguage
                    );
                    subject = r.subject;
                    body = r.body;
                  } else if (template.nombre === "recordatorio_6h") {
                    const r = build6hReminderEmail(
                      data.participante, data.horaCita,
                      diagForAI?.meetLink || null, contact.id,
                      (diagForAI as any)?._calendarAddUrl || null, diagLanguage
                    );
                    subject = r.subject;
                    body = r.body;
                  } else {
                    const r = await generateEmailContent(template, diagForAI || null, contact.id, diagLanguage);
                    subject = r.subject;
                    body = r.body;
                  }
                } catch (err) {
                  log(`Pre-gen failed for ${template.nombre}: ${err}`);
                }

                const [insertedEmail] = await db.insert(sentEmails).values({
                  contactId: contact.id,
                  templateId: template.id,
                  scheduledFor,
                  subject,
                  body,
                }).returning();
                scheduled++;

                // Send confirmation email immediately (don't wait for cron)
                if (template.nombre === "confirmacion" && subject && body) {
                  sendEmail(data.email, subject, body)
                    .then(() => {
                      db!.update(sentEmails)
                        .set({ status: "sent", sentAt: new Date() })
                        .where(eq(sentEmails.id, insertedEmail.id))
                        .catch(() => {});
                      log(`Email de confirmación enviado inmediatamente a ${data.email}`);
                    })
                    .catch(err => log(`Error enviando confirmación inmediata: ${err}`));
                }
              }

              log(`Secuencia de ${scheduled} email(s) programada para ${data.email} (${Math.round(hoursUntilCall)}h hasta la cita)`);

              // Schedule mini-audit cascade: email +60min → WA reminder +180min → WA content +360min
              try {
                const auditTemplate = templates.find(t => t.nombre === "mini_auditoria");
                if (auditTemplate && diagForAI) {
                  const audit = await generateMiniAudit(diagForAI, contact.id, contact.idioma || "es");
                  const auditScheduledFor = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour

                  await db.insert(sentEmails).values({
                    contactId: contact.id,
                    templateId: auditTemplate.id,
                    scheduledFor: auditScheduledFor,
                    subject: audit.subject,
                    body: audit.body,
                  });

                  // WhatsApp reminder (+3h) — only sent if email not opened
                  if (isWhatsAppConfigured() && data.telefono) {
                    await db.insert(whatsappMessages).values({
                      contactId: contact.id,
                      phone: data.telefono,
                      message: `Hola ${data.participante}, te enviamos un análisis preliminar de ${data.empresa} al correo. Tiene insights interesantes para tu auditoría. ¡Revísalo! — Equipo IM3`,
                      scheduledFor: new Date(now.getTime() + 180 * 60 * 1000), // +3 hours
                      conditionType: "if_email_not_opened",
                      conditionEmailTemplate: "mini_auditoria",
                    });

                    // WhatsApp with full content (+6h) — only if still not opened
                    await db.insert(whatsappMessages).values({
                      contactId: contact.id,
                      phone: data.telefono,
                      message: audit.whatsappSummary,
                      scheduledFor: new Date(now.getTime() + 360 * 60 * 1000), // +6 hours
                      conditionType: "if_email_not_opened",
                      conditionEmailTemplate: "mini_auditoria",
                    });
                  }

                  log(`Mini-auditoría programada para ${data.email}: email +1h, WA +3h, WA +6h`);
                }
              } catch (auditErr) {
                log(`Error programando mini-auditoría: ${auditErr}`);
              }
            } catch (emailErr) {
              log(`Error programando emails: ${emailErr}`);
            }

            // Send email notification to admin
            const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
            const baseUrl = process.env.BASE_URL || "https://im3systems.com";
            sendEmail(
              adminEmail,
              `🔔 Nuevo lead: ${data.participante} de ${data.empresa}`,
              `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
                <div style="background:#0F172A;padding:20px 28px;border-radius:8px 8px 0 0">
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
                    <a href="${baseUrl}/admin/contacts/${contact.id}" style="display:inline-block;background:#3B82F6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">Ver en CRM →</a>
                  </div>
                </div>
              </div>`
            ).catch((err) => log(`Error sending admin notification: ${err}`));
          }

          // Schedule WhatsApp messages (independent of email config)
          if (isWhatsAppConfigured() && data.telefono) {
            try {
              const waSchedule = calculateWhatsAppSchedule(appointmentDate, new Date());
              let waScheduled = 0;

              for (const wa of waSchedule) {
                const seqConfig = WHATSAPP_SEQUENCE.find(s => s.name === wa.name);
                const params = seqConfig?.useTemplate && seqConfig.buildParams
                  ? seqConfig.buildParams(data.participante, data.empresa, data.horaCita)
                  : undefined;

                // For non-template messages, generate with AI
                let message = "";
                if (!wa.useTemplate) {
                  message = await generateWhatsAppMessage(contact, diagForAI || null);
                }

                await db.insert(whatsappMessages).values({
                  contactId: contact.id,
                  phone: data.telefono,
                  message,
                  templateName: wa.templateName || null,
                  templateParams: params || null,
                  scheduledFor: wa.scheduledFor,
                });
                waScheduled++;
              }

              if (waScheduled > 0) {
                log(`Secuencia de ${waScheduled} WhatsApp(s) programada para ${data.telefono}`);
              }
            } catch (waErr) {
              log(`Error programando WhatsApp: ${waErr}`);
            }
          }
        } catch (err) {
          log(`Error creando contacto CRM: ${err}`);
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

  // Fase 2 — completar mini-diagnóstico (campos opcionales post-booking)
  app.patch("/api/diagnostic/:id", async (req, res) => {
    if (!db) {
      res.status(503).json({ message: "Base de datos no disponible" });
      return;
    }

    const parsed = phase2PatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const diagnosticId = req.params.id;
    const p = parsed.data;

    try {
      // Fusionar herramientas + herramientasOtras en un string para el campo text legacy "herramientas"
      const herramientasFinal = [
        ...(p.herramientas ?? []),
        ...(p.herramientasOtras ? [p.herramientasOtras] : []),
      ].join(", ") || null;

      const [updated] = await db
        .update(diagnostics)
        .set({
          objetivos: p.objetivos ?? null,
          productos: p.productos || null,
          volumenMensual: p.volumenMensual || null,
          canalesAdquisicion: p.canalesAdquisicion ?? null,
          herramientas: herramientasFinal,
          conectadas: p.conectadas || null,
          nivelTech: p.madurezTech || null,
          usaIA: p.usaIA || null,
          phase2CompletedAt: new Date(),
        })
        .where(eq(diagnostics.id, diagnosticId))
        .returning();

      if (!updated) {
        res.status(404).json({ message: "Diagnóstico no encontrado" });
        return;
      }

      // Recalcular lead score con la nueva info
      try {
        const [contact] = await db.select().from(contacts).where(eq(contacts.diagnosticId, diagnosticId)).limit(1);
        if (contact) {
          const emailsSummary = { sent: 0, opened: 0, clicked: 0 };
          const newScore = calculateLeadScore(contact, updated, emailsSummary);
          if (newScore !== contact.leadScore) {
            await db.update(contacts).set({ leadScore: newScore }).where(eq(contacts.id, contact.id));
            logActivity(contact.id, "score_changed", `Lead score actualizado tras Fase 2: ${newScore}`, { oldScore: contact.leadScore, newScore });
          }
        }
      } catch (err) {
        log(`Error recalculando lead score tras Fase 2: ${err}`);
      }

      res.json({ success: true });
    } catch (err) {
      log(`Error en PATCH /api/diagnostic/:id: ${err}`);
      res.status(500).json({ message: "Error al guardar" });
    }
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
        const updateData: Record<string, any> = { status: newStatus };
        if (newStatus === "opened") updateData.openedAt = new Date();
        const [updatedEmail] = await db
          .update(sentEmails)
          .set(updateData)
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
              const emailSummary: { sent: number; opened: number; clicked: number; firstOpenDelayMinutes?: number } = { sent: 0, opened: 0, clicked: 0 };
              let earliestOpenDelay: number | undefined;
              for (const e of contactEmails) {
                if (e.status === "sent" || e.status === "opened" || e.status === "clicked") emailSummary.sent++;
                if (e.status === "opened" || e.status === "clicked") {
                  emailSummary.opened++;
                  // Calculate first open delay (time from send to open)
                  if (e.openedAt && e.sentAt) {
                    const delayMs = new Date(e.openedAt).getTime() - new Date(e.sentAt).getTime();
                    const delayMin = Math.max(0, delayMs / 60000);
                    if (earliestOpenDelay === undefined || delayMin < earliestOpenDelay) {
                      earliestOpenDelay = delayMin;
                    }
                  }
                }
                if (e.status === "clicked") emailSummary.clicked++;
              }
              if (earliestOpenDelay !== undefined) emailSummary.firstOpenDelayMinutes = earliestOpenDelay;
              const score = calculateLeadScore(contact, diagnostic || null, emailSummary);
              await db.update(contacts).set({ leadScore: score }).where(eq(contacts.id, contact.id));
              if (score !== oldScore) {
                logActivity(contact.id, "score_changed", `Lead score: ${oldScore} → ${score}`, { oldScore, newScore: score });
                // Hot lead notification
                if (score > 60 && oldScore <= 60) {
                  await db.insert(notifications).values({
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
                          <a href="${baseUrl}/admin/contacts" style="background:#3B82F6;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px">Ver en CRM →</a>
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

  // WhatsApp webhook — verification (GET) and status updates (POST)
  app.get("/api/whatsapp/webhook", (req, res) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      log("[WhatsApp] Webhook verified");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    // Respond quickly to avoid Meta retries
    res.sendStatus(200);

    if (!db) return;

    try {
      const body = req.body;
      const entries = body?.entry || [];

      for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          // Handle status updates
          const statuses = change?.value?.statuses || [];
          for (const status of statuses) {
            const waMessageId = status.id;
            const waStatus = status.status; // sent | delivered | read | failed
            const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000) : new Date();

            if (!waMessageId || !waStatus) continue;

            const updateData: Record<string, any> = {};
            if (waStatus === "delivered") {
              updateData.status = "delivered";
              updateData.deliveredAt = timestamp;
            } else if (waStatus === "read") {
              updateData.status = "read";
              updateData.readAt = timestamp;
            } else if (waStatus === "failed") {
              updateData.status = "failed";
              const errors = status.errors || [];
              updateData.errorMessage = errors[0]?.title || "Delivery failed";
            }

            if (Object.keys(updateData).length > 0) {
              await db.update(whatsappMessages)
                .set(updateData)
                .where(eq(whatsappMessages.whatsappMessageId, waMessageId))
                .catch(() => {});

              log(`[WhatsApp] Status update: ${waMessageId} → ${waStatus}`);
            }
          }

          // Handle incoming messages — AI-powered conversational WhatsApp
          const messages = change?.value?.messages || [];
          for (const message of messages) {
            if (message.type !== "text" || !message.text?.body) continue;

            const senderPhone = message.from; // E.164 format
            const messageText = message.text.body;
            log(`[WhatsApp] Incoming from ${senderPhone}: "${messageText.substring(0, 80)}"`);

            // Find contact by phone (try original, without country code, and with + prefix)
            const phoneVariants = [senderPhone, senderPhone.replace(/^57/, ""), `+${senderPhone}`];
            const [contact] = await db.select().from(contacts)
              .where(or(...phoneVariants.map(v => eq(contacts.telefono, v))))
              .limit(1);

            if (!contact) {
              log(`[WhatsApp] No contact found for phone ${senderPhone}`);
              continue;
            }

            // Get diagnostic data for context
            const [diagnostic] = contact.diagnosticId
              ? await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId))
              : [null];

            // Classify intent with AI and handle response
            let intent: { type: string; confidence: number } = { type: "other", confidence: 0 };
            let autoReply: string | null = null;

            try {
              intent = await classifyWhatsAppIntent(messageText, contact, diagnostic);
              log(`[WhatsApp] Intent: ${intent.type} (confidence: ${intent.confidence}) for ${contact.nombre}`);
            } catch (aiErr: any) {
              log(`[WhatsApp] AI classification failed, using fallback: ${aiErr?.message}`);
            }

            logActivity(contact.id, "whatsapp_received", `WhatsApp recibido: "${messageText.substring(0, 100)}"`, { intent: intent.type, confidence: intent.confidence });

            const baseUrl = process.env.BASE_URL || "https://im3systems.com";

            try {
              switch (intent.type) {
                case "question": {
                  autoReply = await generateWhatsAppAutoReply(messageText, contact, diagnostic);
                  await sendWhatsAppText(senderPhone, autoReply);
                  logActivity(contact.id, "whatsapp_sent", `Respuesta automática: "${autoReply.substring(0, 100)}"`);
                  break;
                }
                case "reschedule": {
                  autoReply = `¡Claro, ${contact.nombre}! Puedes reagendar aquí: ${baseUrl}/booking — Equipo IM3`;
                  await sendWhatsAppText(senderPhone, autoReply);
                  await db.insert(notifications).values({
                    type: "reschedule_request",
                    title: `Solicitud de reagendamiento`,
                    description: `${contact.nombre} (${contact.empresa}) quiere reagendar por WhatsApp`,
                    contactId: contact.id,
                  });
                  logActivity(contact.id, "whatsapp_sent", "Link de reagendamiento enviado");
                  break;
                }
                case "interest": {
                  await db.insert(notifications).values({
                    type: "hot_lead",
                    title: `Respuesta positiva por WhatsApp`,
                    description: `${contact.nombre}: "${messageText.substring(0, 100)}"`,
                    contactId: contact.id,
                  });
                  autoReply = `¡Excelente, ${contact.nombre}! Le paso tu mensaje al equipo. Te contactaremos pronto. — Equipo IM3`;
                  await sendWhatsAppText(senderPhone, autoReply);
                  logActivity(contact.id, "whatsapp_sent", "Confirmación de interés enviada");
                  break;
                }
                case "rejection": {
                  logActivity(contact.id, "whatsapp_rejection", `Rechazo detectado: "${messageText.substring(0, 100)}"`);
                  await db.insert(notifications).values({
                    type: "cold_lead",
                    title: `Rechazo por WhatsApp`,
                    description: `${contact.nombre}: "${messageText.substring(0, 100)}"`,
                    contactId: contact.id,
                  });
                  // Don't auto-reply to rejections — let admin decide
                  break;
                }
                default: {
                  // "other" — simple greeting or unclear, send friendly reply
                  autoReply = `Hola ${contact.nombre}, gracias por tu mensaje. ¿En qué te podemos ayudar? — Equipo IM3`;
                  await sendWhatsAppText(senderPhone, autoReply);
                  logActivity(contact.id, "whatsapp_sent", "Respuesta genérica enviada");
                  break;
                }
              }
            } catch (replyErr: any) {
              log(`[WhatsApp] Error processing reply for ${contact.nombre}: ${replyErr?.message}`);
              // Try to send fallback reply
              try {
                autoReply = `Hola ${contact.nombre}, recibimos tu mensaje. Te responderemos pronto. — Equipo IM3`;
                await sendWhatsAppText(senderPhone, autoReply);
              } catch (_) {}
            }

            // Notify admin via email about the incoming WhatsApp message
            try {
              const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
              const notification = buildWhatsAppNotificationEmail(contact, messageText, intent, autoReply);
              await sendEmail(adminEmail, notification.subject, notification.body);
              log(`[WhatsApp] Admin notified: ${notification.subject}`);
            } catch (notifErr: any) {
              log(`[WhatsApp] Failed to notify admin: ${notifErr?.message}`);
            }
          }
        }
      }
    } catch (err: any) {
      log(`[WhatsApp] Webhook error: ${err?.message}`);
    }
  });

  // Track email for abandonment detection
  app.post("/api/track-email", async (req, res) => {
    const { email } = req.body;

    // Validate email format before saving — prevents Resend 422 errors later
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (!db || !email || !emailRegex.test(email)) {
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
    const parsed = newsletterEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email inválido" });
      return;
    }
    const { email, language } = parsed.data;

    if (!db) {
      return res.status(500).json({ error: "Servicio temporalmente no disponible" });
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
            idioma: language,
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
        // AI-generated welcome with "dato curioso" — falls back to static template
        let welcomeSubject = language === "en" ? "Welcome to the IM3 Systems newsletter" : "Bienvenido al newsletter de IM3 Systems";
        let welcomeHtml = language === "en"
          ? `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
          <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:24px 32px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:22px;margin:0">IM3 Systems</h1>
          </div>
          <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
            <h2 style="color:#0F172A;font-size:20px;margin:0 0 16px">Thanks for subscribing!</h2>
            <p style="line-height:1.6;margin:0 0 16px">Every week you'll receive the most relevant trends in artificial intelligence, automation and technology applied to businesses.</p>
            <p style="line-height:1.6;margin:0 0 16px">Not just news — we'll share <strong>3 concrete steps</strong> you can implement in your business that same week.</p>
            <p style="line-height:1.6;margin:0 0 24px">Our goal: that in 2 minutes of reading you get real value for your operation.</p>
            <p style="line-height:1.6;margin:0;color:#666">— IM3 Systems Team</p>
          </div>
        </div>`
          : `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
          <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:24px 32px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:22px;margin:0">IM3 Systems</h1>
          </div>
          <div style="padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
            <h2 style="color:#0F172A;font-size:20px;margin:0 0 16px">¡Gracias por suscribirte!</h2>
            <p style="line-height:1.6;margin:0 0 16px">Cada semana recibirás las tendencias más relevantes en inteligencia artificial, automatización y tecnología aplicada a empresas.</p>
            <p style="line-height:1.6;margin:0 0 16px">No solo noticias — te compartiremos <strong>3 pasos concretos</strong> que puedes implementar en tu empresa esa misma semana.</p>
            <p style="line-height:1.6;margin:0 0 24px">Nuestro objetivo: que en 2 minutos de lectura obtengas valor real para tu operación.</p>
            <p style="line-height:1.6;margin:0;color:#666">— Equipo IM3 Systems</p>
          </div>
        </div>`;
        try {
          const aiWelcome = await generateNewsletterWelcome(language);
          welcomeSubject = aiWelcome.subject;
          welcomeHtml = aiWelcome.body;
        } catch (aiErr) {
          log(`AI newsletter welcome failed, using fallback: ${aiErr}`);
        }

        sendEmail(email, welcomeSubject, welcomeHtml).then((result) => {
          // Track welcome email in sentEmails for CRM visibility
          if (contactId && db) {
            db.insert(sentEmails).values({
              contactId,
              templateId: "newsletter-welcome",
              subject: welcomeSubject,
              body: welcomeHtml,
              status: "sent",
              sentAt: new Date(),
              scheduledFor: new Date(),
              resendMessageId: result?.messageId || null,
            }).catch((err) => log(`Error tracking welcome email: ${err}`));
            logActivity(contactId, "email_sent", "Email de bienvenida al newsletter enviado");
          }
        }).catch((err) => {
          log(`Error sending newsletter welcome: ${err}`);
        });

        // Notify admin about new subscriber (non-blocking)
        const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
        sendEmail(
          adminEmail,
          `📬 Nueva suscripción newsletter: ${email}`,
          `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
            <div style="background:#0F172A;padding:20px 28px;border-radius:8px 8px 0 0">
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

  // Create contact manually (for referrals, direct clients)
  app.post("/api/admin/contacts", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const { nombre, empresa, email, telefono, status, tags, nota } = req.body as {
        nombre: string; empresa: string; email: string; telefono?: string;
        status?: string; tags?: string[]; nota?: string;
      };

      if (!nombre || !empresa || !email) {
        return res.status(400).json({ message: "Nombre, empresa y email son requeridos" });
      }

      // Check if email already exists
      const [existing] = await db.select().from(contacts).where(eq(contacts.email, email));
      if (existing) {
        return res.status(409).json({ message: "Ya existe un contacto con ese email", contactId: existing.id });
      }

      const [contact] = await db.insert(contacts).values({
        nombre,
        empresa,
        email,
        telefono: telefono || null,
        status: status || "contacted",
        tags: tags || [],
        lastActivityAt: new Date(),
      }).returning();

      // Create initial note if provided
      if (nota) {
        await db.insert(contactNotes).values({
          contactId: contact.id,
          content: nota,
        });
      }

      // Log activity
      await db.insert(activityLog).values({
        contactId: contact.id,
        type: "contact_created",
        description: "Contacto creado manualmente (referido/directo)",
      });

      res.json(contact);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
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

  // Delete contact (cascades to all related records)
  app.delete("/api/admin/contacts/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    try {
      // Verify contact exists
      const [existing] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Contacto no encontrado" });

      // Cascade delete all related records (no FK constraints in schema)
      await db.delete(sentEmails).where(eq(sentEmails.contactId, contactId));
      await db.delete(whatsappMessages).where(eq(whatsappMessages.contactId, contactId));
      await db.delete(activityLog).where(eq(activityLog.contactId, contactId));
      await db.delete(tasks).where(eq(tasks.contactId, contactId));
      await db.delete(contactNotes).where(eq(contactNotes.contactId, contactId));
      await db.delete(deals).where(eq(deals.contactId, contactId));
      await db.delete(notifications).where(eq(notifications.contactId, contactId));
      await db.delete(aiInsightsCache).where(eq(aiInsightsCache.contactId, contactId));
      await db.delete(gmailEmails).where(eq(gmailEmails.contactId, contactId));
      await db.delete(contactEmails).where(eq(contactEmails.contactId, contactId));
      await db.delete(contactFiles).where(eq(contactFiles.contactId, contactId));

      // Delete the contact
      await db.delete(contacts).where(eq(contacts.id, contactId));

      log(`Contact ${existing.email} deleted with all related records`);
      res.json({ success: true, deleted: existing.email });
    } catch (err: any) {
      log(`Error deleting contact: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando contacto" });
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

      const lang = contact.idioma || "es";
      if (template.nombre === "micro_recordatorio") {
        const r = buildMicroReminderEmail(
          diagnostic?.participante || contact.nombre,
          diagnostic?.horaCita || "",
          diagnostic?.meetLink || null,
          contact.id, lang
        );
        subject = r.subject;
        body = r.body;
      } else {
        const r = await generateEmailContent(template, diagnostic || null, contact.id, lang);
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
          meetingStatus: d.meetingStatus || "scheduled",
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
        if (age < 7 * 24 * 60 * 60 * 1000) {
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

  // ============ TEST FULL EMAIL SEQUENCE ============

  app.post("/api/admin/test-full-sequence", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const targetEmail = "info@im3systems.com";

    const sampleData: any = {
      empresa: "Café & Aroma S.A.S",
      industria: "Alimentos y bebidas",
      participante: "Marcela Torres",
      anosOperacion: "8",
      empleados: "12",
      ciudades: "Medellín",
      objetivos: ["Automatizar pedidos", "Control de inventario"],
      resultadoEsperado: "Reducir pérdidas de inventario y agilizar pedidos de proveedores",
      productos: "Café de especialidad, bebidas artesanales, pastelería",
      herramientas: "Excel, WhatsApp Business",
      nivelTech: "Básico",
      usaIA: "No",
      comodidadTech: "Media",
      areaPrioridad: ["Inventario", "Ventas"],
      presupuesto: "$1,000 - $5,000 USD",
      fechaCita: "2026-03-17",
      horaCita: "10:00 AM",
      meetLink: "https://meet.google.com/abc-defg-hij",
    };

    try {
      // Get all templates ordered by sequence
      const templates = await db.select().from(emailTemplates)
        .orderBy(emailTemplates.sequenceOrder);

      const results: string[] = [];
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
      let step = 1;

      for (const template of templates) {
        if (template.sequenceOrder === 99) continue; // skip abandono

        let subject: string;
        let body: string;

        if (template.nombre === "recordatorio_6h") {
          const result = build6hReminderEmail(sampleData.participante, sampleData.horaCita, sampleData.meetLink, "test");
          subject = result.subject;
          body = result.body;
        } else if (template.nombre === "micro_recordatorio") {
          const result = buildMicroReminderEmail(sampleData.participante, sampleData.horaCita, sampleData.meetLink, "test");
          subject = result.subject;
          body = result.body;
        } else {
          const generated = await generateEmailContent(template, sampleData);
          subject = generated.subject;
          body = generated.body;
        }

        const prefix = `[TEST ${step}/8]`;
        await sendEmail(targetEmail, `${prefix} ${subject}`, body);
        results.push(`${prefix} ${template.nombre}: ${subject}`);
        log(`Sent ${prefix} ${template.nombre} to ${targetEmail}`);
        step++;
        await delay(5000);
      }

      // Newsletter
      log("Generating test newsletter...");
      const digest = await generateDailyNewsDigest("es");
      const newsletterHtml = digest.emailHtml.replace("{{EMAIL}}", encodeURIComponent(targetEmail));
      await sendEmail(targetEmail, `[TEST ${step}/8] ${digest.emailSubject}`, newsletterHtml);
      results.push(`[TEST ${step}/8] Newsletter: ${digest.emailSubject}`);
      log(`Sent [TEST ${step}/8] Newsletter to ${targetEmail}`);

      res.json({ success: true, sent: results });
    } catch (err: any) {
      log(`Error in test-full-sequence: ${err?.message}`);
      res.status(500).json({ error: err?.message || "Error enviando secuencia" });
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

  // Mark appointment as completed or no-show
  app.patch("/api/admin/appointments/:id/status", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { status } = req.body; // "completed" | "no_show" | "cancelled" | "scheduled"
      if (!["completed", "no_show", "cancelled", "scheduled"].includes(status)) {
        return res.status(400).json({ error: "Estado inválido" });
      }

      const updates: any = { status };
      if (status === "completed") {
        updates.completedAt = new Date();
      } else {
        updates.completedAt = null;
      }

      const [updated] = await db.update(appointments)
        .set(updates)
        .where(eq(appointments.id, req.params.id as string))
        .returning();

      if (!updated) return res.status(404).json({ error: "Cita no encontrada" });

      // Log activity if appointment has a contact
      if (updated.contactId) {
        const activityType = status === "completed" ? "meeting_completed" : status === "no_show" ? "meeting_no_show" : `meeting_${status}`;
        const descriptions: Record<string, string> = {
          completed: `Reunión completada: "${updated.title}"`,
          no_show: `No se presentó a la reunión: "${updated.title}"`,
          cancelled: `Reunión cancelada: "${updated.title}"`,
          scheduled: `Reunión reagendada: "${updated.title}"`,
        };
        logActivity(updated.contactId, activityType, descriptions[status] || `Estado de reunión: ${status}`);
      }

      res.json(updated);
    } catch (err: any) {
      log(`Error updating appointment status: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando estado de cita" });
    }
  });

  // Schedule a follow-up call for an existing contact
  app.post("/api/admin/contacts/:contactId/schedule-followup", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const contactId = req.params.contactId as string;
      const { date, time, duration, notes } = req.body;

      if (!date || !time) return res.status(400).json({ error: "date y time son requeridos" });

      // Validate contact exists
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

      // Get diagnostic data for email context
      const [diagnostic] = contact.diagnosticId
        ? await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1)
        : [undefined];

      const empresa = diagnostic?.empresa || contact.empresa;
      const participante = diagnostic?.participante || contact.nombre;
      const baseUrl = process.env.BASE_URL || "https://im3systems.com";

      // Cancel any existing pending follow-up for this contact
      const existingFollowups = await db.select().from(appointments)
        .where(and(
          eq(appointments.contactId, contactId),
          eq(appointments.appointmentType, "follow_up"),
          eq(appointments.status, "scheduled")
        ));

      for (const oldFollowup of existingFollowups) {
        // Delete old calendar event
        if (oldFollowup.googleCalendarEventId) {
          deleteCalendarEvent(oldFollowup.googleCalendarEventId).catch(err =>
            log(`Error deleting old follow-up calendar event: ${err}`)
          );
        }
        // Mark as cancelled
        await db.update(appointments)
          .set({ status: "cancelled" })
          .where(eq(appointments.id, oldFollowup.id));
      }

      // Cancel pending reminder emails for old follow-ups
      const reminderTemplateNames = ["prep_agenda", "recordatorio_6h", "micro_recordatorio"];
      const reminderTemplates = await db.select().from(emailTemplates)
        .where(and(eq(emailTemplates.isActive, true)));
      const reminderTemplateIds = reminderTemplates
        .filter(t => reminderTemplateNames.includes(t.nombre))
        .map(t => t.id);

      if (reminderTemplateIds.length > 0 && existingFollowups.length > 0) {
        for (const templateId of reminderTemplateIds) {
          await db.update(sentEmails)
            .set({ status: "cancelled" })
            .where(and(
              eq(sentEmails.contactId, contactId),
              eq(sentEmails.templateId, templateId),
              eq(sentEmails.status, "pending")
            ));
        }
      }

      // Create Google Calendar event
      let meetLink: string | null = null;
      let eventId: string | null = null;
      try {
        const calResult = await createCalendarEvent({
          diagnosticId: `followup-${contactId}-${Date.now()}`,
          empresa: `Seguimiento — ${empresa}`,
          participante,
          email: contact.email,
          fechaCita: date,
          horaCita: time,
          rescheduleUrl: `${baseUrl}/api/reschedule/${contactId}`,
          cancelUrl: `${baseUrl}/api/cancel/${contactId}`,
        });
        if (calResult) {
          meetLink = calResult.meetLink;
          eventId = calResult.eventId;
        }
      } catch (err) {
        log(`Calendar event creation failed for follow-up: ${err}`);
      }

      // Build calendar add URL
      const calendarAddUrl = buildGoogleCalendarUrl(
        `Seguimiento — ${empresa}`, date, time, meetLink
      );

      // Insert appointment
      const [appt] = await db.insert(appointments).values({
        contactId,
        title: `Seguimiento — ${empresa}`,
        date,
        time,
        duration: duration || 45,
        notes: notes || null,
        meetLink,
        googleCalendarEventId: eventId,
        appointmentType: "follow_up",
      }).returning();

      // Update contact status to scheduled
      await db.update(contacts)
        .set({ status: "scheduled", substatus: "interested" })
        .where(eq(contacts.id, contactId));

      // Send confirmation email to client
      const confirmEmail = buildFollowUpConfirmationEmail(
        participante, empresa, date, time, meetLink, contactId, calendarAddUrl, contact.idioma || "es"
      );

      if (isEmailConfigured()) {
        sendEmail(contact.email, confirmEmail.subject, confirmEmail.body)
          .then(() => log(`Follow-up confirmation email sent to ${contact.email}`))
          .catch(err => log(`Error sending follow-up confirmation: ${err}`));
      }

      // Schedule reminder emails for the follow-up
      const appointmentDate = parseFechaCita(date, time);
      const now = new Date();
      const hoursUntilCall = Math.max(0, (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60));

      let emailsScheduled = 0;
      for (const templateName of reminderTemplateNames) {
        const template = reminderTemplates.find(t => t.nombre === templateName);
        if (!template) continue;

        const scheduledFor = calculateEmailTime(templateName, now, appointmentDate, hoursUntilCall);
        if (!scheduledFor) continue;

        let subject: string | null = null;
        let body: string | null = null;
        try {
          const cLang = contact.idioma || "es";
          if (templateName === "micro_recordatorio") {
            const r = buildMicroReminderEmail(participante, time, meetLink, contactId, cLang);
            subject = r.subject;
            body = r.body;
          } else if (templateName === "recordatorio_6h") {
            const r = build6hReminderEmail(participante, time, meetLink, contactId, calendarAddUrl, cLang);
            subject = r.subject;
            body = r.body;
          } else if (templateName === "prep_agenda") {
            // Use diagnostic data for AI-generated prep email
            const diagForAI = diagnostic ? { ...diagnostic } : { empresa, participante, email: contact.email } as any;
            diagForAI.fechaCita = date;
            diagForAI.horaCita = time;
            diagForAI.meetLink = meetLink;
            (diagForAI as any)._calendarAddUrl = calendarAddUrl;
            const r = await generateEmailContent(template, diagForAI, contactId, cLang);
            subject = r.subject;
            body = r.body;
          }
        } catch (err) {
          log(`Pre-gen failed for follow-up ${templateName}: ${err}`);
        }

        await db.insert(sentEmails).values({
          contactId,
          templateId: template.id,
          scheduledFor,
          subject,
          body,
        });
        emailsScheduled++;
      }

      // Log activity
      logActivity(contactId, "followup_scheduled", `Seguimiento agendado: ${date} a las ${time}`, {
        appointmentId: appt.id,
        meetLink,
      });

      // Create notification
      await db.insert(notifications).values({
        type: "new_lead",
        title: `Seguimiento agendado: ${participante}`,
        description: `${empresa} — ${date} a las ${time}`,
        contactId,
      }).catch(() => {});

      // Boost lead score
      const currentScore = contact.leadScore || 0;
      const newScore = Math.min(100, currentScore + 15);
      await db.update(contacts)
        .set({ leadScore: newScore })
        .where(eq(contacts.id, contactId));

      res.json({ appointment: appt, meetLink, emailsScheduled });
    } catch (err: any) {
      log(`Error scheduling follow-up: ${err?.message}`);
      res.status(500).json({ error: "Error agendando seguimiento" });
    }
  });

  // Get follow-up appointment for a contact
  app.get("/api/admin/contacts/:contactId/followup", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const followups = await db.select().from(appointments)
        .where(and(
          eq(appointments.contactId, req.params.contactId as string),
          eq(appointments.appointmentType, "follow_up"),
          eq(appointments.status, "scheduled")
        ))
        .limit(1);

      res.json(followups[0] || null);
    } catch (err: any) {
      log(`Error fetching follow-up: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo seguimiento" });
    }
  });

  // Mark diagnostic meeting as completed or no-show
  app.patch("/api/admin/diagnostics/:id/meeting-status", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });

    try {
      const { status } = req.body;
      if (!["completed", "no_show", "cancelled", "scheduled"].includes(status)) {
        return res.status(400).json({ error: "Estado inválido" });
      }

      const updates: any = { meetingStatus: status };
      if (status === "completed") {
        updates.meetingCompletedAt = new Date();
      } else {
        updates.meetingCompletedAt = null;
      }

      const [updated] = await db.update(diagnostics)
        .set(updates)
        .where(eq(diagnostics.id, req.params.id as string))
        .returning();

      if (!updated) return res.status(404).json({ error: "Diagnóstico no encontrado" });

      // Find contact by diagnostic and log activity
      const [contact] = await db.select().from(contacts).where(eq(contacts.diagnosticId, updated.id)).limit(1);
      if (contact) {
        const activityType = status === "completed" ? "meeting_completed" : status === "no_show" ? "meeting_no_show" : `meeting_${status}`;
        const descriptions: Record<string, string> = {
          completed: `Reunión de diagnóstico completada — ${updated.empresa}`,
          no_show: `No se presentó a reunión de diagnóstico — ${updated.empresa}`,
          cancelled: `Reunión de diagnóstico cancelada — ${updated.empresa}`,
          scheduled: `Reunión de diagnóstico reagendada — ${updated.empresa}`,
        };
        logActivity(contact.id, activityType, descriptions[status] || `Estado de reunión: ${status}`);

        // Post-meeting automations based on status
        if (status === "completed") {
          // 1. Schedule seguimiento_post email for 5h from now
          try {
            const [postTemplate] = await db.select().from(emailTemplates)
              .where(eq(emailTemplates.nombre, "seguimiento_post")).limit(1);

            if (postTemplate) {
              const sendAt = new Date(Date.now() + 5 * 60 * 60 * 1000);
              await db.insert(sentEmails).values({
                contactId: contact.id,
                templateId: postTemplate.id,
                scheduledFor: sendAt,
                status: "pending",
              });
              log(`Seguimiento post-reunión programado para ${sendAt.toISOString()} — ${updated.empresa}`);
            }
          } catch (err) {
            log(`Error scheduling seguimiento_post: ${err}`);
          }

          // 2. Update contact status to "converted"
          await db.update(contacts)
            .set({ status: "converted" })
            .where(eq(contacts.id, contact.id));

          // 3. Create notification
          await db.insert(notifications).values({
            type: "deal_stage_changed",
            title: `Reunión completada — ${updated.empresa}`,
            description: `La reunión con ${updated.participante} de ${updated.empresa} fue completada. Preparar propuesta.`,
            contactId: contact.id,
          }).catch(() => {});

          // 4. Create follow-up task (send proposal within 48h)
          await db.insert(tasks).values({
            contactId: contact.id,
            title: `Enviar propuesta a ${updated.empresa}`,
            description: `Reunión completada. Preparar y enviar propuesta basada en el diagnóstico.`,
            priority: "high",
            dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
          }).catch(() => {});

        } else if (status === "no_show") {
          // 1. Cancel any pending pre-meeting emails
          await db.update(sentEmails)
            .set({ status: "cancelled" })
            .where(and(eq(sentEmails.contactId, contact.id), eq(sentEmails.status, "pending")));

          // 2. Schedule no-show email (send in 2 hours — empathetic, invite to reschedule)
          try {
            const [postTemplate] = await db.select().from(emailTemplates)
              .where(eq(emailTemplates.nombre, "seguimiento_post")).limit(1);

            if (postTemplate) {
              const { subject, body } = buildNoShowEmail(
                updated.participante, updated.empresa, contact.id, contact.idioma || "es"
              );
              const sendAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
              await db.insert(sentEmails).values({
                contactId: contact.id,
                templateId: postTemplate.id,
                subject,
                body,
                scheduledFor: sendAt,
                status: "pending",
              });
              log(`Email no-show programado para ${sendAt.toISOString()} — ${updated.empresa}`);
            }
          } catch (err) {
            log(`Error scheduling no-show email: ${err}`);
          }

          // 3. Create task to try rescheduling
          await db.insert(tasks).values({
            contactId: contact.id,
            title: `Intentar reagendar con ${updated.empresa}`,
            description: `${updated.participante} no se presentó a la reunión. Contactar para reagendar.`,
            priority: "high",
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }).catch(() => {});
        }
      }

      res.json(updated);
    } catch (err: any) {
      log(`Error updating diagnostic meeting status: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando estado de reunión" });
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
      const { title, slug, excerpt, content, categoryId, tags, references, featuredImageUrl, authorName, status, language, metaTitle, metaDescription, readTimeMinutes } = req.body;
      if (!title || !slug || !excerpt || !content) return res.status(400).json({ error: "title, slug, excerpt y content son requeridos" });

      const [post] = await db.insert(blogPosts).values({
        title, slug, excerpt, content,
        categoryId: categoryId || null,
        tags: tags || [],
        references: references || [],
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
      const fields = ["title", "slug", "excerpt", "content", "categoryId", "tags", "references", "featuredImageUrl", "authorName", "status", "language", "metaTitle", "metaDescription", "readTimeMinutes"];
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
          <h2 style="color:#0F172A">Te has dado de baja</h2>
          <p>No recibirás más emails de esta secuencia.</p>
          <p style="color:#999;font-size:14px">— Equipo IM3 Systems</p>
        </body>
      </html>`);
    } catch (err) {
      log(`Error unsubscribe: ${err}`);
      res.status(500).send("<html><body><h2>Error procesando solicitud.</h2></body></html>");
    }
  });

  // Reschedule — redirect to dedicated reschedule page (no need to redo full form)
  app.get("/api/reschedule/:contactId", async (req, res) => {
    const { contactId } = req.params;
    if (db) {
      try {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
        if (contact) {
          logActivity(contactId, "status_changed", "Contacto solicitó reagendar desde email");
        }
      } catch (err) {
        log(`Error processing reschedule: ${err}`);
      }
    }
    res.redirect(`${process.env.BASE_URL || "https://im3systems.com"}/reschedule/${contactId}`);
  });

  // Get current booking info for reschedule page
  app.get("/api/reschedule-info/:contactId", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const { contactId } = req.params;

    try {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

      let diagnostic = null;
      if (contact.diagnosticId) {
        const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
        diagnostic = diag || null;
      }

      res.json({
        contactId: contact.id,
        nombre: contact.nombre,
        empresa: contact.empresa,
        email: contact.email,
        fechaCita: diagnostic?.fechaCita || null,
        horaCita: diagnostic?.horaCita || null,
        meetingStatus: diagnostic?.meetingStatus || null,
      });
    } catch (err) {
      log(`Error fetching reschedule info: ${err}`);
      res.status(500).json({ error: "Error interno" });
    }
  });

  // Process reschedule — update date/time, create new calendar event, reschedule emails
  app.post("/api/reschedule/:contactId", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const { contactId } = req.params;
    const { fechaCita, horaCita } = req.body;

    if (!fechaCita || !horaCita) {
      return res.status(400).json({ error: "fechaCita y horaCita son requeridos" });
    }

    try {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });
      if (!contact.diagnosticId) return res.status(400).json({ error: "No hay diagnóstico asociado" });

      const [diag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
      if (!diag) return res.status(404).json({ error: "Diagnóstico no encontrado" });

      // Block rescheduling if meeting already completed
      if (diag.meetingStatus === "completed") {
        return res.status(400).json({ error: "Esta reunión ya fue completada. No se puede reagendar." });
      }

      // 1. Delete old Google Calendar event
      if (diag.googleCalendarEventId) {
        await deleteCalendarEvent(diag.googleCalendarEventId).catch((err) =>
          log(`Error deleting old calendar event on reschedule: ${err}`)
        );
      }

      // 2. Cancel pending emails and WhatsApp
      await db.update(sentEmails)
        .set({ status: "cancelled" })
        .where(and(eq(sentEmails.contactId, contactId), eq(sentEmails.status, "pending")));

      await db.update(whatsappMessages)
        .set({ status: "cancelled" })
        .where(and(eq(whatsappMessages.contactId, contactId), eq(whatsappMessages.status, "pending")));

      // 3. Create new Google Calendar event
      const baseUrl = process.env.BASE_URL || "https://im3systems.com";
      const calResult = await createCalendarEvent({
        diagnosticId: `resched-${contact.diagnosticId}-${Date.now()}`,
        empresa: diag.empresa,
        participante: diag.participante,
        email: diag.email,
        fechaCita,
        horaCita,
        rescheduleUrl: `${baseUrl}/api/reschedule/${contactId}`,
        cancelUrl: `${baseUrl}/api/cancel/${contactId}`,
      });

      const newMeetLink = calResult?.meetLink || null;
      const newEventId = calResult?.eventId || null;

      // 4. Update diagnostic with new date, time, meet link, event ID
      await db.update(diagnostics).set({
        fechaCita,
        horaCita,
        meetLink: newMeetLink,
        googleCalendarEventId: newEventId,
        meetingStatus: "scheduled",
      }).where(eq(diagnostics.id, contact.diagnosticId));

      // 5. Update contact status back to scheduled
      await db.update(contacts)
        .set({ status: "scheduled" })
        .where(eq(contacts.id, contactId));

      logActivity(contactId, "status_changed", `Reunión reagendada: ${fechaCita} a las ${horaCita}`);

      // Notify admin about reschedule
      const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
      sendEmail(
        adminEmail,
        `🔄 Reunión reagendada: ${diag.participante} de ${diag.empresa}`,
        `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
          <div style="background:#F59E0B;padding:20px 28px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:18px;margin:0">🔄 Reunión Reagendada</h1>
          </div>
          <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
            <p style="font-size:15px;color:#333;margin:0 0 16px"><strong>${diag.participante}</strong> de <strong>${diag.empresa}</strong> reagendó su sesión de diagnóstico.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#666;width:140px">Nueva fecha</td><td style="padding:6px 0;font-weight:600">${fechaCita}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Nueva hora</td><td style="padding:6px 0;font-weight:600">${horaCita}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${diag.email}</td></tr>
              ${diag.telefono ? `<tr><td style="padding:6px 0;color:#666">Teléfono</td><td style="padding:6px 0">${diag.telefono}</td></tr>` : ""}
              <tr><td style="padding:6px 0;color:#666">Industria</td><td style="padding:6px 0">${diag.industria || "—"}</td></tr>
              ${newMeetLink ? `<tr><td style="padding:6px 0;color:#666">Meet</td><td style="padding:6px 0"><a href="${newMeetLink}" style="color:#3B82F6">${newMeetLink}</a></td></tr>` : ""}
            </table>
            <div style="margin-top:20px">
              <a href="${baseUrl}/admin/contacts/${contactId}" style="display:inline-block;background:#3B82F6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">Ver en CRM →</a>
            </div>
          </div>
        </div>`
      ).catch((err) => log(`Error sending reschedule admin notification: ${err}`));

      // 6. Re-schedule email sequence with new date
      try {
        const templates = await db.select().from(emailTemplates)
          .where(eq(emailTemplates.isActive, true))
          .orderBy(asc(emailTemplates.sequenceOrder));

        const [updatedDiag] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
        const appointmentDate = parseFechaCita(fechaCita, horaCita);
        const now = new Date();
        const hoursUntilCall = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Enrich diagnostic for AI emails
        if (updatedDiag) {
          (updatedDiag as any)._calendarAddUrl = buildGoogleCalendarUrl(
            diag.empresa, fechaCita, horaCita, newMeetLink
          );
          (updatedDiag as any)._rescheduleUrl = `${baseUrl}/api/reschedule/${contactId}`;
          (updatedDiag as any)._cancelUrl = `${baseUrl}/api/cancel/${contactId}`;
          if ((contact.tags as string[] || []).includes("newsletter")) {
            (updatedDiag as any)._isReturningContact = true;
          }
        }

        for (const template of templates) {
          const sendAt = calculateEmailTime(template.nombre, now, appointmentDate, hoursUntilCall);
          if (!sendAt) continue;

          // Pre-generate fixed templates
          let preGenSubject: string | null = null;
          let preGenBody: string | null = null;

          if (template.nombre === "confirmacion") {
            // Send confirmation immediately via AI
            try {
              const rLang = contact.idioma || "es";
              const { subject, body } = await generateEmailContent(template, updatedDiag, contactId, rLang);
              preGenSubject = subject;
              preGenBody = body;
              await sendEmail(diag.email, subject, body);
              await db.insert(sentEmails).values({
                contactId,
                templateId: template.id,
                subject,
                body,
                scheduledFor: new Date(),
                status: "sent",
                sentAt: new Date(),
              });
              logActivity(contactId, "email_sent", `Email de confirmación de reagendamiento enviado`);
              continue;
            } catch (err) {
              log(`Error sending reschedule confirmation email: ${err}`);
            }
          } else if (template.nombre === "recordatorio_6h") {
            const rLang = contact.idioma || "es";
            const result = build6hReminderEmail(
              diag.participante, horaCita,
              updatedDiag?.meetLink || null, contactId,
              (updatedDiag as any)?._calendarAddUrl, rLang
            );
            preGenSubject = result.subject;
            preGenBody = result.body;
          } else if (template.nombre === "micro_recordatorio") {
            const rLang = contact.idioma || "es";
            const result = buildMicroReminderEmail(
              diag.participante, horaCita,
              updatedDiag?.meetLink || null, contactId, rLang
            );
            preGenSubject = result.subject;
            preGenBody = result.body;
          }

          await db.insert(sentEmails).values({
            contactId,
            templateId: template.id,
            subject: preGenSubject,
            body: preGenBody,
            scheduledFor: sendAt,
            status: "pending",
          });
        }
      } catch (err) {
        log(`Error re-scheduling emails after reschedule: ${err}`);
      }

      // 7. Build calendar add URL for response
      const calendarAddUrl = buildGoogleCalendarUrl(diag.empresa, fechaCita, horaCita, newMeetLink);

      res.json({
        success: true,
        meetLink: newMeetLink,
        calendarAddUrl,
        fechaCita,
        horaCita,
      });
    } catch (err) {
      log(`Error processing reschedule: ${err}`);
      res.status(500).json({ error: "Error procesando reagendamiento" });
    }
  });

  // Cancel meeting (does NOT opt out — only cancels this meeting's pending emails/WhatsApp/Calendar)
  app.get("/api/cancel/:contactId", async (req, res) => {
    const { contactId } = req.params;
    const baseUrl = process.env.BASE_URL || "https://im3systems.com";
    let contactName = "";

    if (db) {
      try {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
        if (contact) {
          contactName = contact.nombre;
          logActivity(contactId, "status_changed", "Contacto canceló la reunión desde email");

          // Notify admin about cancellation
          const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
          const adminBaseUrl = process.env.BASE_URL || "https://im3systems.com";
          // Get diagnostic info for notification
          let diagInfo: any = null;
          if (contact.diagnosticId) {
            const [d] = await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1);
            diagInfo = d;
          }
          sendEmail(
            adminEmail,
            `❌ Reunión cancelada: ${contact.nombre} de ${contact.empresa}`,
            `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
              <div style="background:#EF4444;padding:20px 28px;border-radius:8px 8px 0 0">
                <h1 style="color:#fff;font-size:18px;margin:0">❌ Reunión Cancelada</h1>
              </div>
              <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                <p style="font-size:15px;color:#333;margin:0 0 16px"><strong>${contact.nombre}</strong> de <strong>${contact.empresa}</strong> canceló su sesión de diagnóstico.</p>
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                  <tr><td style="padding:6px 0;color:#666;width:140px">Email</td><td style="padding:6px 0">${contact.email}</td></tr>
                  ${contact.telefono ? `<tr><td style="padding:6px 0;color:#666">Teléfono</td><td style="padding:6px 0">${contact.telefono}</td></tr>` : ""}
                  ${diagInfo?.fechaCita ? `<tr><td style="padding:6px 0;color:#666">Cita era</td><td style="padding:6px 0">${diagInfo.fechaCita} a las ${diagInfo.horaCita || ""}</td></tr>` : ""}
                  ${diagInfo?.industria ? `<tr><td style="padding:6px 0;color:#666">Industria</td><td style="padding:6px 0">${diagInfo.industria}</td></tr>` : ""}
                </table>
                <p style="font-size:13px;color:#666;margin:16px 0 0">Se cancelaron los emails y eventos de calendario pendientes. El contacto vuelve a estado "lead".</p>
                <div style="margin-top:20px">
                  <a href="${adminBaseUrl}/admin/contacts/${contactId}" style="display:inline-block;background:#3B82F6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">Ver en CRM →</a>
                </div>
              </div>
            </div>`
          ).catch((err) => log(`Error sending cancel admin notification: ${err}`));

          if (contact.diagnosticId) {
            // Get diagnostic to find calendar event ID
            const [diag] = await db.select().from(diagnostics)
              .where(eq(diagnostics.id, contact.diagnosticId)).limit(1);

            // Cancel diagnostic meeting status
            await db.update(diagnostics)
              .set({ meetingStatus: "cancelled" })
              .where(eq(diagnostics.id, contact.diagnosticId));

            // Delete Google Calendar event
            if (diag?.googleCalendarEventId) {
              deleteCalendarEvent(diag.googleCalendarEventId).catch((err) =>
                log(`Error deleting calendar event on cancel: ${err}`)
              );
            }
          }

          // Cancel pending emails for this contact (not opt-out — just this sequence)
          await db.update(sentEmails)
            .set({ status: "cancelled" })
            .where(and(eq(sentEmails.contactId, contactId), eq(sentEmails.status, "pending")));

          // Cancel pending WhatsApp messages
          await db.update(whatsappMessages)
            .set({ status: "cancelled" })
            .where(and(eq(whatsappMessages.contactId, contactId), eq(whatsappMessages.status, "pending")));

          // Return contact to lead status (they can still be contacted in the future)
          await db.update(contacts)
            .set({ status: "lead" })
            .where(eq(contacts.id, contactId));
        }
      } catch (err) {
        log(`Error processing cancellation: ${err}`);
      }
    }

    res.send(`<html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font-family:'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f8fafc}</style></head>
      <body>
        <div style="max-width:500px;margin:60px auto;text-align:center;padding:0 20px">
          <div style="background:linear-gradient(135deg,#0F172A,#1E293B);padding:20px 28px;border-radius:12px 12px 0 0">
            <h1 style="color:#fff;font-size:18px;margin:0">IM3 Systems</h1>
          </div>
          <div style="background:#fff;padding:32px 28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <div style="width:56px;height:56px;background:#FEF3C7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:24px">✓</div>
            <h2 style="color:#0F172A;margin:0 0 12px;font-size:20px">Reunión cancelada</h2>
            <p style="color:#64748B;font-size:15px;margin:0 0 8px">${contactName ? `${contactName}, tu` : "Tu"} sesión de diagnóstico ha sido cancelada correctamente.</p>
            <p style="color:#64748B;font-size:15px;margin:0 0 24px">Hemos eliminado el evento de tu calendario y cancelado los recordatorios pendientes.</p>
            <p style="color:#475569;font-size:14px;margin:0 0 20px">Si cambias de opinión, siempre puedes reagendar una nueva sesión. Tu información está guardada.</p>
            <a href="${baseUrl}/reschedule/${contactId}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Reagendar nueva sesión →</a>
            <p style="color:#94A3B8;font-size:13px;margin-top:24px">— Equipo IM3 Systems</p>
          </div>
        </div>
      </body>
    </html>`);
  });

  // ─────────────────────────────────────────────────────────────
  // Portal del Cliente — Seed demo data
  // ─────────────────────────────────────────────────────────────

  // Seed P2F project
  app.post("/api/admin/projects/seed-p2f", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      // Check if P2F already exists
      const existing = await db.select().from(clientProjects).where(eq(clientProjects.name, "Portal P2F — Passport2Fluency")).limit(1);
      if (existing.length > 0) return res.json({ message: "Proyecto P2F ya existe", projectId: existing[0].id, portalToken: existing[0].accessToken });

      // Create contact
      let contactId: string;
      const [existingContact] = await db.select().from(contacts).where(eq(contacts.email, "info@passport2fluency.com")).limit(1);
      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const [c] = await db.insert(contacts).values({ nombre: "Sebastián Garzón", empresa: "P2F Passport2Fluency", email: "info@passport2fluency.com", status: "converted", leadScore: 100 }).returning();
        contactId = c.id;
      }

      // Create project
      const [project] = await db.insert(clientProjects).values({
        contactId, name: "Portal P2F — Passport2Fluency",
        description: "Plataforma SaaS de aprendizaje de idiomas con tutores en vivo, práctica con IA (Lingo), gamificación, pagos Stripe, Google Meet y CRM integrado.",
        status: "in_progress", startDate: new Date("2025-10-01"), estimatedEndDate: new Date("2026-06-30"),
        totalBudget: 7500, currency: "USD", healthStatus: "on_track",
        healthNote: "Proyecto en fase de corrección y pulido. 7 de 10 fases completadas.",
      }).returning();

      const phases = [
        { phase: { name: "Arquitectura y Base", description: "Auth, DB, roles, deploy", status: "completed", estimatedHours: 60, startDate: new Date("2025-10-01"), endDate: new Date("2025-11-15") },
          tasks: [
            { title: "Auth local + Google + Microsoft OAuth", status: "completed", priority: "high", clientFacingTitle: "Sistema de login seguro" },
            { title: "PostgreSQL + Drizzle ORM (26+ tablas)", status: "completed", priority: "high", clientFacingTitle: "Base de datos completa" },
            { title: "Estructura 3 roles (estudiante, tutor, admin)", status: "completed", priority: "high", clientFacingTitle: "Sistema de roles y permisos" },
            { title: "Deploy en Railway + middleware rutas", status: "completed", priority: "high", clientFacingTitle: "Servidor en producción" },
          ]},
        { phase: { name: "Portal del Estudiante", description: "Dashboard, tutores, clases, mensajes, soporte", status: "completed", estimatedHours: 120, startDate: new Date("2026-01-10"), endDate: new Date("2026-02-10") },
          tasks: [
            { title: "Dashboard con clases y progreso", status: "completed", priority: "high", clientFacingTitle: "Panel principal del estudiante" },
            { title: "Catálogo de tutores con filtros", status: "completed", priority: "high", clientFacingTitle: "Búsqueda de tutores" },
            { title: "Reserva de clases con calendario", status: "completed", priority: "high", clientFacingTitle: "Agendamiento de clases" },
            { title: "Perfil, configuración y mensajes", status: "completed", priority: "medium", clientFacingTitle: "Perfil y chat con tutores" },
            { title: "Soporte (tickets) + guía", status: "completed", priority: "medium", clientFacingTitle: "Centro de ayuda" },
          ]},
        { phase: { name: "Portal del Tutor", description: "Calendario, materiales, pagos, IA, invitaciones", status: "completed", estimatedHours: 100, startDate: new Date("2026-02-10"), endDate: new Date("2026-03-01") },
          tasks: [
            { title: "Dashboard + calendario visual", status: "completed", priority: "high", clientFacingTitle: "Panel del tutor" },
            { title: "Disponibilidad semanal + excepciones", status: "completed", priority: "high", clientFacingTitle: "Gestión de horarios" },
            { title: "Notas, tareas y biblioteca de materiales", status: "completed", priority: "medium", clientFacingTitle: "Materiales didácticos" },
            { title: "Pagos, liquidaciones y métricas", status: "completed", priority: "high", clientFacingTitle: "Pagos del tutor" },
            { title: "Asistente IA + sistema de invitación", status: "completed", priority: "medium", clientFacingTitle: "IA para clases e invitaciones" },
          ]},
        { phase: { name: "Inteligencia Artificial", description: "Partner Lingo, correcciones, vocabulario, memoria", status: "completed", estimatedHours: 80, startDate: new Date("2026-02-15"), endDate: new Date("2026-03-05") },
          tasks: [
            { title: "Partner de práctica Lingo (Claude)", status: "completed", priority: "high", clientFacingTitle: "Compañero de práctica IA" },
            { title: "Correcciones gramaticales en tiempo real", status: "completed", priority: "high", clientFacingTitle: "Correcciones automáticas" },
            { title: "Vocabulario + memoria contextual", status: "completed", priority: "medium", clientFacingTitle: "Seguimiento inteligente" },
          ]},
        { phase: { name: "Gamificación y Learning Path", description: "Camino A1→B2, XP, rachas, logros", status: "completed", estimatedHours: 60, startDate: new Date("2026-03-01"), endDate: new Date("2026-03-10") },
          tasks: [
            { title: "Snake path visual (A1→B2)", status: "completed", priority: "high", clientFacingTitle: "Camino de aprendizaje" },
            { title: "XP, rachas y logros", status: "completed", priority: "medium", clientFacingTitle: "Puntos y logros" },
            { title: "Quizzes, flashcards, speaking", status: "completed", priority: "medium", clientFacingTitle: "Ejercicios interactivos" },
          ]},
        { phase: { name: "Pagos y Suscripciones", description: "Stripe: 3 planes + paquetes + webhooks", status: "completed", estimatedHours: 50, startDate: new Date("2026-02-20"), endDate: new Date("2026-03-08") },
          tasks: [
            { title: "Stripe suscripciones + paquetes", status: "completed", priority: "high", clientFacingTitle: "Pasarela de pagos" },
            { title: "3 planes ($119/$219/$299) + à-la-carte", status: "completed", priority: "high", clientFacingTitle: "Planes y paquetes" },
            { title: "Webhooks ciclo de vida", status: "completed", priority: "high", clientFacingTitle: "Automatización de cobros" },
          ]},
        { phase: { name: "Integraciones Externas", description: "Meet, Calendar, High Level, Resend, Reviews", status: "completed", estimatedHours: 70, startDate: new Date("2026-02-25"), endDate: new Date("2026-03-15") },
          tasks: [
            { title: "Google Meet + Calendar", status: "completed", priority: "high", clientFacingTitle: "Videollamadas y calendario" },
            { title: "High Level CRM sync", status: "completed", priority: "medium", clientFacingTitle: "Integración CRM" },
            { title: "Resend emails + reviews", status: "completed", priority: "medium", clientFacingTitle: "Emails y calificaciones" },
          ]},
        { phase: { name: "Corrección y Pulido", description: "Bugs, pagos, UX, testing, performance", status: "in_progress", estimatedHours: 40, startDate: new Date("2026-03-15"), endDate: new Date("2026-04-15") },
          tasks: [
            { title: "Corregir errores portales estudiante/tutor", status: "in_progress", priority: "high", clientFacingTitle: "Correcciones de portales" },
            { title: "Corregir pasarelas de pago", status: "in_progress", priority: "high", clientFacingTitle: "Ajustes en pagos" },
            { title: "Pulir UX/UI general", status: "pending", priority: "medium", clientFacingTitle: "Mejoras visuales" },
            { title: "Testing end-to-end", status: "pending", priority: "high", clientFacingTitle: "Pruebas completas" },
            { title: "Optimización de rendimiento", status: "pending", priority: "medium", clientFacingTitle: "Mejorar velocidad" },
          ]},
        { phase: { name: "Mejoras de IA y Personalización", description: "Paquetes personalizados, más IA", status: "pending", estimatedHours: 50, startDate: new Date("2026-04-15"), endDate: new Date("2026-05-15") },
          tasks: [
            { title: "Paquetes personalizados por perfil", status: "pending", priority: "high", clientFacingTitle: "Paquetes a la medida", isMilestone: true },
            { title: "Mejoras learning path + más IA", status: "pending", priority: "medium", clientFacingTitle: "Experiencia más inteligente" },
          ]},
        { phase: { name: "Migración y Go-Live", description: "Migrar desde High Level, pruebas, lanzamiento", status: "pending", estimatedHours: 30, startDate: new Date("2026-05-15"), endDate: new Date("2026-06-30") },
          tasks: [
            { title: "Migrar estudiantes y contactos", status: "pending", priority: "high", clientFacingTitle: "Migración de datos" },
            { title: "Pruebas con usuarios reales", status: "pending", priority: "high", clientFacingTitle: "Pruebas beta" },
            { title: "Go-live", status: "pending", priority: "high", clientFacingTitle: "Lanzamiento oficial", isMilestone: true },
          ]},
      ];

      for (let i = 0; i < phases.length; i++) {
        const { phase, tasks } = phases[i];
        const [ph] = await db.insert(projectPhases).values({ projectId: project.id, ...phase, orderIndex: i }).returning();
        for (const task of tasks) {
          await db.insert(projectTasks).values({ projectId: project.id, phaseId: ph.id, ...task, isMilestone: (task as any).isMilestone || false });
        }
      }

      await db.insert(projectMessages).values({
        projectId: project.id, senderType: "team", senderName: "Equipo IM3 Systems",
        content: "¡Bienvenido al portal de tu proyecto, Sebastián! Aquí puedes ver el avance en tiempo real de Passport2Fluency. Estamos en la fase de corrección y pulido — 7 de 10 fases completadas. Cualquier duda, escríbenos por aquí.",
      });

      res.json({ message: "Proyecto P2F creado", projectId: project.id, portalToken: project.accessToken });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Seed P2F hours + deliverables data
  app.post("/api/admin/projects/seed-p2f-data", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [project] = await db.select().from(clientProjects).where(eq(clientProjects.name, "Portal P2F — Passport2Fluency")).limit(1);
      if (!project) return res.status(404).json({ error: "Proyecto P2F no encontrado" });

      // Check if data already exists
      const existingLogs = await db.select({ id: projectTimeLog.id }).from(projectTimeLog).where(eq(projectTimeLog.projectId, project.id)).limit(1);
      if (existingLogs.length > 0) return res.json({ message: "Datos ya existen — seed omitido" });

      // Get phases
      const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, project.id)).orderBy(asc(projectPhases.orderIndex));

      // ── TIME LOGS ──
      const timeEntries: Array<{ description: string; hours: string; date: string; category: string }> = [
        // Fase 1: Arquitectura (60h) — oct-nov 2025
        { description: "Diseño de schema PostgreSQL (26 tablas)", hours: "12", date: "2025-10-08", category: "development" },
        { description: "Auth local + bcrypt + sesiones", hours: "8", date: "2025-10-12", category: "development" },
        { description: "Google OAuth integration", hours: "6", date: "2025-10-15", category: "development" },
        { description: "Microsoft OAuth integration", hours: "5", date: "2025-10-18", category: "development" },
        { description: "Middleware de roles y protección de rutas", hours: "6", date: "2025-10-22", category: "development" },
        { description: "Deploy Railway + CI/CD", hours: "4", date: "2025-10-25", category: "development" },
        { description: "Diseño de arquitectura y estructura", hours: "8", date: "2025-10-05", category: "planning" },
        { description: "Reunión kickoff con Sebastián", hours: "2", date: "2025-10-03", category: "meeting" },
        { description: "Wireframes iniciales", hours: "6", date: "2025-10-07", category: "design" },
        { description: "Configuración entorno desarrollo", hours: "3", date: "2025-10-04", category: "support" },
        // Fase 2: Estudiante (120h) — ene-feb 2026
        { description: "Dashboard principal estudiante", hours: "10", date: "2026-01-13", category: "development" },
        { description: "Catálogo de tutores + filtros", hours: "12", date: "2026-01-16", category: "development" },
        { description: "Sistema de reserva de clases", hours: "14", date: "2026-01-21", category: "development" },
        { description: "Calendario de reservas + disponibilidad", hours: "10", date: "2026-01-24", category: "development" },
        { description: "Perfil del estudiante + settings", hours: "6", date: "2026-01-28", category: "development" },
        { description: "Mensajes directos tutor-estudiante", hours: "10", date: "2026-01-31", category: "development" },
        { description: "WebSocket real-time messaging", hours: "8", date: "2026-02-03", category: "development" },
        { description: "Sistema de soporte (tickets)", hours: "8", date: "2026-02-05", category: "development" },
        { description: "Guía de aprendizaje", hours: "4", date: "2026-02-07", category: "development" },
        { description: "Diseño UI portal estudiante", hours: "14", date: "2026-01-10", category: "design" },
        { description: "Reunión review sprint 1", hours: "2", date: "2026-01-17", category: "meeting" },
        { description: "Reunión review sprint 2", hours: "2", date: "2026-01-31", category: "meeting" },
        { description: "Planeación sprint 1", hours: "4", date: "2026-01-10", category: "planning" },
        { description: "Planeación sprint 2", hours: "3", date: "2026-01-24", category: "planning" },
        { description: "QA y corrección de bugs sprint 1", hours: "6", date: "2026-01-23", category: "support" },
        { description: "Responsive mobile-first adjustments", hours: "7", date: "2026-02-06", category: "design" },
        // Fase 3: Tutor (100h) — feb-mar 2026
        { description: "Dashboard tutor + calendario visual", hours: "12", date: "2026-02-11", category: "development" },
        { description: "Gestión disponibilidad semanal", hours: "10", date: "2026-02-14", category: "development" },
        { description: "Excepciones de calendario", hours: "6", date: "2026-02-17", category: "development" },
        { description: "Notas de sesión y homework", hours: "8", date: "2026-02-19", category: "development" },
        { description: "Biblioteca de materiales", hours: "10", date: "2026-02-21", category: "development" },
        { description: "Sistema de pagos a tutores", hours: "12", date: "2026-02-25", category: "development" },
        { description: "Asistente IA para clases", hours: "8", date: "2026-02-27", category: "development" },
        { description: "Sistema de invitación de tutores", hours: "6", date: "2026-02-28", category: "development" },
        { description: "Diseño UI portal tutor", hours: "10", date: "2026-02-10", category: "design" },
        { description: "Reunión review portal tutor", hours: "2", date: "2026-02-20", category: "meeting" },
        { description: "Planeación fase tutor", hours: "4", date: "2026-02-10", category: "planning" },
        { description: "QA portal tutor", hours: "6", date: "2026-03-01", category: "support" },
        { description: "Métricas de rendimiento tutor", hours: "6", date: "2026-02-26", category: "development" },
        // Fase 4: IA (80h) — feb-mar 2026
        { description: "Integración Anthropic Claude API", hours: "10", date: "2026-02-16", category: "development" },
        { description: "Partner de práctica Lingo", hours: "14", date: "2026-02-20", category: "development" },
        { description: "Correcciones gramaticales real-time", hours: "12", date: "2026-02-24", category: "development" },
        { description: "Tracking de vocabulario", hours: "8", date: "2026-02-27", category: "development" },
        { description: "Perfiles con memoria contextual", hours: "10", date: "2026-03-01", category: "development" },
        { description: "Diseño UX conversación IA", hours: "8", date: "2026-02-15", category: "design" },
        { description: "Prompt engineering y testing", hours: "10", date: "2026-03-03", category: "development" },
        { description: "Reunión demo IA", hours: "2", date: "2026-03-04", category: "meeting" },
        { description: "Planeación módulo IA", hours: "4", date: "2026-02-15", category: "planning" },
        { description: "QA módulo IA", hours: "2", date: "2026-03-05", category: "support" },
        // Fase 5: Gamificación (60h) — mar 2026
        { description: "Learning path snake visualization", hours: "10", date: "2026-03-03", category: "development" },
        { description: "Sistema XP + rachas + logros", hours: "10", date: "2026-03-05", category: "development" },
        { description: "Quizzes por nivel", hours: "8", date: "2026-03-07", category: "development" },
        { description: "Flashcards interactivas", hours: "6", date: "2026-03-08", category: "development" },
        { description: "Speaking prompts + evaluación", hours: "6", date: "2026-03-09", category: "development" },
        { description: "Diseño gamificación y animaciones", hours: "8", date: "2026-03-02", category: "design" },
        { description: "Planeación learning path", hours: "4", date: "2026-03-01", category: "planning" },
        { description: "Reunión demo gamificación", hours: "1.5", date: "2026-03-10", category: "meeting" },
        { description: "Ajustes de performance animaciones", hours: "4", date: "2026-03-10", category: "support" },
        // Fase 6: Pagos (50h) — feb-mar 2026
        { description: "Integración Stripe Checkout", hours: "10", date: "2026-02-22", category: "development" },
        { description: "Suscripciones recurrentes", hours: "8", date: "2026-02-25", category: "development" },
        { description: "Paquetes à-la-carte", hours: "6", date: "2026-02-28", category: "development" },
        { description: "Stripe webhooks lifecycle", hours: "8", date: "2026-03-03", category: "development" },
        { description: "Checkout flow UX", hours: "6", date: "2026-02-21", category: "design" },
        { description: "Testing pagos sandbox", hours: "6", date: "2026-03-05", category: "support" },
        { description: "Planeación módulo pagos", hours: "3", date: "2026-02-20", category: "planning" },
        { description: "Reunión revisión pagos", hours: "1.5", date: "2026-03-06", category: "meeting" },
        // Fase 7: Integraciones (70h) — feb-mar 2026
        { description: "Google Meet API integration", hours: "10", date: "2026-02-26", category: "development" },
        { description: "Google Calendar sync", hours: "8", date: "2026-03-01", category: "development" },
        { description: "High Level CRM webhooks", hours: "10", date: "2026-03-05", category: "development" },
        { description: "High Level contactos + calendarios", hours: "8", date: "2026-03-08", category: "development" },
        { description: "Resend emails transaccionales", hours: "6", date: "2026-03-10", category: "development" },
        { description: "Sistema de reviews", hours: "8", date: "2026-03-12", category: "development" },
        { description: "Drip email campaigns", hours: "6", date: "2026-03-14", category: "development" },
        { description: "Reunión review integraciones", hours: "2", date: "2026-03-13", category: "meeting" },
        { description: "Planeación integraciones", hours: "4", date: "2026-02-25", category: "planning" },
        { description: "Testing integraciones end-to-end", hours: "6", date: "2026-03-15", category: "support" },
        // Fase 8: Corrección (20h parcial) — mar 2026
        { description: "Auditoría general de bugs", hours: "4", date: "2026-03-17", category: "support" },
        { description: "Fix bugs portal estudiante", hours: "6", date: "2026-03-19", category: "development" },
        { description: "Fix bugs portal tutor", hours: "4", date: "2026-03-21", category: "development" },
        { description: "Ajustes pasarela de pago", hours: "4", date: "2026-03-24", category: "development" },
        { description: "Reunión status correcciones", hours: "2", date: "2026-03-20", category: "meeting" },
      ];

      for (const entry of timeEntries) {
        await db.insert(projectTimeLog).values({ projectId: project.id, ...entry });
      }

      // ── DELIVERABLES ──
      const deliverables = [
        { title: "Infraestructura base desplegada", description: "Auth (local + Google + Microsoft), DB con 26 tablas, 3 roles, deploy en Railway", type: "other" as const, status: "approved", deliveredAt: new Date("2025-11-15"), approvedAt: new Date("2025-11-16"), phaseId: phases[0]?.id },
        { title: "Portal del estudiante funcional", description: "Dashboard, catálogo de tutores, reserva de clases, mensajes directos, soporte, guía de aprendizaje", type: "feature" as const, status: "approved", deliveredAt: new Date("2026-02-10"), approvedAt: new Date("2026-02-11"), phaseId: phases[1]?.id },
        { title: "Portal del tutor completo", description: "Calendario visual, disponibilidad, notas de sesión, biblioteca de materiales, pagos, asistente IA, invitaciones", type: "feature" as const, status: "approved", deliveredAt: new Date("2026-03-01"), approvedAt: new Date("2026-03-02"), phaseId: phases[2]?.id },
        { title: "Compañero de práctica Lingo", description: "Partner de conversación con IA (Claude), correcciones gramaticales en tiempo real, tracking de vocabulario, memoria contextual", type: "feature" as const, status: "approved", deliveredAt: new Date("2026-03-05"), approvedAt: new Date("2026-03-06"), phaseId: phases[3]?.id },
        { title: "Camino de aprendizaje gamificado", description: "Snake path visual A1→B2, sistema de XP y rachas, logros, quizzes, flashcards, speaking prompts", type: "feature" as const, status: "approved", deliveredAt: new Date("2026-03-10"), approvedAt: new Date("2026-03-11"), phaseId: phases[4]?.id },
        { title: "Sistema de pagos Stripe integrado", description: "3 planes de suscripción ($119/$219/$299), paquetes à-la-carte, webhooks para ciclo de vida automático", type: "feature" as const, status: "approved", deliveredAt: new Date("2026-03-08"), approvedAt: new Date("2026-03-09"), phaseId: phases[5]?.id },
        { title: "Integraciones externas configuradas", description: "Google Meet, Google Calendar, High Level CRM sync, Resend emails, sistema de reviews", type: "feature" as const, status: "approved", deliveredAt: new Date("2026-03-15"), approvedAt: new Date("2026-03-16"), phaseId: phases[6]?.id },
      ];

      for (const d of deliverables) {
        if (d.phaseId) {
          await db.insert(projectDeliverables).values({ projectId: project.id, ...d });
        }
      }

      res.json({ message: `Datos P2F poblados: ${timeEntries.length} registros de horas + ${deliverables.length} entregas` });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/admin/projects/seed", requireAuth, async (_req, res) => {
    try {
      const existing = await db!.select({ total: count() }).from(clientProjects);
      if (existing[0].total > 0) return res.json({ message: "Ya hay proyectos — seed omitido" });

      // Create demo project
      const [project] = await db!.insert(clientProjects).values({
        name: "App Log\u00edstica - TransCarga S.A.",
        description: "Sistema de gesti\u00f3n log\u00edstica con seguimiento de env\u00edos, flota y rutas. Incluye dashboard operativo, app m\u00f3vil para conductores y portal web para clientes.",
        status: "in_progress",
        startDate: new Date("2026-02-10"),
        estimatedEndDate: new Date("2026-05-15"),
        totalBudget: 12000,
        currency: "USD",
      }).returning();

      // Phases
      const phaseData = [
        { name: "Dise\u00f1o UX/UI", description: "Wireframes, mockups y prototipo interactivo", status: "completed", estimatedHours: 40 },
        { name: "Backend & Base de datos", description: "API REST, modelos, autenticaci\u00f3n y l\u00f3gica de negocio", status: "completed", estimatedHours: 80 },
        { name: "Frontend Web", description: "Dashboard operativo y portal de clientes", status: "in_progress", estimatedHours: 60 },
        { name: "App M\u00f3vil (Conductores)", description: "App React Native para conductores en ruta", status: "pending", estimatedHours: 50 },
      ];

      const phases = [];
      for (let i = 0; i < phaseData.length; i++) {
        const [ph] = await db!.insert(projectPhases).values({ projectId: project.id, ...phaseData[i], orderIndex: i }).returning();
        phases.push(ph);
      }

      // Tasks per phase
      const tasksData: Record<number, Array<{ title: string; status: string; priority: string }>> = {
        0: [
          { title: "Investigaci\u00f3n de usuarios y flujos", status: "completed", priority: "high" },
          { title: "Wireframes baja fidelidad", status: "completed", priority: "high" },
          { title: "Dise\u00f1o UI en Figma", status: "completed", priority: "high" },
          { title: "Prototipo interactivo", status: "completed", priority: "medium" },
        ],
        1: [
          { title: "Modelo de datos (PostgreSQL)", status: "completed", priority: "high" },
          { title: "API de env\u00edos (CRUD + tracking)", status: "completed", priority: "high" },
          { title: "API de flota y conductores", status: "completed", priority: "high" },
          { title: "Autenticaci\u00f3n JWT + roles", status: "completed", priority: "high" },
          { title: "Webhooks de notificaciones", status: "completed", priority: "medium" },
        ],
        2: [
          { title: "Dashboard principal con m\u00e9tricas", status: "completed", priority: "high" },
          { title: "M\u00f3dulo de env\u00edos (lista + detalle)", status: "in_progress", priority: "high" },
          { title: "Mapa de tracking en tiempo real", status: "in_progress", priority: "high" },
          { title: "Gesti\u00f3n de clientes", status: "pending", priority: "medium" },
          { title: "Reportes exportables (PDF/Excel)", status: "pending", priority: "low" },
        ],
        3: [
          { title: "Setup React Native + navegaci\u00f3n", status: "pending", priority: "high" },
          { title: "Login y selecci\u00f3n de ruta", status: "pending", priority: "high" },
          { title: "Checklist de entrega", status: "pending", priority: "medium" },
          { title: "Foto de evidencia + firma digital", status: "pending", priority: "medium" },
        ],
      };

      for (let i = 0; i < phases.length; i++) {
        for (const task of tasksData[i]) {
          await db!.insert(projectTasks).values({
            phaseId: phases[i].id,
            projectId: project.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            completedAt: task.status === "completed" ? new Date() : null,
          });
        }
      }

      // Deliverables
      const delivData = [
        { title: "Prototipo Figma completo", type: "design", status: "approved", deliveredAt: new Date("2026-02-24"), approvedAt: new Date("2026-02-25") },
        { title: "API v1 documentada", type: "document", status: "approved", deliveredAt: new Date("2026-03-10"), approvedAt: new Date("2026-03-11") },
        { title: "Dashboard operativo (v1)", type: "feature", status: "delivered", deliveredAt: new Date("2026-03-22"), approvedAt: null },
        { title: "M\u00f3dulo de tracking (beta)", type: "feature", status: "delivered", deliveredAt: new Date("2026-03-23"), approvedAt: null },
        { title: "Integraci\u00f3n con API de mapas", type: "feature", status: "rejected", deliveredAt: new Date("2026-03-15"), approvedAt: null, clientComment: "El mapa no carga en Safari, necesita fix" },
      ];

      for (const d of delivData) {
        await db!.insert(projectDeliverables).values({
          projectId: project.id,
          phaseId: phases[d.type === "design" ? 0 : 2].id,
          title: d.title,
          type: d.type,
          status: d.status,
          deliveredAt: d.deliveredAt,
          approvedAt: d.approvedAt,
          clientComment: (d as any).clientComment || null,
        });
      }

      // Time logs (last 4 weeks)
      const timeLogs = [
        { description: "Investigaci\u00f3n UX y benchmark", hours: "6", date: "2026-02-12", category: "design" },
        { description: "Wireframes p\u00e1ginas principales", hours: "8", date: "2026-02-14", category: "design" },
        { description: "Dise\u00f1o UI completo", hours: "12", date: "2026-02-18", category: "design" },
        { description: "Prototipo interactivo", hours: "5", date: "2026-02-21", category: "design" },
        { description: "Reuni\u00f3n kickoff con cliente", hours: "1.5", date: "2026-02-10", category: "meeting" },
        { description: "Modelo de datos y migraciones", hours: "8", date: "2026-02-25", category: "development" },
        { description: "API de env\u00edos CRUD", hours: "10", date: "2026-02-28", category: "development" },
        { description: "API de flota + auth JWT", hours: "12", date: "2026-03-04", category: "development" },
        { description: "Webhooks de notificaciones", hours: "4", date: "2026-03-06", category: "development" },
        { description: "Dashboard principal", hours: "10", date: "2026-03-11", category: "development" },
        { description: "M\u00f3dulo env\u00edos frontend", hours: "8", date: "2026-03-14", category: "development" },
        { description: "Integraci\u00f3n mapa tracking", hours: "6", date: "2026-03-17", category: "development" },
        { description: "Reuni\u00f3n review sprint 2", hours: "1", date: "2026-03-07", category: "meeting" },
        { description: "Reuni\u00f3n review sprint 3", hours: "1", date: "2026-03-21", category: "meeting" },
        { description: "Documentaci\u00f3n API", hours: "3", date: "2026-03-09", category: "planning" },
        { description: "Planeaci\u00f3n sprint 4", hours: "2", date: "2026-03-20", category: "planning" },
        { description: "Fix bug auth tokens", hours: "2", date: "2026-03-12", category: "support" },
        { description: "Ajustes de performance queries", hours: "3", date: "2026-03-18", category: "support" },
      ];

      for (const t of timeLogs) {
        await db!.insert(projectTimeLog).values({ projectId: project.id, ...t });
      }

      // Messages
      const msgs = [
        { senderType: "team", senderName: "Equipo IM3", content: "Hola! Bienvenido al portal de tu proyecto. Aqu\u00ed puedes ver el avance en tiempo real, revisar entregas y comunicarte con nosotros." },
        { senderType: "client", senderName: "Carlos M\u00e9ndez", content: "Excelente, gracias! Me encanta la idea de poder ver todo aqu\u00ed. El prototipo de Figma qued\u00f3 muy bien." },
        { senderType: "team", senderName: "Equipo IM3", content: "Genial! Ya tenemos el backend casi listo. Esta semana estamos arrancando con el dashboard web. Les comparto la primera entrega para review." },
        { senderType: "client", senderName: "Carlos M\u00e9ndez", content: "Perfecto. Una pregunta \u2014 el mapa de tracking va a funcionar con GPS en tiempo real o es tracking por checkpoints?" },
        { senderType: "team", senderName: "Equipo IM3", content: "GPS en tiempo real via la app del conductor. El dashboard web muestra la posici\u00f3n actualizada cada 30 segundos. Tambi\u00e9n tiene checkpoints autom\u00e1ticos en cada parada." },
      ];

      for (const m of msgs) {
        await db!.insert(projectMessages).values({ projectId: project.id, ...m, isRead: m.senderType === "team" });
      }

      res.json({ message: "Proyecto demo creado", projectId: project.id, portalToken: project.accessToken });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Seed IM3 Systems — internal project
  app.post("/api/admin/projects/seed-im3", requireAuth, async (_req, res) => {
    try {
      // Check if already seeded
      const existing = await db!.select().from(clientProjects).where(eq(clientProjects.name, "IM3 Systems — Desarrollo Interno")).limit(1);
      if (existing.length > 0) return res.json({ message: "Proyecto IM3 ya existe", projectId: existing[0].id });

      // Create or find contact
      let contactId: string;
      const [existingContact] = await db!.select().from(contacts).where(eq(contacts.email, "info@im3systems.com")).limit(1);
      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const [c] = await db!.insert(contacts).values({ nombre: "Isabel Montenegro", empresa: "IM3 Systems", email: "info@im3systems.com", status: "converted", leadScore: 100 }).returning();
        contactId = c.id;
      }

      // Create project
      const [project] = await db!.insert(clientProjects).values({
        contactId, name: "IM3 Systems — Desarrollo Interno",
        description: "Ecosistema completo de herramientas IM3: Website + CRM, Acta (grabación de reuniones), Audit Generator (reportes de auditoría), IM3 Tutor (widget de IA embebible). Gestión interna de desarrollo.",
        status: "in_progress", startDate: new Date("2026-01-15"), estimatedEndDate: new Date("2026-12-31"),
        totalBudget: 0, currency: "USD", healthStatus: "on_track",
        healthNote: "4 productos en desarrollo activo. CRM y Acta en producción, Audit Generator completado, Tutor en MVP.",
        githubRepoUrl: "https://github.com/mobando1/im3-web.git",
        aiTrackingEnabled: true,
      }).returning();

      // ── FASES ──
      const phasesData = [
        {
          phase: { name: "IM3 Website + CRM", description: "Sitio web público + CRM de ventas + portal de proyectos + blog + email marketing", status: "in_progress", estimatedHours: 400, startDate: new Date("2026-01-15") },
          tasks: [
            { title: "Landing page con animaciones y SEO", status: "completed", priority: "high", isMilestone: true, dueDate: new Date("2026-01-25") },
            { title: "Formulario de diagnóstico multi-step", status: "completed", priority: "high", dueDate: new Date("2026-01-30") },
            { title: "Sistema de emails AI (confirmación, mini-auditoría, re-engagement)", status: "completed", priority: "high", dueDate: new Date("2026-02-10") },
            { title: "CRM completo: contactos, pipeline, deals, tareas, calendario", status: "completed", priority: "high", isMilestone: true, dueDate: new Date("2026-02-20") },
            { title: "Blog + newsletter semanal con noticias AI", status: "completed", priority: "medium", dueDate: new Date("2026-02-25") },
            { title: "Portal de proyectos: fases, entregas, Gantt, calendario, mensajes", status: "completed", priority: "high", isMilestone: true, dueDate: new Date("2026-03-10") },
            { title: "GitHub integration + AI commit tracking", status: "completed", priority: "medium", dueDate: new Date("2026-03-15") },
            { title: "Módulo sesiones, archivos e ideas", status: "completed", priority: "medium", dueDate: new Date("2026-03-26") },
            { title: "Propuestas AI (generación + vista pública)", status: "completed", priority: "high", dueDate: new Date("2026-03-25") },
            { title: "Subdomain hub.im3systems.com", status: "completed", priority: "low", dueDate: new Date("2026-03-24") },
            { title: "Multi-idioma emails (español + inglés)", status: "completed", priority: "medium", dueDate: new Date("2026-03-24") },
            { title: "WhatsApp integration (recepción + clasificación AI)", status: "completed", priority: "high", dueDate: new Date("2026-03-20") },
            { title: "Portal del cliente: Sesiones + Archivos + Ideas", status: "in_progress", priority: "high", dueDate: new Date("2026-04-05") },
            { title: "File upload con Supabase Storage", status: "pending", priority: "medium", dueDate: new Date("2026-04-15") },
          ],
        },
        {
          phase: { name: "Acta — Grabación de reuniones", description: "App móvil para grabar, transcribir y analizar reuniones con IA. Integrada al CRM.", status: "in_progress", estimatedHours: 200, startDate: new Date("2026-02-01") },
          tasks: [
            { title: "Recording con MediaRecorder API + visualizador de onda", status: "completed", priority: "high", isMilestone: true, dueDate: new Date("2026-02-10") },
            { title: "Transcripción OpenAI Whisper (multi-idioma + diarización)", status: "completed", priority: "high", dueDate: new Date("2026-02-15") },
            { title: "Análisis GPT-4o: resumen, action items, insights", status: "completed", priority: "high", dueDate: new Date("2026-02-20") },
            { title: "Hub por cliente con historial de reuniones", status: "completed", priority: "high", dueDate: new Date("2026-02-25") },
            { title: "Reportes públicos compartibles (token + PDF)", status: "completed", priority: "medium", dueDate: new Date("2026-03-01") },
            { title: "Stripe billing: freemium + créditos por minuto", status: "completed", priority: "high", isMilestone: true, dueDate: new Date("2026-03-05") },
            { title: "IndexedDB backup + wake lock + pause/resume", status: "completed", priority: "medium", dueDate: new Date("2026-03-10") },
            { title: "Integración con CRM (iframe en sidebar)", status: "completed", priority: "medium", dueDate: new Date("2026-03-26") },
            { title: "Coaching de ventas (% tiempo hablado, objeciones)", status: "pending", priority: "medium", dueDate: new Date("2026-05-01") },
            { title: "Google Drive sync automático", status: "pending", priority: "low", dueDate: new Date("2026-05-15") },
          ],
        },
        {
          phase: { name: "Audit Generator", description: "Generador de reportes de auditoría operativa premium con IA, benchmarking y PDF consulting-grade.", status: "completed", estimatedHours: 120, startDate: new Date("2026-02-10"), endDate: new Date("2026-03-17") },
          tasks: [
            { title: "Pre-audit + full-audit forms", status: "completed", priority: "high", dueDate: new Date("2026-02-15") },
            { title: "Motor de métricas y benchmarking por industria", status: "completed", priority: "high", dueDate: new Date("2026-02-22") },
            { title: "Generación PDF premium con Playwright", status: "completed", priority: "high", isMilestone: true, dueDate: new Date("2026-03-01") },
            { title: "Diagramas: Mermaid + ECharts (funnel, radar, heatmaps)", status: "completed", priority: "medium", dueDate: new Date("2026-03-05") },
            { title: "Anti-hallucination validation engine", status: "completed", priority: "high", dueDate: new Date("2026-03-10") },
            { title: "Google Drive auto-upload de reportes", status: "completed", priority: "medium", dueDate: new Date("2026-03-12") },
            { title: "Frontend Next.js para gestión de auditorías", status: "completed", priority: "medium", dueDate: new Date("2026-03-17") },
          ],
        },
        {
          phase: { name: "IM3 Tutor — Widget de IA", description: "SaaS de tutores virtuales con IA, embebibles como widget JS en cualquier app. RAG con Claude.", status: "in_progress", estimatedHours: 150, startDate: new Date("2026-03-15") },
          tasks: [
            { title: "Schema PostgreSQL + Drizzle ORM", status: "completed", priority: "high", dueDate: new Date("2026-03-18") },
            { title: "RAG pipeline: PDFs → chunks → embeddings", status: "in_progress", priority: "high", isMilestone: true, dueDate: new Date("2026-03-30") },
            { title: "Widget embebible (Shadow DOM + vanilla JS)", status: "in_progress", priority: "high", dueDate: new Date("2026-04-05") },
            { title: "API REST para integración con CRM", status: "pending", priority: "high", dueDate: new Date("2026-04-10") },
            { title: "Multi-idioma (español + inglés)", status: "pending", priority: "medium", dueDate: new Date("2026-04-15") },
            { title: "Customización de tema y branding por cliente", status: "pending", priority: "medium", dueDate: new Date("2026-04-20") },
          ],
        },
      ];

      const phases = [];
      for (let i = 0; i < phasesData.length; i++) {
        const [ph] = await db!.insert(projectPhases).values({
          projectId: project.id, ...phasesData[i].phase, orderIndex: i,
        }).returning();
        phases.push(ph);

        for (const task of phasesData[i].tasks) {
          await db!.insert(projectTasks).values({
            phaseId: ph.id, projectId: project.id, ...task,
          });
        }
      }

      // ── IDEAS (backlog) ──
      const ideasData = [
        { title: "Coaching de ventas en Acta", description: "Detectar % de tiempo hablado por participante, identificar objeciones, generar score de la reunión.", priority: "high", status: "considering", suggestedBy: "team" },
        { title: "Google Drive sync por cliente", description: "Sincronizar automáticamente carpetas de Google Drive con cada proyecto del CRM.", priority: "medium", status: "suggested", suggestedBy: "team" },
        { title: "Voice Agent para llamadas", description: "Agente de IA que puede hacer y recibir llamadas telefónicas para calificación de leads.", priority: "high", status: "considering", suggestedBy: "team" },
        { title: "Scrapper SECOP II", description: "Monitorear licitaciones públicas relevantes para clientes del sector gobierno.", priority: "low", status: "suggested", suggestedBy: "team" },
        { title: "App de logística y rastreo", description: "Sistema de tracking GPS para flotas con dashboard operativo y app móvil para conductores.", priority: "medium", status: "planned", suggestedBy: "team" },
        { title: "WhatsApp Bot con IA avanzada", description: "Bot que maneja ventas, soporte y calificación de leads de forma autónoma via WhatsApp.", priority: "high", status: "considering", suggestedBy: "team" },
        { title: "App de procesos y checklists", description: "Sistema de checklists operativos digitales con trazabilidad y auditorías automáticas.", priority: "medium", status: "suggested", suggestedBy: "team" },
        { title: "Sistema de turnos", description: "Gestión de turnos de trabajo integrada al CRM con notificaciones y reportes.", priority: "low", status: "suggested", suggestedBy: "team" },
      ];

      for (const idea of ideasData) {
        await db!.insert(projectIdeas).values({ projectId: project.id, ...idea });
      }

      // ── ARCHIVOS ──
      const filesData = [
        { name: "IM3 Website — Repositorio GitHub", type: "document", url: "https://github.com/mobando1/im3-web" },
        { name: "Acta — Repositorio GitHub", type: "document", url: "https://github.com/mobando1/Acta" },
        { name: "Audit Generator — Repositorio GitHub", type: "document", url: "https://github.com/mobando1/audit-generator-im3" },
        { name: "IM3 Website — Deploy producción", type: "other", url: "https://www.im3systems.com" },
        { name: "CRM Hub — Deploy producción", type: "other", url: "https://hub.im3systems.com" },
        { name: "Acta — Deploy producción", type: "other", url: "https://brave-kindness-production-049c.up.railway.app" },
      ];

      for (const file of filesData) {
        await db!.insert(projectFiles).values({ projectId: project.id, ...file });
      }

      // ── MENSAJES ──
      const msgs = [
        { senderType: "team", senderName: "Equipo IM3", content: "Proyecto interno IM3 Systems creado. Aquí centralizamos todo el desarrollo de nuestras herramientas: Website, CRM, Acta, Audit Generator y Tutor." },
        { senderType: "team", senderName: "Equipo IM3", content: "Prioridades actuales: completar el portal del cliente con sesiones y archivos, y avanzar el MVP del IM3 Tutor (RAG + widget embebible)." },
      ];

      for (const m of msgs) {
        await db!.insert(projectMessages).values({ projectId: project.id, ...m, isRead: true });
      }

      res.json({ message: "Proyecto IM3 Systems creado", projectId: project.id, portalToken: project.accessToken });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Portal del Cliente — Admin endpoints (CRUD proyectos)
  // ─────────────────────────────────────────────────────────────

  // List projects
  app.get("/api/admin/projects", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const projects = await db.select().from(clientProjects).orderBy(desc(clientProjects.createdAt));
      const enriched = await Promise.all(projects.map(async (p) => {
        let contactName = null;
        if (p.contactId) {
          const [c] = await db!.select({ nombre: contacts.nombre, empresa: contacts.empresa }).from(contacts).where(eq(contacts.id, p.contactId));
          if (c) contactName = `${c.nombre} (${c.empresa})`;
        }
        const allTasks = await db!.select({ status: projectTasks.status }).from(projectTasks).where(eq(projectTasks.projectId, p.id));
        const completedTasks = allTasks.filter(t => t.status === "completed").length;
        const progress = allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0;
        return { ...p, contactName, progress, taskCount: allTasks.length, completedTaskCount: completedTasks };
      }));
      res.json(enriched);
    } catch (err: any) {
      log(`Error listing projects: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo proyectos" });
    }
  });

  // Create project
  app.post("/api/admin/projects", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [project] = await db.insert(clientProjects).values(req.body).returning();
      res.json(project);
    } catch (err: any) {
      log(`Error creating project: ${err?.message}`);
      res.status(500).json({ error: "Error creando proyecto" });
    }
  });

  // Get project detail
  app.get("/api/admin/projects/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [project] = await db.select().from(clientProjects).where(eq(clientProjects.id, req.params.id as string));
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

      const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, project.id)).orderBy(asc(projectPhases.orderIndex));
      const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, project.id));
      const deliverables = await db.select().from(projectDeliverables).where(eq(projectDeliverables.projectId, project.id)).orderBy(desc(projectDeliverables.createdAt));
      const timeLogs = await db.select().from(projectTimeLog).where(eq(projectTimeLog.projectId, project.id)).orderBy(desc(projectTimeLog.createdAt));
      const messages = await db.select().from(projectMessages).where(eq(projectMessages.projectId, project.id)).orderBy(asc(projectMessages.createdAt));

      let contactName = null;
      if (project.contactId) {
        const [c] = await db.select({ nombre: contacts.nombre, empresa: contacts.empresa }).from(contacts).where(eq(contacts.id, project.contactId));
        if (c) contactName = `${c.nombre} (${c.empresa})`;
      }

      const completedTasks = allTasks.filter(t => t.status === "completed").length;
      const progress = allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0;
      const totalHours = timeLogs.reduce((sum, t) => sum + parseFloat(String(t.hours)), 0);

      res.json({
        ...project,
        contactName,
        progress,
        totalHours,
        phases: phases.map(ph => ({
          ...ph,
          tasks: allTasks.filter(t => t.phaseId === ph.id),
        })),
        deliverables,
        timeLogs,
        messages,
      });
    } catch (err: any) {
      log(`Error getting project detail: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo proyecto" });
    }
  });

  // Update project
  app.patch("/api/admin/projects/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const updates = { ...req.body, updatedAt: new Date() };

      // Auto-generate webhook secret when AI tracking is enabled for the first time
      if (updates.aiTrackingEnabled) {
        const [existing] = await db.select({ secret: clientProjects.githubWebhookSecret })
          .from(clientProjects).where(eq(clientProjects.id, req.params.id as string)).limit(1);
        if (!existing?.secret) {
          updates.githubWebhookSecret = crypto.randomBytes(32).toString("hex");
        }
      }

      const [updated] = await db.update(clientProjects).set(updates).where(eq(clientProjects.id, req.params.id as string)).returning();
      if (!updated) return res.status(404).json({ message: "Proyecto no encontrado" });
      res.json(updated);
    } catch (err: any) {
      log(`Error updating project: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando proyecto" });
    }
  });

  // Delete project
  app.delete("/api/admin/projects/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const id = req.params.id as string;
      // Delete all related records (catch individually in case table doesn't exist yet)
      await db.delete(projectSessions).where(eq(projectSessions.projectId, id)).catch(() => {});
      await db.delete(projectFiles).where(eq(projectFiles.projectId, id)).catch(() => {});
      await db.delete(projectIdeas).where(eq(projectIdeas.projectId, id)).catch(() => {});
      await db.delete(githubWebhookEvents).where(eq(githubWebhookEvents.projectId, id)).catch(() => {});
      await db.delete(projectActivityEntries).where(eq(projectActivityEntries.projectId, id)).catch(() => {});
      await db.delete(projectMessages).where(eq(projectMessages.projectId, id)).catch(() => {});
      await db.delete(projectTimeLog).where(eq(projectTimeLog.projectId, id)).catch(() => {});
      await db.delete(projectDeliverables).where(eq(projectDeliverables.projectId, id)).catch(() => {});
      await db.delete(projectTasks).where(eq(projectTasks.projectId, id)).catch(() => {});
      await db.delete(projectPhases).where(eq(projectPhases.projectId, id)).catch(() => {});
      await db.delete(clientProjects).where(eq(clientProjects.id, id));
      res.json({ success: true });
    } catch (err: any) {
      log(`Error deleting project: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando proyecto" });
    }
  });

  // Auto-distribute phase dates
  app.post("/api/admin/projects/:id/auto-dates", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const force = req.body?.force === true;
      await autoDistributePhaseDates(req.params.id as string, force);
      const phases = await db.select().from(projectPhases)
        .where(eq(projectPhases.projectId, req.params.id as string))
        .orderBy(asc(projectPhases.orderIndex));
      res.json({ message: "Fechas distribuidas", phases });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Regenerate access token
  app.post("/api/admin/projects/:id/regenerate-token", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [updated] = await db.update(clientProjects).set({ accessToken: sql`gen_random_uuid()`, updatedAt: new Date() }).where(eq(clientProjects.id, req.params.id as string)).returning();
      if (!updated) return res.status(404).json({ message: "Proyecto no encontrado" });
      res.json({ accessToken: updated.accessToken });
    } catch (err: any) {
      log(`Error regenerating token: ${err?.message}`);
      res.status(500).json({ error: "Error regenerando token" });
    }
  });

  // ── Phases ──

  app.get("/api/admin/projects/:id/phases", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, req.params.id as string)).orderBy(asc(projectPhases.orderIndex));
      res.json(phases);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.post("/api/admin/projects/:id/phases", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [phase] = await db.insert(projectPhases).values({ ...req.body, projectId: req.params.id }).returning();
      // Auto-distribute dates if phase was created without explicit dates
      if (!req.body.startDate && !req.body.endDate) {
        autoDistributePhaseDates(req.params.id as string).catch(() => {});
      }
      res.json(phase);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.patch("/api/admin/phases/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      // Read previous status before updating (to avoid duplicate notifications)
      const [prev] = await db.select({ status: projectPhases.status }).from(projectPhases).where(eq(projectPhases.id, req.params.id as string)).limit(1);
      const prevStatus = prev?.status;

      const [updated] = await db.update(projectPhases).set({ ...req.body, updatedAt: new Date() }).where(eq(projectPhases.id, req.params.id as string)).returning();
      if (!updated) return res.status(404).json({ message: "Fase no encontrada" });
      res.json(updated);

      // Notify client only when phase transitions TO completed (not if already completed)
      if (req.body.status === "completed" && prevStatus !== "completed" && updated.projectId) {
        const allTasks = await db.select({ status: projectTasks.status }).from(projectTasks).where(eq(projectTasks.projectId, updated.projectId));
        const completedCount = allTasks.filter(t => t.status === "completed").length;
        const progress = allTasks.length > 0 ? Math.round((completedCount / allTasks.length) * 100) : 0;
        notifyProjectClient(updated.projectId, `✅ Fase completada: ${updated.name}`, {
          title: "Fase completada",
          headerEmoji: "✅",
          headerColor: "linear-gradient(135deg,#059669,#10B981)",
          bodyLines: [
            `La fase <strong>"${updated.name}"</strong> ha sido completada exitosamente.`,
            `Tu proyecto avanza al <strong>${progress}%</strong> de progreso total.`,
            "Entra al portal para ver el roadmap actualizado y las próximas fases.",
          ],
          ctaText: "Ver roadmap →",
        });
      }
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.delete("/api/admin/phases/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(projectTasks).where(eq(projectTasks.phaseId, req.params.id as string));
      await db.delete(projectPhases).where(eq(projectPhases.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.patch("/api/admin/phases/reorder", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const { phases: ordering } = req.body as { phases: { id: string; orderIndex: number }[] };
      for (const item of ordering) {
        await db.update(projectPhases).set({ orderIndex: item.orderIndex }).where(eq(projectPhases.id, item.id));
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  // ── Tasks ──

  app.post("/api/admin/phases/:id/tasks", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [phase] = await db.select({ projectId: projectPhases.projectId }).from(projectPhases).where(eq(projectPhases.id, req.params.id as string));
      if (!phase) return res.status(404).json({ message: "Fase no encontrada" });
      const [task] = await db.insert(projectTasks).values({ ...req.body, phaseId: req.params.id as string, projectId: phase.projectId }).returning();
      res.json(task);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.patch("/api/admin/tasks/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const updates: Record<string, unknown> = { ...req.body, updatedAt: new Date() };
      if (req.body.status === "completed") updates.completedAt = new Date();
      const [updated] = await db.update(projectTasks).set(updates).where(eq(projectTasks.id, req.params.id as string)).returning();
      if (!updated) return res.status(404).json({ message: "Tarea no encontrada" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.delete("/api/admin/tasks/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(projectTasks).where(eq(projectTasks.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  // ── Deliverables ──

  app.post("/api/admin/projects/:id/deliverables", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [deliverable] = await db.insert(projectDeliverables).values({ ...req.body, projectId: req.params.id }).returning();
      res.json(deliverable);

      // Notify client about new deliverable
      const projectId = req.params.id as string;
      const [proj] = await db.select({ name: clientProjects.name }).from(clientProjects).where(eq(clientProjects.id, projectId)).limit(1);
      if (proj) {
        notifyProjectClient(projectId, `📦 Nueva entrega: ${deliverable.title}`, {
          title: "Nueva entrega disponible",
          headerEmoji: "📦",
          headerColor: "linear-gradient(135deg,#0F172A,#1E293B)",
          bodyLines: [
            `Hay una nueva entrega lista para tu revisión en el proyecto <strong>${proj.name}</strong>.`,
            `<strong>${deliverable.title}</strong>${deliverable.description ? ` — ${deliverable.description}` : ""}`,
            "Puedes revisarla, aprobarla o dejar comentarios directamente desde tu portal.",
          ],
          ctaText: "Ver entrega →",
        });
      }
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.patch("/api/admin/deliverables/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [updated] = await db.update(projectDeliverables).set(req.body).where(eq(projectDeliverables.id, req.params.id as string)).returning();
      if (!updated) return res.status(404).json({ message: "Entrega no encontrada" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.delete("/api/admin/deliverables/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(projectDeliverables).where(eq(projectDeliverables.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  // ── Time Log ──

  app.post("/api/admin/projects/:id/timelog", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [entry] = await db.insert(projectTimeLog).values({ ...req.body, projectId: req.params.id }).returning();
      res.json(entry);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.get("/api/admin/projects/:id/timelog", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const logs = await db.select().from(projectTimeLog).where(eq(projectTimeLog.projectId, req.params.id as string)).orderBy(desc(projectTimeLog.createdAt));
      res.json(logs);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.delete("/api/admin/timelog/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(projectTimeLog).where(eq(projectTimeLog.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  // ── Messages (admin side) ──

  app.get("/api/admin/projects/:id/messages", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const msgs = await db.select().from(projectMessages).where(eq(projectMessages.projectId, req.params.id as string)).orderBy(asc(projectMessages.createdAt));
      res.json(msgs);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.post("/api/admin/projects/:id/messages", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [msg] = await db.insert(projectMessages).values({ ...req.body, projectId: req.params.id as string, senderType: "team" }).returning();
      res.json(msg);

      // Notify client about new message
      const projectId = req.params.id as string;
      const [proj] = await db.select({ name: clientProjects.name }).from(clientProjects).where(eq(clientProjects.id, projectId)).limit(1);
      if (proj) {
        const preview = escapeHtml(msg.content.length > 150 ? msg.content.substring(0, 150) + "..." : msg.content);
        notifyProjectClient(projectId, `💬 Nuevo mensaje en ${proj.name}`, {
          title: `Mensaje de ${msg.senderName}`,
          headerEmoji: "💬",
          bodyLines: [
            `<strong>${msg.senderName}</strong> te envió un mensaje:`,
            `<div style="background:#f8fafc;border-left:3px solid #2FA4A9;padding:12px 16px;border-radius:4px;margin:4px 0">${preview}</div>`,
            "Responde directamente desde tu portal.",
          ],
          ctaText: "Ver conversación →",
        });
      }
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  // ─────────────────────────────────────────────────────────────
  // Portal del Cliente — Auth (login + invite + reset password)
  // ─────────────────────────────────────────────────────────────

  // Login (email + password)
  app.post("/api/portal/auth/login", (req, res, next) => {
    passport.authenticate("client-local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Credenciales inválidas" });
      req.login(user, (err2) => {
        if (err2) return next(err2);
        res.json(publicClientUser(user));
      });
    })(req, res, next);
  });

  // Logout
  app.post("/api/portal/auth/logout", (req, res) => {
    req.logout(() => res.json({ ok: true }));
  });

  // Current user
  app.get("/api/portal/auth/me", (req, res) => {
    if (!req.isAuthenticated() || (req.user as any)?.kind !== "client") {
      return res.status(401).json({ error: "No autorizado" });
    }
    res.json(publicClientUser(req.user));
  });

  // Accept invite — sets password, creates/links client_user, auto-login
  app.post("/api/portal/auth/accept-invite", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");
      const name = req.body?.name ? String(req.body.name).trim() : null;
      if (!token || password.length < 8) {
        return res.status(400).json({ error: "Token y contraseña (≥ 8 caracteres) son requeridos" });
      }
      const [invite] = await db!.select().from(clientInvites).where(eq(clientInvites.token, token));
      if (!invite) return res.status(404).json({ error: "Invitación no encontrada" });
      if (invite.usedAt) return res.status(410).json({ error: "Esta invitación ya fue usada" });
      if (new Date(invite.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: "Esta invitación expiró" });
      }

      const email = String(invite.email).toLowerCase().trim();
      const passwordHash = await hashPassword(password);

      // Upsert client_user
      const [existing] = await db!.select().from(clientUsers).where(eq(clientUsers.email, email));
      let user;
      if (existing) {
        const [updated] = await db!
          .update(clientUsers)
          .set({
            passwordHash,
            name: name || existing.name,
            status: "active",
            acceptedAt: existing.acceptedAt || sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(clientUsers.id, existing.id))
          .returning();
        user = updated;
      } else {
        const [created] = await db!
          .insert(clientUsers)
          .values({
            email,
            passwordHash,
            name,
            status: "active",
            acceptedAt: sql`now()` as any,
          })
          .returning();
        user = created;
      }

      // Link to project if invite carries one
      if (invite.clientProjectId) {
        await db!
          .insert(clientUserProjects)
          .values({ clientUserId: user.id, clientProjectId: invite.clientProjectId })
          .onConflictDoNothing()
          .catch(() => {});
      }

      // Mark invite used
      await db!.update(clientInvites).set({ usedAt: sql`now()` }).where(eq(clientInvites.id, invite.id));

      // Auto-login
      req.login({ ...user, kind: "client" }, (err) => {
        if (err) return res.status(500).json({ error: "Login automático falló" });
        res.json(publicClientUser(user));
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error aceptando invitación" });
    }
  });

  // Forgot password — always 200 (no email enumeration)
  app.post("/api/portal/auth/forgot-password", async (req, res) => {
    try {
      const email = String(req.body?.email || "").toLowerCase().trim();
      if (!email) return res.json({ ok: true });

      const [u] = await db!.select().from(clientUsers).where(eq(clientUsers.email, email));
      if (u && u.status !== "disabled") {
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
        const [reset] = await db!
          .insert(clientPasswordResets)
          .values({ clientUserId: u.id, expiresAt: expiresAt as any })
          .returning();
        await sendPasswordResetEmail({
          to: u.email,
          name: u.name,
          resetToken: reset.token,
        }).catch((e) => console.error("[portal] sendPasswordResetEmail failed:", e));
      }
      res.json({ ok: true });
    } catch (err: any) {
      // Never leak — always 200
      console.error("[portal] forgot-password error:", err);
      res.json({ ok: true });
    }
  });

  // Reset password
  app.post("/api/portal/auth/reset-password", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const newPassword = String(req.body?.newPassword || "");
      if (!token || newPassword.length < 8) {
        return res.status(400).json({ error: "Token y contraseña (≥ 8 caracteres) son requeridos" });
      }
      const [reset] = await db!.select().from(clientPasswordResets).where(eq(clientPasswordResets.token, token));
      if (!reset) return res.status(404).json({ error: "Token inválido" });
      if (reset.usedAt) return res.status(410).json({ error: "Este link ya fue usado" });
      if (new Date(reset.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: "Este link expiró" });
      }
      const passwordHash = await hashPassword(newPassword);
      await db!
        .update(clientUsers)
        .set({ passwordHash, status: "active", updatedAt: sql`now()` })
        .where(eq(clientUsers.id, reset.clientUserId));
      await db!.update(clientPasswordResets).set({ usedAt: sql`now()` }).where(eq(clientPasswordResets.id, reset.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error reseteando contraseña" });
    }
  });

  // Magic-link consume — passwordless login.
  // Validates token, creates Passport session, redirects into the portal.
  // Rendered as an HTTP 302 from the backend so the email link lands directly inside.
  app.get("/portal/magic/:token", async (req, res, next) => {
    if (!db) return next();
    const token = String(req.params.token || "").trim();
    const loginRedirect = (reason: string) =>
      res.redirect(`/portal/login?error=${encodeURIComponent(reason)}`);
    try {
      const [row] = await db.select().from(clientMagicTokens).where(eq(clientMagicTokens.token, token));
      if (!row) return loginRedirect("link_invalido");
      if (row.usedAt) return loginRedirect("link_ya_usado");
      if (new Date(row.expiresAt).getTime() < Date.now()) return loginRedirect("link_expirado");

      const [user] = await db.select().from(clientUsers).where(eq(clientUsers.id, row.clientUserId));
      if (!user || user.status === "disabled") return loginRedirect("cuenta_deshabilitada");

      // Mark token as used (single-use semantics)
      await db.update(clientMagicTokens).set({ usedAt: sql`now()` }).where(eq(clientMagicTokens.id, row.id));
      // Best-effort: bump lastLoginAt
      await db.update(clientUsers).set({ lastLoginAt: sql`now()`, updatedAt: sql`now()` }).where(eq(clientUsers.id, user.id)).catch(() => {});

      req.login({ ...user, kind: "client" }, (err) => {
        if (err) return loginRedirect("login_fallo");
        const target = row.clientProjectId ? `/portal/projects/${row.clientProjectId}` : `/portal/projects`;
        res.redirect(target);
      });
    } catch (err: any) {
      log(`Magic-link consume error: ${err?.message || err}`);
      loginRedirect("error_inesperado");
    }
  });

  // Magic-link request — "envíame un link" desde /portal/login.
  // Always returns 200 (sin enumeración de emails).
  app.post("/api/portal/auth/magic-link-request", async (req, res) => {
    try {
      const email = String(req.body?.email || "").toLowerCase().trim();
      if (!email || !db) return res.json({ ok: true });
      const [u] = await db.select().from(clientUsers).where(eq(clientUsers.email, email));
      if (u && u.status !== "disabled") {
        const token = await createMagicToken({ clientUserId: u.id, ttlMinutes: MAGIC_LINK_TTL_MINUTES });
        await sendMagicLinkLoginEmail({ to: u.email, name: u.name, magicToken: token })
          .catch((e) => console.error("[portal] sendMagicLinkLoginEmail failed:", e));
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[portal] magic-link-request error:", err);
      res.json({ ok: true });
    }
  });

  // Get invite info (for accept-invite UI to show email/projectName before submit)
  app.get("/api/portal/auth/invite/:token", async (req, res) => {
    const [invite] = await db!.select().from(clientInvites).where(eq(clientInvites.token, String(req.params.token)));
    if (!invite) return res.status(404).json({ error: "Invitación no encontrada" });
    if (invite.usedAt) return res.status(410).json({ error: "Esta invitación ya fue usada" });
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ error: "Esta invitación expiró" });
    }
    let projectName: string | null = null;
    if (invite.clientProjectId) {
      const [p] = await db!.select({ name: clientProjects.name }).from(clientProjects).where(eq(clientProjects.id, invite.clientProjectId));
      projectName = p?.name || null;
    }
    res.json({ email: invite.email, projectName });
  });

  // List projects accessible to the logged-in client (for selector)
  app.get("/api/portal/projects", requireClient, async (req, res) => {
    const userId = (req.user as any).id;
    const links = await db!
      .select({
        id: clientProjects.id,
        name: clientProjects.name,
        description: clientProjects.description,
        status: clientProjects.status,
        startDate: clientProjects.startDate,
        estimatedEndDate: clientProjects.estimatedEndDate,
        healthStatus: clientProjects.healthStatus,
      })
      .from(clientUserProjects)
      .innerJoin(clientProjects, eq(clientProjects.id, clientUserProjects.clientProjectId))
      .where(eq(clientUserProjects.clientUserId, userId));
    res.json(links);
  });

  // Bridge: rewrite /api/portal/projects/:projectId(/*) → /api/portal/:accessToken(/*)
  // so all existing token-based handlers below work for authenticated clients too.
  // Excludes "/api/portal/projects" (no id) which is handled by the list endpoint above.
  app.use(async (req, res, next) => {
    const m = req.url.match(/^\/api\/portal\/projects\/([^/?]+)(\/.*)?(\?.*)?$/);
    if (!m) return next();
    if (!req.isAuthenticated() || (req.user as any)?.kind !== "client") {
      return res.status(401).json({ error: "No autorizado" });
    }
    const projectId = m[1];
    const userId = (req.user as any).id;
    const [link] = await db!
      .select()
      .from(clientUserProjects)
      .where(and(eq(clientUserProjects.clientUserId, userId), eq(clientUserProjects.clientProjectId, projectId)));
    if (!link) return res.status(403).json({ error: "No tienes acceso a este proyecto" });
    const [project] = await db!
      .select({ accessToken: clientProjects.accessToken })
      .from(clientProjects)
      .where(eq(clientProjects.id, projectId));
    if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });
    const tail = m[2] || "";
    const qs = m[3] || "";
    req.url = `/api/portal/${project.accessToken}${tail}${qs}`;
    next();
  });

  // ─────────────────────────────────────────────────────────────
  // Portal — Admin endpoints (manage client_users + invites)
  // ─────────────────────────────────────────────────────────────

  // Invite a client to a specific project
  app.post("/api/admin/projects/:id/invite-client", requireAuth, async (req, res) => {
    try {
      const projectId = String(req.params.id);
      const email = String(req.body?.email || "").toLowerCase().trim();
      const name = req.body?.name ? String(req.body.name).trim() : null;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Email inválido" });
      }
      const [project] = await db!.select().from(clientProjects).where(eq(clientProjects.id, projectId));
      if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const adminId = (req.user as any)?.id;
      const [invite] = await db!
        .insert(clientInvites)
        .values({
          email,
          clientProjectId: projectId,
          invitedByUserId: adminId,
          expiresAt: expiresAt as any,
        })
        .returning();

      await sendInviteEmail({
        to: email,
        name,
        inviteToken: invite.token,
        projectName: project.name,
      });

      res.json({ inviteId: invite.id, expiresAt: invite.expiresAt });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error invitando cliente" });
    }
  });

  // List clients with access to a specific project
  app.get("/api/admin/projects/:id/clients", requireAuth, async (req, res) => {
    const projectId = String(req.params.id);
    const linked = await db!
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        name: clientUsers.name,
        status: clientUsers.status,
        acceptedAt: clientUsers.acceptedAt,
        lastLoginAt: clientUsers.lastLoginAt,
        invitedAt: clientUsers.invitedAt,
      })
      .from(clientUserProjects)
      .innerJoin(clientUsers, eq(clientUsers.id, clientUserProjects.clientUserId))
      .where(eq(clientUserProjects.clientProjectId, projectId));

    const pendingInvites = await db!
      .select({
        id: clientInvites.id,
        email: clientInvites.email,
        expiresAt: clientInvites.expiresAt,
        createdAt: clientInvites.createdAt,
      })
      .from(clientInvites)
      .where(and(eq(clientInvites.clientProjectId, projectId), isNull(clientInvites.usedAt)));

    res.json({ users: linked, pendingInvites });
  });

  // Unlink a client from a project
  app.post("/api/admin/projects/:id/clients/:clientId/unlink", requireAuth, async (req, res) => {
    const projectId = String(req.params.id);
    const clientId = String(req.params.clientId);
    await db!
      .delete(clientUserProjects)
      .where(and(eq(clientUserProjects.clientProjectId, projectId), eq(clientUserProjects.clientUserId, clientId)));
    res.json({ ok: true });
  });

  // Resend invite (creates a fresh token)
  app.post("/api/admin/projects/:id/invites/:inviteId/resend", requireAuth, async (req, res) => {
    try {
      const projectId = String(req.params.id);
      const inviteId = String(req.params.inviteId);
      const [old] = await db!.select().from(clientInvites).where(eq(clientInvites.id, inviteId));
      if (!old) return res.status(404).json({ error: "Invitación no encontrada" });
      if (old.usedAt) return res.status(410).json({ error: "Invitación ya usada — ya no se puede reenviar" });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [fresh] = await db!
        .insert(clientInvites)
        .values({
          email: old.email,
          clientProjectId: projectId,
          invitedByUserId: (req.user as any)?.id,
          expiresAt: expiresAt as any,
        })
        .returning();

      const [project] = await db!.select({ name: clientProjects.name }).from(clientProjects).where(eq(clientProjects.id, projectId));
      await sendInviteEmail({
        to: old.email,
        name: null,
        inviteToken: fresh.token,
        projectName: project?.name,
      });
      res.json({ inviteId: fresh.id, expiresAt: fresh.expiresAt });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error reenviando invitación" });
    }
  });

  // Disable a client (cuts access across all their projects)
  app.post("/api/admin/clients/:id/disable", requireAuth, async (req, res) => {
    await db!
      .update(clientUsers)
      .set({ status: "disabled", updatedAt: sql`now()` })
      .where(eq(clientUsers.id, String(req.params.id)));
    res.json({ ok: true });
  });

  // ─────────────────────────────────────────────────────────────
  // Portal del Cliente — Public endpoints (auth by token)
  // ─────────────────────────────────────────────────────────────

  async function getProjectByToken(token: string) {
    const [project] = await db!.select().from(clientProjects).where(eq(clientProjects.accessToken, token));
    return project || null;
  }

  // Portal overview
  app.get("/api/portal/:token", async (req, res) => {
    const project = await getProjectByToken(req.params.token as string);
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

    const phases = await db!.select().from(projectPhases).where(eq(projectPhases.projectId, project.id)).orderBy(asc(projectPhases.orderIndex));
    const allTasks = await db!.select().from(projectTasks).where(eq(projectTasks.projectId, project.id));
    const timeLogs = await db!.select().from(projectTimeLog).where(eq(projectTimeLog.projectId, project.id));
    const unreadMessages = await db!.select({ id: projectMessages.id }).from(projectMessages).where(and(eq(projectMessages.projectId, project.id), eq(projectMessages.senderType, "team"), eq(projectMessages.isRead, false)));

    const completedTasks = allTasks.filter(t => t.status === "completed").length;
    const progress = allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0;
    const totalHours = timeLogs.reduce((sum, t) => sum + parseFloat(String(t.hours)), 0);

    let contactName = null;
    if (project.contactId) {
      const [c] = await db!.select({ nombre: contacts.nombre, empresa: contacts.empresa }).from(contacts).where(eq(contacts.id, project.contactId));
      if (c) contactName = `${c.nombre} (${c.empresa})`;
    }

    res.json({
      name: project.name,
      description: project.description,
      status: project.status,
      startDate: project.startDate,
      estimatedEndDate: project.estimatedEndDate,
      contactName,
      progress,
      totalHours,
      taskCount: allTasks.length,
      completedTaskCount: completedTasks,
      unreadMessageCount: unreadMessages.length,
      healthStatus: project.healthStatus || "on_track",
      healthNote: project.healthNote,
    });
  });

  // Portal phases with tasks
  app.get("/api/portal/:token/phases", async (req, res) => {
    const project = await getProjectByToken(req.params.token as string);
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

    const phases = await db!.select().from(projectPhases).where(eq(projectPhases.projectId, project.id)).orderBy(asc(projectPhases.orderIndex));
    const allTasks = await db!.select().from(projectTasks).where(eq(projectTasks.projectId, project.id));

    const enriched = phases.map(ph => {
      const phaseTasks = allTasks.filter(t => t.phaseId === ph.id);
      const completed = phaseTasks.filter(t => t.status === "completed").length;
      return {
        ...ph,
        tasks: phaseTasks.map(t => ({ id: t.id, title: t.title, clientFacingTitle: t.clientFacingTitle, status: t.status, priority: t.priority })),
        progress: phaseTasks.length > 0 ? Math.round((completed / phaseTasks.length) * 100) : 0,
      };
    });
    res.json(enriched);
  });

  // Portal deliverables
  app.get("/api/portal/:token/deliverables", async (req, res) => {
    const project = await getProjectByToken(req.params.token as string);
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

    const deliverables = await db!.select().from(projectDeliverables).where(eq(projectDeliverables.projectId, project.id)).orderBy(desc(projectDeliverables.createdAt));
    res.json(deliverables);
  });

  // Portal: approve/reject deliverable
  app.patch("/api/portal/:token/deliverables/:id", async (req, res) => {
    const project = await getProjectByToken(req.params.token as string);
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

    const { status, clientComment, clientRating } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ message: "Estado inválido" });

    const updates: Record<string, unknown> = { status, clientComment, clientRating: clientRating || null };
    if (status === "approved") updates.approvedAt = new Date();

    const [updated] = await db!.update(projectDeliverables).set(updates).where(and(eq(projectDeliverables.id, req.params.id as string), eq(projectDeliverables.projectId, project.id))).returning();
    if (!updated) return res.status(404).json({ message: "Entrega no encontrada" });
    res.json(updated);

    // Notify admin about client review
    const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
    const baseUrl = process.env.BASE_URL || "https://im3systems.com";
    const emoji = status === "approved" ? "✅" : "❌";
    const label = status === "approved" ? "Aprobada" : "Rechazada";
    const ratingStr = clientRating ? ` — ${"★".repeat(clientRating)}${"☆".repeat(5 - clientRating)}` : "";
    sendEmail(
      adminEmail,
      `${emoji} Entrega ${label.toLowerCase()}: ${updated.title}`,
      `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
        <div style="background:${status === "approved" ? "linear-gradient(135deg,#059669,#10B981)" : "linear-gradient(135deg,#DC2626,#EF4444)"};padding:20px 28px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;font-size:18px;margin:0">${emoji} Entrega ${label}</h1>
        </div>
        <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
          <p style="font-size:15px;color:#333;margin:0 0 16px">El cliente revisó la entrega <strong>"${updated.title}"</strong> del proyecto <strong>${project.name}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#666;width:120px">Estado</td><td style="padding:6px 0;font-weight:600">${label}${ratingStr}</td></tr>
            ${clientComment ? `<tr><td style="padding:6px 0;color:#666">Comentario</td><td style="padding:6px 0">${escapeHtml(clientComment)}</td></tr>` : ""}
          </table>
          <div style="margin-top:20px">
            <a href="${baseUrl}/admin/projects/${project.id}" style="display:inline-block;background:#3B82F6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">Ver proyecto →</a>
          </div>
        </div>
      </div>`
    ).catch((err) => log(`Error sending deliverable review notification: ${err}`));
  });

  // Portal time log summary
  app.get("/api/portal/:token/timelog", async (req, res) => {
    const project = await getProjectByToken(req.params.token as string);
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

    const logs = await db!.select().from(projectTimeLog).where(eq(projectTimeLog.projectId, project.id)).orderBy(desc(projectTimeLog.createdAt));

    // Aggregate by category
    const byCategory: Record<string, number> = {};
    const byWeek: Record<string, number> = {};
    for (const log of logs) {
      const cat = log.category;
      const hrs = parseFloat(String(log.hours));
      byCategory[cat] = (byCategory[cat] || 0) + hrs;
      // Week key: ISO week
      const d = new Date(log.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().split("T")[0];
      byWeek[weekKey] = (byWeek[weekKey] || 0) + hrs;
    }

    res.json({ byCategory, byWeek, totalHours: Object.values(byCategory).reduce((a, b) => a + b, 0) });
  });

  // Portal messages
  app.get("/api/portal/:token/messages", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const project = await getProjectByToken(req.params.token as string);
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
      const msgs = await db.select().from(projectMessages).where(eq(projectMessages.projectId, project.id)).orderBy(asc(projectMessages.createdAt));
      res.json(msgs);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  // Portal: send message (client side)
  app.post("/api/portal/:token/messages", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const project = await getProjectByToken(req.params.token as string);
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
      const [msg] = await db.insert(projectMessages).values({
        projectId: project.id,
        senderType: "client",
        senderName: req.body.senderName || "Cliente",
        content: req.body.content,
      }).returning();
      res.json(msg);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  // Portal: mark messages as read
  app.patch("/api/portal/:token/messages/read", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const project = await getProjectByToken(req.params.token as string);
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
      await db.update(projectMessages).set({ isRead: true }).where(and(eq(projectMessages.projectId, project.id), eq(projectMessages.senderType, "team")));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  // Portal: pulse (current task + last 48h activity)
  app.get("/api/portal/:token/pulse", async (req, res) => {
    const project = await getProjectByToken(req.params.token as string);
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

    // Current focus: highest priority in_progress task
    const inProgressTasks = await db!.select().from(projectTasks)
      .where(and(eq(projectTasks.projectId, project.id), eq(projectTasks.status, "in_progress")));
    const currentTask = inProgressTasks.sort((a, b) => {
      const prio = { high: 3, medium: 2, low: 1 };
      return (prio[b.priority as keyof typeof prio] || 0) - (prio[a.priority as keyof typeof prio] || 0);
    })[0] || null;

    // Get phase for current task
    let currentPhase = null;
    if (currentTask) {
      const [ph] = await db!.select().from(projectPhases).where(eq(projectPhases.id, currentTask.phaseId));
      currentPhase = ph || null;
    }

    // Last 48h activity entries
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const recentActivity = await db!.select().from(projectActivityEntries)
      .where(and(eq(projectActivityEntries.projectId, project.id), gte(projectActivityEntries.createdAt, twoDaysAgo)))
      .orderBy(desc(projectActivityEntries.createdAt))
      .limit(10);

    // Calculate task progress within its phase
    let taskProgress = 0;
    if (currentTask) {
      const phaseTasks = await db!.select().from(projectTasks).where(eq(projectTasks.phaseId, currentTask.phaseId));
      const completed = phaseTasks.filter(t => t.status === "completed").length;
      taskProgress = phaseTasks.length > 0 ? Math.round((completed / phaseTasks.length) * 100) : 0;
    }

    res.json({
      currentFocus: currentTask ? {
        title: currentTask.clientFacingTitle || currentTask.title,
        description: currentTask.clientFacingDescription || currentTask.description,
        phaseName: currentPhase?.name || null,
        progress: taskProgress,
        lastActivityAt: recentActivity[0]?.createdAt || null,
      } : null,
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        summaryLevel1: a.summaryLevel1,
        summaryLevel2: a.summaryLevel2,
        summaryLevel3: a.summaryLevel3,
        category: a.category,
        isSignificant: a.isSignificant,
        createdAt: a.createdAt,
      })),
    });
  });

  // Portal: full activity feed (paginated, grouped by week)
  app.get("/api/portal/:token/activity", async (req, res) => {
    const project = await getProjectByToken(req.params.token as string);
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const entries = await db!.select().from(projectActivityEntries)
      .where(eq(projectActivityEntries.projectId, project.id))
      .orderBy(desc(projectActivityEntries.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(entries);
  });

  // Portal: investment data
  app.get("/api/portal/:token/investment", async (req, res) => {
    const project = await getProjectByToken(req.params.token as string);
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

    const logs = await db!.select().from(projectTimeLog).where(eq(projectTimeLog.projectId, project.id));

    const byCategory: Record<string, number> = {};
    const byWeek: Record<string, number> = {};
    let totalHours = 0;

    for (const log_ of logs) {
      const hrs = parseFloat(String(log_.hours));
      totalHours += hrs;
      byCategory[log_.category] = (byCategory[log_.category] || 0) + hrs;
      const d = new Date(log_.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().split("T")[0];
      byWeek[weekKey] = (byWeek[weekKey] || 0) + hrs;
    }

    // This week hours
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const thisWeekKey = weekStart.toISOString().split("T")[0];
    const thisWeekHours = byWeek[thisWeekKey] || 0;

    // Meeting percentage
    const meetingHours = byCategory["meeting"] || 0;
    const meetingPct = totalHours > 0 ? Math.round((meetingHours / totalHours) * 100) : 0;
    const buildPct = 100 - meetingPct;

    res.json({
      totalBudget: project.totalBudget,
      currency: project.currency,
      totalHours,
      thisWeekHours,
      byCategory,
      byWeek,
      meetingPct,
      buildPct,
    });
  });

  // ── Portal: Sessions (read-only) ──

  app.get("/api/portal/:token/sessions", async (req, res) => {
    try {
      const project = await getProjectByToken(req.params.token as string);
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
      const sessions = await db!.select().from(projectSessions)
        .where(eq(projectSessions.projectId, project.id))
        .orderBy(desc(projectSessions.date));
      res.json(sessions);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Portal: Files (read-only) ──

  app.get("/api/portal/:token/files", async (req, res) => {
    try {
      const project = await getProjectByToken(req.params.token as string);
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
      const files = await db!.select().from(projectFiles)
        .where(eq(projectFiles.projectId, project.id))
        .orderBy(desc(projectFiles.createdAt));
      res.json(files);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Portal: Ideas (read + create + vote) ──

  app.get("/api/portal/:token/ideas", async (req, res) => {
    try {
      const project = await getProjectByToken(req.params.token as string);
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
      const ideas = await db!.select().from(projectIdeas)
        .where(eq(projectIdeas.projectId, project.id))
        .orderBy(desc(projectIdeas.createdAt));
      res.json(ideas);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/portal/:token/ideas", async (req, res) => {
    try {
      const project = await getProjectByToken(req.params.token as string);
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
      const [idea] = await db!.insert(projectIdeas).values({
        projectId: project.id,
        suggestedBy: "client",
        ...req.body,
      }).returning();
      res.json(idea);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.patch("/api/portal/:token/ideas/:ideaId/vote", async (req, res) => {
    try {
      const project = await getProjectByToken(req.params.token as string);
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
      const [idea] = await db!.select().from(projectIdeas).where(eq(projectIdeas.id, req.params.ideaId as string)).limit(1);
      if (!idea || idea.projectId !== project.id) return res.status(404).json({ message: "Idea no encontrada" });
      const [updated] = await db!.update(projectIdeas).set({ votes: (idea.votes || 0) + 1 }).where(eq(projectIdeas.id, idea.id)).returning();
      res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Auditorías — Proxy al Audit Generator microservice
  // ─────────────────────────────────────────────────────────────

  const AUDIT_URL = process.env.AUDIT_GENERATOR_URL || "";

  app.get("/api/admin/auditorias", requireAuth, async (_req, res) => {
    if (!AUDIT_URL) return res.json([]);
    try {
      const r = await fetch(`${AUDIT_URL}/api/audits`);
      const data = await r.json();
      // Ensure we always return an array — audit service may return { audits: [...] } or other shapes
      res.json(Array.isArray(data) ? data : Array.isArray(data?.audits) ? data.audits : []);
    } catch { res.json([]); }
  });

  app.post("/api/admin/auditorias/generate", requireAuth, async (req, res) => {
    if (!AUDIT_URL) return res.status(400).json({ message: "Audit Generator no configurado" });
    try {
      const r = await fetch(`${AUDIT_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      res.status(r.status).json(await r.json());
    } catch (err: unknown) {
      res.status(500).json({ message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  app.get("/api/admin/auditorias/:id/status", requireAuth, async (req, res) => {
    if (!AUDIT_URL) return res.status(400).json({ message: "No configurado" });
    try {
      const r = await fetch(`${AUDIT_URL}/api/status/${req.params.id as string}`);
      res.status(r.status).json(await r.json());
    } catch { res.status(500).json({ message: "Error consultando estado" }); }
  });

  app.get("/api/admin/auditorias/:id/download", requireAuth, async (req, res) => {
    if (!AUDIT_URL) return res.status(400).json({ message: "No configurado" });
    try {
      const r = await fetch(`${AUDIT_URL}/api/download/${req.params.id as string}`);
      if (!r.ok) return res.status(r.status).json({ message: "PDF no disponible" });
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename="auditoria-${req.params.id}.pdf"`);
      const buffer = await r.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch { res.status(500).json({ message: "Error descargando PDF" }); }
  });

  app.get("/api/admin/auditorias/:id/guide", requireAuth, async (req, res) => {
    if (!AUDIT_URL) return res.status(400).json({ message: "No configurado" });
    try {
      const r = await fetch(`${AUDIT_URL}/api/guide/${req.params.id as string}`);
      res.status(r.status).json(await r.json());
    } catch { res.status(500).json({ message: "Error obteniendo guía" }); }
  });

  app.post("/api/admin/auditorias/:id/action-plan", requireAuth, async (req, res) => {
    if (!AUDIT_URL) return res.status(400).json({ message: "No configurado" });
    try {
      const r = await fetch(`${AUDIT_URL}/api/action-plan/${req.params.id as string}`, { method: "POST" });
      res.status(r.status).json(await r.json());
    } catch { res.status(500).json({ message: "Error generando plan" }); }
  });

  app.post("/api/admin/auditorias/extract", requireAuth, async (req, res) => {
    if (!AUDIT_URL) return res.status(400).json({ message: "No configurado" });
    try {
      const r = await fetch(`${AUDIT_URL}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      res.status(r.status).json(await r.json());
    } catch { res.status(500).json({ message: "Error extrayendo datos" }); }
  });

  app.post("/api/admin/auditorias/drive-sync", requireAuth, async (_req, res) => {
    if (!AUDIT_URL) return res.status(400).json({ message: "No configurado" });
    try {
      const r = await fetch(`${AUDIT_URL}/api/drive-sync`, { method: "POST" });
      res.status(r.status).json(await r.json());
    } catch { res.status(500).json({ message: "Error sincronizando Drive" }); }
  });

  // ─────────────────────────────────────────────────────────────
  // GitHub OAuth — connect repos automatically
  // ─────────────────────────────────────────────────────────────

  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
  const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || "https://hub.im3systems.com/api/github/callback";

  // Check if GitHub OAuth is configured
  app.get("/api/admin/github/status", requireAuth, async (req, res) => {
    const user = req.user as { id: string; githubAccessToken?: string; githubUsername?: string };
    res.json({
      configured: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
      connected: !!user.githubAccessToken,
      githubUsername: user.githubUsername || null,
    });
  });

  // Start OAuth flow — redirect to GitHub
  app.get("/api/github/authorize", requireAuth, (_req, res) => {
    if (!GITHUB_CLIENT_ID) return res.status(400).json({ message: "GitHub OAuth no configurado" });
    const state = crypto.randomBytes(16).toString("hex");
    const scopes = "repo";
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=${scopes}&state=${state}`;
    res.redirect(url);
  });

  // OAuth callback — exchange code for token (no requireAuth — session may vary across redirect)
  app.get("/api/github/callback", async (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.redirect("/admin/login?github_error=session_lost");
    }
    const code = req.query.code as string;
    if (!code) return res.redirect("/admin/projects?github_error=no_code");

    try {
      // Exchange code for access token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: GITHUB_CALLBACK_URL,
        }),
      });
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenData.access_token) {
        return res.redirect("/admin/projects?github_error=token_failed");
      }

      // Get GitHub username
      const userRes = await fetch("https://api.github.com/user", {
        headers: { "Authorization": `Bearer ${tokenData.access_token}`, "User-Agent": "IM3-Systems-CRM" },
      });
      const ghUser = await userRes.json() as { login: string };

      // Save token to user
      const user = req.user as { id: string };
      await db!.update(users).set({
        githubAccessToken: tokenData.access_token,
        githubUsername: ghUser.login,
      }).where(eq(users.id, user.id));

      res.redirect("/admin/projects?github_connected=true");
    } catch (err: unknown) {
      log(`GitHub OAuth error: ${err instanceof Error ? err.message : String(err)}`);
      res.redirect("/admin/projects?github_error=exception");
    }
  });

  // Disconnect GitHub
  app.post("/api/admin/github/disconnect", requireAuth, async (req, res) => {
    const user = req.user as { id: string };
    await db!.update(users).set({ githubAccessToken: null, githubUsername: null }).where(eq(users.id, user.id));
    res.json({ success: true });
  });

  // List repos from connected GitHub account
  app.get("/api/admin/github/repos", requireAuth, async (req, res) => {
    const user = req.user as { id: string; githubAccessToken?: string };
    if (!user.githubAccessToken) return res.status(401).json({ message: "GitHub no conectado" });

    try {
      const page = parseInt(req.query.page as string) || 1;
      const ghRes = await fetch(`https://api.github.com/user/repos?per_page=30&page=${page}&sort=updated&direction=desc`, {
        headers: { "Authorization": `Bearer ${user.githubAccessToken}`, "User-Agent": "IM3-Systems-CRM" },
      });
      if (!ghRes.ok) return res.status(ghRes.status).json({ message: "GitHub API error" });

      const repos = await ghRes.json() as Array<{ id: number; full_name: string; html_url: string; description: string | null; private: boolean; updated_at: string }>;
      res.json(repos.map(r => ({
        id: r.id,
        fullName: r.full_name,
        url: r.html_url,
        description: r.description,
        isPrivate: r.private,
        updatedAt: r.updated_at,
      })));
    } catch (err: unknown) {
      res.status(500).json({ message: "Error fetching repos" });
    }
  });

  // Connect a repo to a project (auto-create webhook)
  app.post("/api/admin/projects/:id/connect-repo", requireAuth, async (req, res) => {
    const projectId = req.params.id as string;
    const user = req.user as { id: string; githubAccessToken?: string };
    if (!user.githubAccessToken) return res.status(401).json({ message: "GitHub no conectado" });

    const { repoFullName } = req.body as { repoFullName: string };
    if (!repoFullName) return res.status(400).json({ message: "repoFullName requerido" });

    try {
      // Generate webhook secret
      const webhookSecret = crypto.randomBytes(32).toString("hex");
      const webhookUrl = `${req.protocol}://${req.get("host")}/api/webhooks/github/${projectId}`;

      // Create webhook on GitHub
      const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user.githubAccessToken}`,
          "User-Agent": "IM3-Systems-CRM",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "web",
          config: {
            url: webhookUrl,
            content_type: "json",
            secret: webhookSecret,
          },
          events: ["push"],
          active: true,
        }),
      });

      if (!ghRes.ok) {
        const errBody = await ghRes.json().catch(() => ({})) as { message?: string };
        return res.status(ghRes.status).json({ message: `GitHub error: ${(errBody as any).message || ghRes.status}` });
      }

      // Update project with repo info
      const [updated] = await db!.update(clientProjects).set({
        githubRepoUrl: `https://github.com/${repoFullName}`,
        githubWebhookSecret: webhookSecret,
        aiTrackingEnabled: true,
        updatedAt: new Date(),
      }).where(eq(clientProjects.id, projectId)).returning();

      res.json({ success: true, project: updated });
    } catch (err: unknown) {
      res.status(500).json({ message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GitHub Webhook — receives push events
  // ─────────────────────────────────────────────────────────────

  app.post("/api/webhooks/github/:projectId", async (req, res) => {
    const projectId = req.params.projectId as string;
    const [project] = await db!.select().from(clientProjects).where(eq(clientProjects.id, projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Verify webhook secret if configured
    if (project.githubWebhookSecret) {
      const signature = req.headers["x-hub-signature-256"] as string;
      if (signature) {
        const body = JSON.stringify(req.body);
        const expected = "sha256=" + crypto.createHmac("sha256", project.githubWebhookSecret).update(body).digest("hex");
        if (signature !== expected) {
          return res.status(401).json({ message: "Invalid signature" });
        }
      }
    }

    // Store raw event
    const [event] = await db!.insert(githubWebhookEvents).values({
      projectId,
      payload: req.body,
    }).returning();

    // Extract commits from push event
    const commits = (req.body.commits || []).map((c: { id: string; message: string; added: string[]; modified: string[]; removed: string[]; timestamp: string }) => ({
      sha: c.id,
      message: c.message,
      filesChanged: [...(c.added || []), ...(c.modified || []), ...(c.removed || [])],
      timestamp: c.timestamp,
    }));

    if (commits.length === 0) {
      return res.json({ message: "No commits to process", eventId: event.id });
    }

    // Process with AI if enabled
    if (project.aiTrackingEnabled) {
      try {
        const results = await analyzeCommitsForProject(projectId, commits);

        for (const result of results) {
          const [entry] = await db!.insert(projectActivityEntries).values({
            projectId,
            source: "github_webhook",
            commitShas: commits.map((c: { sha: string }) => c.sha),
            summaryLevel1: result.summaryLevel1,
            summaryLevel2: result.summaryLevel2,
            summaryLevel3: result.summaryLevel3,
            category: result.category,
            aiGenerated: true,
            isSignificant: result.isSignificant,
          }).returning();

          // Update webhook event with activity entry link
          await db!.update(githubWebhookEvents).set({ processed: true, activityEntryId: entry.id }).where(eq(githubWebhookEvents.id, event.id));
        }

        // Recalculate health
        await calculateProjectHealth(projectId);

        res.json({ message: `Processed ${results.length} activity entries`, eventId: event.id });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Webhook AI processing error: ${message}`);
        res.json({ message: "Event stored but AI processing failed", eventId: event.id });
      }
    } else {
      res.json({ message: "Event stored (AI tracking disabled)", eventId: event.id });
    }
  });

  // Admin: update health status manually
  app.patch("/api/admin/projects/:id/health", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const { healthStatus, healthNote } = req.body;
    const [updated] = await db.update(clientProjects).set({ healthStatus, healthNote, updatedAt: new Date() })
      .where(eq(clientProjects.id, req.params.id as string)).returning();
    if (!updated) return res.status(404).json({ message: "Proyecto no encontrado" });
    res.json(updated);

    // Notify client about health status change
    {
      const statusLabels: Record<string, string> = { on_track: "en línea", ahead: "adelantado", at_risk: "en riesgo", behind: "atrasado" };
      const statusLabel = statusLabels[healthStatus] || healthStatus;
      notifyProjectClient(updated.id, `${healthStatus === "on_track" || healthStatus === "ahead" ? "✅" : "⚠️"} Tu proyecto está ${statusLabel}`, {
        title: "Actualización de estado",
        headerEmoji: healthStatus === "on_track" || healthStatus === "ahead" ? "✅" : "⚠️",
        headerColor: healthStatus === "on_track" ? "linear-gradient(135deg,#059669,#10B981)" :
          healthStatus === "ahead" ? "linear-gradient(135deg,#0F766E,#2FA4A9)" :
          healthStatus === "at_risk" ? "linear-gradient(135deg,#D97706,#F59E0B)" :
          "linear-gradient(135deg,#DC2626,#EF4444)",
        bodyLines: [
          `El estado de tu proyecto ha sido actualizado a: <strong>${statusLabel}</strong>.`,
          ...(healthNote ? [`<em>"${healthNote}"</em>`] : []),
          "Entra al portal para ver los detalles completos.",
        ],
        ctaText: "Ver mi proyecto →",
      });
    }
  });

  // Admin: trigger manual analysis (fetch recent commits from GitHub API)
  app.post("/api/admin/projects/:id/analyze", requireAuth, async (req, res) => {
    const id = req.params.id as string;
    const [project] = await db!.select().from(clientProjects).where(eq(clientProjects.id, id));
    if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
    if (!project.githubRepoUrl) return res.status(400).json({ message: "No hay repositorio de GitHub configurado" });

    try {
      // Fetch last 20 commits from GitHub API (supports private repos with GITHUB_TOKEN)
      const repoPath = project.githubRepoUrl.replace("https://github.com/", "").replace(/\/$/, "");
      const ghHeaders: Record<string, string> = { "Accept": "application/vnd.github.v3+json", "User-Agent": "IM3-Systems-CRM" };
      if (process.env.GITHUB_TOKEN) ghHeaders["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
      const ghRes = await fetch(`https://api.github.com/repos/${repoPath}/commits?per_page=20`, { headers: ghHeaders });

      if (!ghRes.ok) return res.status(400).json({ message: `GitHub API error: ${ghRes.status}` });

      const ghCommits = await ghRes.json() as Array<{ sha: string; commit: { message: string; author: { date: string } }; files?: Array<{ filename: string }> }>;

      const commits = ghCommits.map(c => ({
        sha: c.sha,
        message: c.commit.message,
        filesChanged: (c.files || []).map(f => f.filename),
        timestamp: c.commit.author.date,
      }));

      const results = await analyzeCommitsForProject(id, commits);

      for (const result of results) {
        await db!.insert(projectActivityEntries).values({
          projectId: id,
          source: "github_webhook",
          commitShas: commits.map(c => c.sha),
          summaryLevel1: result.summaryLevel1,
          summaryLevel2: result.summaryLevel2,
          summaryLevel3: result.summaryLevel3,
          category: result.category,
          aiGenerated: true,
          isSignificant: result.isSignificant,
        });
      }

      await calculateProjectHealth(id);

      res.json({ message: `Análisis completado: ${results.length} entradas generadas`, results: results.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: `Error: ${message}` });
    }
  });

  // Admin: generate weekly summary manually
  app.post("/api/admin/projects/:id/weekly-summary", requireAuth, async (req, res) => {
    const id = req.params.id as string;
    const summary = await generateWeeklySummary(id);
    if (!summary) return res.status(400).json({ message: "No se pudo generar el resumen" });

    // Post as system message
    await db!.insert(projectMessages).values({
      projectId: id,
      senderType: "team",
      senderName: "Resumen semanal",
      content: summary,
    });

    // Update last summary timestamp
    await db!.update(clientProjects).set({ lastWeeklySummaryAt: new Date() }).where(eq(clientProjects.id, id));

    res.json({ message: "Resumen semanal generado", summary });
  });

  // Admin: get activity entries for a project
  app.get("/api/admin/projects/:id/activity", requireAuth, async (req, res) => {
    const entries = await db!.select().from(projectActivityEntries)
      .where(eq(projectActivityEntries.projectId, req.params.id as string))
      .orderBy(desc(projectActivityEntries.createdAt))
      .limit(50);
    res.json(entries);
  });

  // ── Admin: Sessions CRUD ──

  app.get("/api/admin/projects/:id/sessions", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const sessions = await db.select().from(projectSessions)
        .where(eq(projectSessions.projectId, req.params.id as string))
        .orderBy(desc(projectSessions.date));
      res.json(sessions);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/admin/projects/:id/sessions", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [session] = await db.insert(projectSessions).values({
        projectId: req.params.id as string,
        ...req.body,
      }).returning();
      res.json(session);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.patch("/api/admin/sessions/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [updated] = await db.update(projectSessions).set(req.body)
        .where(eq(projectSessions.id, req.params.id as string)).returning();
      if (!updated) return res.status(404).json({ message: "Sesión no encontrada" });
      res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/admin/sessions/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(projectSessions).where(eq(projectSessions.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Admin: Files CRUD ──

  app.get("/api/admin/projects/:id/files", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const files = await db.select().from(projectFiles)
        .where(eq(projectFiles.projectId, req.params.id as string))
        .orderBy(desc(projectFiles.createdAt));
      res.json(files);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/admin/projects/:id/files", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [file] = await db.insert(projectFiles).values({
        projectId: req.params.id as string,
        ...req.body,
      }).returning();
      res.json(file);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/admin/files/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(projectFiles).where(eq(projectFiles.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // Sync Drive files to project
  app.post("/api/admin/projects/:id/sync-drive", requireAuth, async (req, res) => {
    const projectId = req.params.id as string;
    const { folderId } = req.body as { folderId?: string };

    // Use project's stored folderId or the one provided
    let driveId = folderId;
    if (!driveId) {
      const [project] = await db!.select().from(clientProjects).where(eq(clientProjects.id, projectId));
      driveId = project?.driveFolderId || undefined;
    }

    if (!driveId) return res.status(400).json({ message: "No hay carpeta de Drive configurada. Configúrala en el tab Config." });

    try {
      // Save folderId if provided
      if (folderId) {
        await db!.update(clientProjects).set({ driveFolderId: folderId, updatedAt: new Date() }).where(eq(clientProjects.id, projectId));
      }

      const result = await syncDriveFilesToProject(projectId, driveId);
      res.json({ message: `${result.synced} archivos nuevos sincronizados`, ...result });
    } catch (err: unknown) {
      res.status(500).json({ message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // Upload file to Drive + save in projectFiles
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

  app.post("/api/admin/projects/:id/upload", requireAuth, upload.single("file"), async (req, res) => {
    const projectId = req.params.id as string;
    if (!req.file) return res.status(400).json({ message: "No se recibió archivo" });
    if (!db) return res.status(500).json({ message: "DB no disponible" });

    try {
      const [project] = await db.select().from(clientProjects).where(eq(clientProjects.id, projectId));
      if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });

      // Ensure project has a Drive folder
      let folderId = project.driveFolderId;
      if (!folderId) {
        folderId = await createProjectFolder(project.name);
        await db.update(clientProjects).set({ driveFolderId: folderId, updatedAt: new Date() }).where(eq(clientProjects.id, projectId));
      }

      // Upload to Drive
      const { webViewLink } = await uploadFileToDrive(
        folderId,
        req.file.originalname,
        req.file.mimetype,
        req.file.buffer
      );

      // Detect file type
      const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "";
      const mime = req.file.mimetype.toLowerCase();
      let fileType = "other";
      if (mime.includes("pdf") || ext === "pdf") fileType = "document";
      else if (mime.includes("video") || ["mp4", "webm", "mov"].includes(ext)) fileType = "recording";
      else if (mime.includes("audio") || ["mp3", "wav", "m4a"].includes(ext)) fileType = "recording";
      else if (mime.includes("image") || ["png", "jpg", "jpeg", "gif"].includes(ext)) fileType = "image";
      else if (["doc", "docx", "xlsx", "pptx"].includes(ext)) fileType = "document";

      // Override type if provided
      const typeOverride = req.body.type;
      if (typeOverride && typeOverride !== "auto") fileType = typeOverride;

      // Save to DB
      const [file] = await db.insert(projectFiles).values({
        projectId,
        name: req.body.name || req.file.originalname,
        type: fileType,
        url: webViewLink,
        size: req.file.size,
        uploadedBy: "team",
      }).returning();

      res.json(file);
    } catch (err: unknown) {
      res.status(500).json({ message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // ── Admin: Ideas CRUD ──

  app.get("/api/admin/projects/:id/ideas", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const ideas = await db.select().from(projectIdeas)
        .where(eq(projectIdeas.projectId, req.params.id as string))
        .orderBy(desc(projectIdeas.createdAt));
      res.json(ideas);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/admin/projects/:id/ideas", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [idea] = await db.insert(projectIdeas).values({
        projectId: req.params.id as string,
        ...req.body,
      }).returning();
      res.json(idea);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.patch("/api/admin/ideas/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [updated] = await db.update(projectIdeas).set(req.body)
        .where(eq(projectIdeas.id, req.params.id as string)).returning();
      if (!updated) return res.status(404).json({ message: "Idea no encontrada" });
      res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/admin/ideas/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(projectIdeas).where(eq(projectIdeas.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Proposals — Commercial proposal generator
  // ─────────────────────────────────────────────────────────────

  // List proposals
  app.get("/api/admin/proposals", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      // Excluir propuestas en la papelera (deletedAt no null)
      const allProposals = await db.select().from(proposals).where(isNull(proposals.deletedAt)).orderBy(desc(proposals.createdAt));
      // Enrich with contact info
      const enriched = await Promise.all(allProposals.map(async (p) => {
        const [contact] = await db!.select({ nombre: contacts.nombre, empresa: contacts.empresa, email: contacts.email })
          .from(contacts).where(eq(contacts.id, p.contactId)).limit(1);
        return { ...p, contactName: contact?.nombre || "—", contactEmpresa: contact?.empresa || "—", contactEmail: contact?.email || "—" };
      }));
      res.json(enriched);
    } catch (err: any) {
      log(`Error listing proposals: ${err?.message}`);
      res.status(500).json({ error: "Error listando propuestas" });
    }
  });

  // List proposals in trash (soft-deleted)
  app.get("/api/admin/proposals/trash", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const trashed = await db.select().from(proposals)
        .where(sql`${proposals.deletedAt} IS NOT NULL`)
        .orderBy(desc(proposals.deletedAt));
      const enriched = await Promise.all(trashed.map(async (p) => {
        const [contact] = await db!.select({ nombre: contacts.nombre, empresa: contacts.empresa, email: contacts.email })
          .from(contacts).where(eq(contacts.id, p.contactId)).limit(1);
        return { ...p, contactName: contact?.nombre || "—", contactEmpresa: contact?.empresa || "—", contactEmail: contact?.email || "—" };
      }));
      res.json(enriched);
    } catch (err: any) {
      log(`Error listing trash: ${err?.message}`);
      res.status(500).json({ error: "Error listando papelera" });
    }
  });

  // Restore proposal from trash
  app.post("/api/admin/proposals/:id/restore", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [restored] = await db.update(proposals)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(proposals.id, req.params.id as string))
        .returning();
      if (!restored) return res.status(404).json({ error: "Propuesta no encontrada" });
      res.json(restored);
    } catch (err: any) {
      log(`Error restoring proposal: ${err?.message}`);
      res.status(500).json({ error: "Error restaurando propuesta" });
    }
  });

  // Permanent delete (hard delete) — solo para propuestas ya en la papelera
  app.delete("/api/admin/proposals/:id/permanent", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      await db.delete(proposalViews).where(eq(proposalViews.proposalId, req.params.id as string)).catch(() => {});
      await db.delete(proposals).where(eq(proposals.id, req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      log(`Error permanently deleting proposal: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando propuesta" });
    }
  });

  // Get proposal detail
  app.get("/api/admin/proposals/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [proposal] = await db.select().from(proposals).where(eq(proposals.id, req.params.id as string)).limit(1);
      if (!proposal) return res.status(404).json({ error: "Propuesta no encontrada" });
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
      // Get view analytics
      const views = await db.select().from(proposalViews).where(eq(proposalViews.proposalId, proposal.id)).orderBy(desc(proposalViews.createdAt));
      res.json({ ...proposal, contact, views, viewCount: views.length });
    } catch (err: any) {
      log(`Error getting proposal: ${err?.message}`);
      res.status(500).json({ error: "Error obteniendo propuesta" });
    }
  });

  // Create proposal (initially as draft)
  app.post("/api/admin/proposals", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const { contactId, title, notes } = req.body;
      if (!contactId) return res.status(400).json({ error: "contactId requerido" });

      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
      if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

      const proposalTitle = title || `Propuesta para ${contact.empresa || contact.nombre}`;

      const [proposal] = await db.insert(proposals).values({
        contactId,
        title: proposalTitle,
        notes: notes || null,
        status: "draft",
      }).returning();

      res.json(proposal);
    } catch (err: any) {
      log(`Error creating proposal: ${err?.message}`);
      res.status(500).json({ error: "Error creando propuesta" });
    }
  });

  // Update proposal (sections, pricing, timeline, status, etc.)
  app.patch("/api/admin/proposals/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [updated] = await db.update(proposals)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(proposals.id, req.params.id as string))
        .returning();
      if (!updated) return res.status(404).json({ error: "Propuesta no encontrada" });
      res.json(updated);
    } catch (err: any) {
      log(`Error updating proposal: ${err?.message}`);
      res.status(500).json({ error: "Error actualizando propuesta" });
    }
  });

  // Delete proposal
  // Soft-delete: mueve a papelera (recuperable durante 30 días). Para borrado permanente usar /permanent.
  app.delete("/api/admin/proposals/:id", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [deleted] = await db.update(proposals)
        .set({ deletedAt: new Date() })
        .where(eq(proposals.id, req.params.id as string))
        .returning();
      if (!deleted) return res.status(404).json({ error: "Propuesta no encontrada" });
      res.json({ success: true, deletedAt: deleted.deletedAt });
    } catch (err: any) {
      log(`Error deleting proposal: ${err?.message}`);
      res.status(500).json({ error: "Error eliminando propuesta" });
    }
  });

  // Generate/regenerate proposal with AI (new ProposalData schema)
  app.post("/api/admin/proposals/:id/generate", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [proposal] = await db.select().from(proposals).where(eq(proposals.id, req.params.id as string)).limit(1);
      if (!proposal) return res.status(404).json({ error: "Propuesta no encontrada" });

      const result = await generateProposal(proposal.contactId, proposal.notes || req.body?.notes);
      if (!result) return res.status(500).json({ error: "Error generando propuesta con IA" });

      // Nuevo formato: toda la ProposalData va dentro de `sections` (campo JSON libre)
      // El frontend detecta si `sections.meta` existe → usa ProposalTemplate, si no → legacy render
      const [updated] = await db.update(proposals).set({
        sections: result.proposalData as unknown as typeof proposals.$inferInsert["sections"],
        aiSourcesReport: result.sourcesReport as unknown as typeof proposals.$inferInsert["aiSourcesReport"],
        updatedAt: new Date(),
      }).where(eq(proposals.id, proposal.id)).returning();

      res.json(updated);
    } catch (err: any) {
      log(`Error generating proposal: ${err?.message}`);
      res.status(500).json({ error: "Error generando propuesta" });
    }
  });

  // Regenerate ONE section with an admin instruction (much faster than full regen)
  app.post("/api/admin/proposals/:id/sections/:sectionKey/regenerate", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const proposalId = String(req.params.id);
    const sectionKey = String(req.params.sectionKey);
    const instruction = String(req.body?.instruction ?? "").trim();

    if (!instruction) {
      return res.status(400).json({ error: "La instrucción no puede estar vacía" });
    }
    if (instruction.length > 2000) {
      return res.status(400).json({ error: "Instrucción demasiado larga (máx 2000 caracteres)" });
    }

    try {
      const result = await runAgent(
        "proposal-section-regen",
        () => regenerateProposalSection(proposalId, sectionKey, instruction),
        { triggeredBy: "manual" }
      );

      if ("error" in result) {
        return res.status(500).json({ error: result.error });
      }
      res.json({ section: result.section, sectionKey: result.sectionKey });
    } catch (err: any) {
      log(`Error regenerating section: ${err?.message}`);
      res.status(500).json({ error: err?.message || "Error regenerando sección" });
    }
  });

  // Generate 3 options for rewriting a section (user picks one)
  app.post("/api/admin/proposals/:id/sections/:sectionKey/options", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const proposalId = String(req.params.id);
    const sectionKey = String(req.params.sectionKey);
    const instruction = String(req.body?.instruction ?? "").trim();
    if (!instruction) return res.status(400).json({ error: "Instrucción vacía" });

    try {
      const result = await runAgent(
        "proposal-section-options",
        () => generateSectionOptions(proposalId, sectionKey, instruction),
        { triggeredBy: "manual" }
      );
      if ("error" in result) return res.status(500).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error generando opciones" });
    }
  });

  // Apply a chosen option to a section
  app.post("/api/admin/proposals/:id/sections/:sectionKey/apply", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const proposalId = String(req.params.id);
    const sectionKey = String(req.params.sectionKey);
    const sectionData = req.body?.section;
    if (!sectionData) return res.status(400).json({ error: "No section data" });

    try {
      const result = await applySectionOption(proposalId, sectionKey, sectionData);
      if ("error" in result) return res.status(500).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error aplicando opción" });
    }
  });

  // AI field-level rewrite — rewrites a single text field with an instruction
  app.post("/api/admin/ai/rewrite", requireAuth, async (req, res) => {
    const text = String(req.body?.text ?? "").trim();
    const instruction = String(req.body?.instruction ?? "").trim();
    const context = String(req.body?.context ?? "");
    if (!text) return res.status(400).json({ error: "Texto vacío" });
    if (!instruction) return res.status(400).json({ error: "Instrucción vacía" });

    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        temperature: 0.4,
        system: `Reescribe el texto que te dan aplicando la instrucción. Devuelve SOLO el texto reescrito, sin comillas, sin explicaciones, sin markdown. Español latinoamericano. Mantén el mismo tipo de contenido (si es un título corto, devuelve un título corto; si es un párrafo, devuelve un párrafo).`,
        messages: [{
          role: "user",
          content: `${context ? `CONTEXTO: ${context}\n\n` : ""}TEXTO ACTUAL:\n${text}\n\nINSTRUCCIÓN:\n${instruction}\n\nDevuelve SOLO el texto reescrito:`
        }]
      });

      const result = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : text;
      res.json({ text: result });
    } catch (err: any) {
      log(`[ai-rewrite] Error: ${err?.message}`);
      res.status(500).json({ error: err?.message || "Error reescribiendo" });
    }
  });

  // Send proposal (change status + send email)
  app.post("/api/admin/proposals/:id/send", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [proposal] = await db.select().from(proposals).where(eq(proposals.id, req.params.id as string)).limit(1);
      if (!proposal) return res.status(404).json({ error: "Propuesta no encontrada" });

      const [contact] = await db.select().from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
      if (!contact?.email) return res.status(400).json({ error: "El contacto no tiene email" });

      // Update status
      await db.update(proposals).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(proposals.id, proposal.id));

      // Send email
      const baseUrl = process.env.BASE_URL || "https://im3systems.com";
      const proposalUrl = `${baseUrl}/proposal/${proposal.accessToken}`;
      const html = buildProjectNotificationEmail({
        projectName: proposal.title,
        clientName: contact.nombre,
        title: "Propuesta comercial",
        headerEmoji: "📄",
        headerColor: "linear-gradient(135deg,#0F172A,#1E293B)",
        bodyLines: [
          `Te compartimos la propuesta que preparamos para <strong>${contact.empresa || contact.nombre}</strong> basada en nuestras conversaciones y el diagnóstico tecnológico.`,
          "La propuesta incluye el alcance completo, timeline, inversión y ROI estimado. Puedes revisarla online o descargarla como PDF.",
        ],
        ctaText: "Ver propuesta →",
        ctaUrl: proposalUrl,
        footerNote: "Si tienes preguntas, responde a este email o agenda una llamada.",
      });

      await sendEmail(contact.email, `📄 ${proposal.title}`, html).catch((err) => log(`Error sending proposal email: ${err}`));

      // Update contact substatus to proposal_sent
      await db.update(contacts).set({ substatus: "proposal_sent", lastActivityAt: new Date() }).where(eq(contacts.id, contact.id));

      // Schedule follow-up sequence
      const now = new Date();
      const proposalId = proposal.id;

      // +3 days: Reminder if not viewed
      const reminder3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      await db.insert(sentEmails).values({
        contactId: contact.id,
        templateId: "propuesta_recordatorio",
        subject: `¿Tuviste chance de revisar la propuesta, ${contact.nombre.split(" ")[0]}?`,
        status: "pending",
        scheduledFor: reminder3d,
      });

      // +7 days: Value-add follow-up
      const followup7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(sentEmails).values({
        contactId: contact.id,
        templateId: "propuesta_valor",
        subject: `Caso similar al de ${contact.empresa} — resultados reales`,
        status: "pending",
        scheduledFor: followup7d,
      });

      // +14 days: Soft close (creates notification instead of auto-send)
      const close14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      await db.insert(sentEmails).values({
        contactId: contact.id,
        templateId: "propuesta_cierre",
        subject: `¿Hay algo que podamos ajustar en la propuesta, ${contact.nombre.split(" ")[0]}?`,
        status: "pending",
        scheduledFor: close14d,
      });

      // +7 days: WhatsApp follow-up (only if email not opened)
      if (contact.telefono) {
        const wa7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000); // +7d +3h
        await db.insert(whatsappMessages).values({
          contactId: contact.id,
          phone: contact.telefono,
          message: `Hola ${contact.nombre.split(" ")[0]}, te enviamos una propuesta por email hace unos días. ¿Pudiste revisarla? Si prefieres, podemos agendar una llamada rápida para resolverla. 📄`,
          status: "pending",
          scheduledFor: wa7d,
          conditionType: "if_email_not_opened",
          conditionEmailTemplate: "propuesta_valor",
        });
      }

      await logActivity(contact.id, "email_sent", `Propuesta enviada: ${proposal.title} + secuencia de seguimiento programada`, { proposalId });

      log(`Proposal sent to ${contact.email} + 3 follow-ups scheduled`);

      res.json({ success: true, proposalUrl });
    } catch (err: any) {
      log(`Error sending proposal: ${err?.message}`);
      res.status(500).json({ error: "Error enviando propuesta" });
    }
  });

  // Convert proposal to project (AI-generated plan)
  app.post("/api/admin/proposals/:id/convert-to-project", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [proposal] = await db.select().from(proposals).where(eq(proposals.id, req.params.id as string)).limit(1);
      if (!proposal) return res.status(404).json({ error: "Propuesta no encontrada" });
      if (!proposal.contactId) return res.status(400).json({ error: "Propuesta sin contacto asociado" });

      // Warn if contact already has projects (allow but log)
      const existingProjects = await db.select({ id: clientProjects.id }).from(clientProjects)
        .where(eq(clientProjects.contactId, proposal.contactId!)).limit(5);
      if (existingProjects.length > 0) {
        log(`Propuesta ${proposal.id} convertida — contacto ya tiene ${existingProjects.length} proyecto(s)`);
      }

      const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();

      const result = await generateProjectFromProposal({
        id: proposal.id,
        contactId: proposal.contactId,
        title: proposal.title,
        sections: (proposal.sections as Record<string, string>) || {},
        pricing: proposal.pricing as any,
        timelineData: proposal.timelineData as any,
      }, startDate);

      res.json({
        message: "Proyecto creado desde propuesta",
        ...result,
      });
    } catch (err: any) {
      log(`Error converting proposal to project: ${err?.message}`);
      res.status(500).json({ error: err?.message || "Error creando proyecto" });
    }
  });

  // Activate planning project (make portal accessible)
  app.post("/api/admin/projects/:id/activate", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      // Validate project exists and is in planning status
      const [project] = await db.select().from(clientProjects).where(eq(clientProjects.id, req.params.id as string)).limit(1);
      if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });
      if (project.status !== "planning") {
        return res.status(400).json({ error: `Solo proyectos en planeación pueden activarse (estado actual: ${project.status})` });
      }

      const [updated] = await db.update(clientProjects)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(clientProjects.id, req.params.id as string))
        .returning();
      if (!updated) return res.status(404).json({ error: "Proyecto no encontrado" });
      res.json({ message: "Portal activado", projectId: updated.id, portalToken: updated.accessToken });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── Public proposal endpoints (token-based, no auth) ──

  // Get proposal by token (public view)
  app.get("/api/proposal/:token", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [proposal] = await db.select().from(proposals).where(eq(proposals.accessToken, req.params.token as string)).limit(1);
      if (!proposal) return res.status(404).json({ error: "Propuesta no encontrada" });

      // Mark as viewed on first open — ONLY if proposal was already sent to client
      // (skip tracking if admin is previewing before sending)
      if (!proposal.viewedAt && proposal.status === "sent") {
        await db.update(proposals).set({ viewedAt: new Date(), status: "viewed" }).where(eq(proposals.id, proposal.id));
        // Notify admin
        const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
        const [contact2] = await db.select({ nombre: contacts.nombre, empresa: contacts.empresa }).from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
        sendEmail(adminEmail, `👀 Propuesta abierta: ${contact2?.empresa || proposal.title}`, `<p><strong>${contact2?.nombre}</strong> abrió la propuesta "${proposal.title}".</p>`).catch(() => {});
      }

      const [contact] = await db.select({ nombre: contacts.nombre, empresa: contacts.empresa }).from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
      res.json({ ...proposal, contactName: contact?.nombre, contactEmpresa: contact?.empresa });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Accept proposal (public)
  app.post("/api/proposal/:token/accept", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [proposal] = await db.select().from(proposals).where(eq(proposals.accessToken, req.params.token as string)).limit(1);
      if (!proposal) return res.status(404).json({ error: "Propuesta no encontrada" });
      if (proposal.status === "accepted") return res.json({ message: "Ya fue aceptada" });

      const { fullName, selectedOption } = req.body;
      await db.update(proposals).set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedBy: fullName || null,
        acceptedOption: selectedOption || null,
        acceptanceDetails: { ...req.body, ip: req.ip, userAgent: req.headers["user-agent"], timestamp: new Date().toISOString() },
        updatedAt: new Date(),
      }).where(eq(proposals.id, proposal.id));

      // Notify admin
      const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
      const [contact] = await db.select({ nombre: contacts.nombre, empresa: contacts.empresa }).from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
      sendEmail(adminEmail, `✅ Propuesta ACEPTADA: ${contact?.empresa || proposal.title}`,
        `<div style="max-width:600px;margin:0 auto;font-family:sans-serif">
          <div style="background:linear-gradient(135deg,#059669,#10B981);padding:20px 28px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;font-size:18px;margin:0">✅ Propuesta Aceptada</h1>
          </div>
          <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
            <p><strong>${contact?.nombre}</strong> de <strong>${contact?.empresa}</strong> aceptó la propuesta "${proposal.title}".</p>
            ${fullName ? `<p>Firmada por: <strong>${escapeHtml(fullName)}</strong></p>` : ""}
            ${selectedOption ? `<p>Opción elegida: <strong>${escapeHtml(selectedOption)}</strong></p>` : ""}
          </div>
        </div>`
      ).catch(() => {});

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Track view analytics (public) + alertas de alto-intent al admin
  // Health check del subsistema PDF — sirve para diagnosticar deploy desde el browser
  app.get("/api/proposal-pdf/health", async (_req, res) => {
    try {
      const { pdfHealthCheck } = await import("./proposal-pdf");
      const result = await pdfHealthCheck();
      res.json({
        loaded: true,
        ...result,
        env: {
          hasExecutablePath: !!process.env.PUPPETEER_EXECUTABLE_PATH,
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
          nodeEnv: process.env.NODE_ENV,
        },
      });
    } catch (err: any) {
      res.status(503).json({
        loaded: false,
        error: err?.message || String(err),
        stack: err?.stack?.split("\n").slice(0, 5),
      });
    }
  });

  // Genera PDF idéntico al render web (Chrome headless con emulateMediaType('screen'))
  // Import lazy para que si puppeteer/chromium falla en producción solo se rompa
  // este endpoint y no toda la app.
  app.get("/api/proposal/:token/pdf", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const token = String(req.params.token);
      const [proposal] = await db.select().from(proposals).where(eq(proposals.accessToken, token)).limit(1);
      if (!proposal) return res.status(404).json({ error: "Propuesta no encontrada" });

      const [contact] = await db
        .select({ nombre: contacts.nombre, empresa: contacts.empresa })
        .from(contacts)
        .where(eq(contacts.id, proposal.contactId))
        .limit(1);

      let generateProposalPdf: typeof import("./proposal-pdf").generateProposalPdf;
      try {
        ({ generateProposalPdf } = await import("./proposal-pdf"));
      } catch (impErr: any) {
        console.error("[proposal pdf] puppeteer/chromium no disponible:", impErr?.message);
        return res.status(503).json({
          error: "PDF service unavailable",
          detail: "Puppeteer no está instalado o Chromium falta. Verifica el deploy del servidor.",
        });
      }

      const pdf = await generateProposalPdf({ token });
      const safeName = (contact?.empresa || contact?.nombre || "IM3").replace(/[^\w-]+/g, "_");
      // application/octet-stream OBLIGA al browser a descargar (no puede renderizar inline).
      // Algunos browsers (Arc, Chrome con plugin PDF, etc) ignoran Content-Disposition:attachment
      // si el Content-Type es application/pdf y abren el PDF inline. Con octet-stream es
      // universalmente descargado.
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="Propuesta-${safeName}.pdf"`);
      res.setHeader("Content-Length", String(pdf.length));
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(pdf);
    } catch (err: any) {
      console.error("[proposal pdf] error:", err);
      res.status(500).json({ error: err?.message || "Error generando PDF" });
    }
  });

  app.post("/api/proposal/:token/track", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [proposal] = await db.select().from(proposals).where(eq(proposals.accessToken, req.params.token as string)).limit(1);
      if (!proposal) return res.status(404).json({ error: "Not found" });

      const section = req.body.section || null;
      const ip = req.ip || null;

      // Verificar si es primera vez que se abre ESTA propuesta (pre-insert count)
      const [prevCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(proposalViews)
        .where(eq(proposalViews.proposalId, proposal.id));
      const isFirstOpen = (prevCount?.count ?? 0) === 0;

      // Verificar si es primera vez que llega a la sección de alta intención (pricing/operationalCosts/inversion)
      const HIGH_INTENT_SECTIONS = ["inversion", "pricing", "costos-operativos", "operationalCosts", "cta", "aceptar"];
      let isHighIntentFirstTime = false;
      if (section && HIGH_INTENT_SECTIONS.includes(section)) {
        const [intentPrev] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(proposalViews)
          .where(and(
            eq(proposalViews.proposalId, proposal.id),
            eq(proposalViews.section, section)
          ));
        isHighIntentFirstTime = (intentPrev?.count ?? 0) === 0;
      }

      // Insertar el view
      await db.insert(proposalViews).values({
        proposalId: proposal.id,
        section,
        timeSpent: req.body.timeSpent || null,
        device: req.body.device || null,
        ip,
      });

      // Actualizar viewedAt si es primera vez
      if (isFirstOpen && !proposal.viewedAt) {
        await db.update(proposals).set({ viewedAt: new Date() }).where(eq(proposals.id, proposal.id));
      }

      // Alertas al admin (non-blocking)
      if (isFirstOpen || isHighIntentFirstTime) {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, proposal.contactId)).limit(1);
        const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
        const baseUrl = process.env.BASE_URL || "https://im3systems.com";
        const contactName = contact?.nombre || "Cliente";
        const empresa = contact?.empresa || "Empresa";

        try {
          if (isFirstOpen) {
            await db.insert(notifications).values({
              type: "proposal_opened",
              title: `👀 ${contactName} abrió la propuesta`,
              description: `${empresa} acaba de abrir la propuesta por primera vez`,
              contactId: proposal.contactId,
            }).catch(() => {});

            if (isEmailConfigured()) {
              sendEmail(
                adminEmail,
                `👀 ${contactName} (${empresa}) abrió la propuesta`,
                `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
                  <div style="background:#2FA4A9;padding:20px 28px;border-radius:8px 8px 0 0">
                    <h1 style="color:#fff;font-size:18px;margin:0">👀 Propuesta abierta</h1>
                  </div>
                  <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                    <p style="margin:0 0 16px;font-size:14px">
                      <strong>${contactName}</strong> de <strong>${empresa}</strong> acaba de abrir la propuesta
                      <strong>${proposal.title}</strong> por primera vez.
                    </p>
                    <p style="color:#64748B;font-size:13px;margin:0 0 20px">
                      ${section ? `Viendo sección: <strong>${section}</strong>` : "Recién llegó"} · ${req.body.device || "dispositivo desconocido"}
                    </p>
                    <a href="${baseUrl}/admin/proposals/${proposal.id}" style="display:inline-block;background:#2FA4A9;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Ver engagement →</a>
                  </div>
                </div>`
              ).catch(() => {});
            }
          } else if (isHighIntentFirstTime) {
            await db.insert(notifications).values({
              type: "proposal_high_intent",
              title: `🔥 ${contactName} llegó a la sección "${section}"`,
              description: `${empresa} está revisando el precio/costos — señal de alto interés. ¡Haz follow-up ahora!`,
              contactId: proposal.contactId,
            }).catch(() => {});

            if (isEmailConfigured()) {
              sendEmail(
                adminEmail,
                `🔥 HIGH INTENT: ${contactName} está viendo la sección "${section}"`,
                `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
                  <div style="background:#DC2626;padding:20px 28px;border-radius:8px 8px 0 0">
                    <h1 style="color:#fff;font-size:18px;margin:0">🔥 Señal de alto interés</h1>
                  </div>
                  <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
                    <p style="margin:0 0 16px;font-size:14px">
                      <strong>${contactName}</strong> de <strong>${empresa}</strong> está revisando la sección
                      <strong>${section}</strong> de la propuesta <strong>${proposal.title}</strong>.
                    </p>
                    <p style="color:#B91C1C;font-size:14px;font-weight:600;margin:0 0 20px">
                      Este es el momento para mandar un WhatsApp o llamarle — el interés está en pico.
                    </p>
                    ${contact?.telefono ? `<p style="font-size:13px;margin:0 0 16px"><strong>📱 Teléfono:</strong> ${contact.telefono}</p>` : ""}
                    <p style="font-size:13px;margin:0 0 16px"><strong>📧 Email:</strong> ${contact?.email || "—"}</p>
                    <a href="${baseUrl}/admin/contacts/${proposal.contactId}" style="display:inline-block;background:#DC2626;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Ver contacto →</a>
                  </div>
                </div>`
              ).catch(() => {});
            }
          }
        } catch (alertErr) {
          log(`[proposal-track] alert failed (non-blocking): ${alertErr}`);
        }
      }

      res.json({ ok: true });
    } catch { res.json({ ok: true }); }
  });

  // Admin: engagement metrics for a proposal
  app.get("/api/admin/proposals/:id/engagement", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const proposalId = req.params.id as string;
      const views = await db
        .select()
        .from(proposalViews)
        .where(eq(proposalViews.proposalId, proposalId))
        .orderBy(desc(proposalViews.createdAt));

      if (views.length === 0) {
        return res.json({
          totalViews: 0,
          firstOpenedAt: null,
          lastOpenedAt: null,
          uniqueDevices: 0,
          uniqueIps: 0,
          totalTimeSeconds: 0,
          sections: [],
        });
      }

      const uniqueIps = new Set(views.map(v => v.ip).filter(Boolean)).size;
      const uniqueDevices = new Set(views.map(v => v.device).filter(Boolean)).size;
      const totalTimeSeconds = views.reduce((acc, v) => acc + (v.timeSpent || 0), 0);

      // Section breakdown
      const sectionMap = new Map<string, { views: number; timeSpent: number }>();
      for (const v of views) {
        if (!v.section) continue;
        const prev = sectionMap.get(v.section) || { views: 0, timeSpent: 0 };
        prev.views++;
        prev.timeSpent += v.timeSpent || 0;
        sectionMap.set(v.section, prev);
      }
      const sections = Array.from(sectionMap.entries())
        .map(([section, data]) => ({ section, ...data }))
        .sort((a, b) => b.timeSpent - a.timeSpent);

      res.json({
        totalViews: views.length,
        firstOpenedAt: views[views.length - 1].createdAt,
        lastOpenedAt: views[0].createdAt,
        uniqueDevices,
        uniqueIps,
        totalTimeSeconds,
        sections,
      });
    } catch (err: any) {
      log(`Error getting proposal engagement: ${err?.message}`);
      res.status(500).json({ error: err?.message });
    }
  });

  // ───────────────────────────────────────────────────────────────
  // Contact Files / Documents
  // ───────────────────────────────────────────────────────────────

  app.get("/api/admin/contacts/:id/files", requireAuth, async (req, res) => {
    if (!db) return res.json([]);
    try {
      const rows = await db.select().from(contactFiles)
        .where(eq(contactFiles.contactId, req.params.id as string))
        .orderBy(desc(contactFiles.createdAt));
      res.json(rows);
    } catch (err: unknown) {
      res.status(500).json({ error: "Error fetching files" });
    }
  });

  app.post("/api/admin/contacts/:id/files", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const { name, type, url, size, content } = req.body;
    if (!name || !url) return res.status(400).json({ error: "name y url son requeridos" });

    try {
      const [created] = await db.insert(contactFiles).values({
        contactId: req.params.id as string,
        name,
        type: type || "documento",
        url,
        size: size || null,
        content: content || null,
      }).returning();

      await logActivity(req.params.id as string, "contact_edited", `Documento agregado: ${name}`, { fileId: created.id, fileType: type });

      // Auto-sync content from Google Drive if URL is from Google and no content was pasted
      if (!content && (url.includes("google.com") || url.includes("docs.google"))) {
        readGoogleDriveContent(url).then(async (result) => {
          if (!db) return;
          await db.update(contactFiles).set({
            content: result.content,
            driveFileId: result.fileId,
          }).where(eq(contactFiles.id, created.id));
          log(`[Drive Auto-Sync] Content synced for "${name}": ${result.content.length} chars`);
        }).catch(err => {
          log(`[Drive Auto-Sync] Failed for "${name}": ${(err as Error).message}`);
        });
      }

      res.json(created);
    } catch (err: unknown) {
      res.status(500).json({ error: "Error adding file" });
    }
  });

  // Update file content (paste text directly)
  app.patch("/api/admin/contacts/:id/files/:fileId", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const { content, name, type } = req.body;
    try {
      const updates: Record<string, unknown> = {};
      if (content !== undefined) updates.content = content;
      if (name) updates.name = name;
      if (type) updates.type = type;

      const [updated] = await db.update(contactFiles)
        .set(updates)
        .where(eq(contactFiles.id, req.params.fileId as string))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: unknown) {
      res.status(500).json({ error: "Error updating file" });
    }
  });

  // Sync content from Google Drive
  app.post("/api/admin/contacts/:id/files/:fileId/sync-drive", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [file] = await db.select().from(contactFiles).where(eq(contactFiles.id, req.params.fileId as string)).limit(1);
      if (!file) return res.status(404).json({ error: "Not found" });

      if (!file.url.includes("google.com") && !file.url.includes("docs.google")) {
        return res.status(400).json({ error: "URL no es de Google Drive" });
      }

      const result = await readGoogleDriveContent(file.url);

      await db.update(contactFiles).set({
        content: result.content,
        driveFileId: result.fileId,
      }).where(eq(contactFiles.id, file.id));

      await logActivity(req.params.id as string, "contact_edited", `Contenido sincronizado desde Drive: ${file.name}`, { fileId: file.id, chars: result.content.length });

      res.json({ success: true, chars: result.content.length, mimeType: result.mimeType });
    } catch (err: unknown) {
      log(`Error syncing Drive content: ${(err as Error).message}`);
      res.status(500).json({ error: `Error sincronizando: ${(err as Error).message}` });
    }
  });

  app.delete("/api/admin/contacts/:id/files/:fileId", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [deleted] = await db.delete(contactFiles)
        .where(eq(contactFiles.id, req.params.fileId as string))
        .returning();
      if (!deleted) return res.status(404).json({ error: "Not found" });
      await logActivity(req.params.id as string, "contact_edited", `Documento eliminado: ${deleted.name}`);
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: "Error deleting file" });
    }
  });

  // Upload file to Drive for a contact
  app.post("/api/admin/contacts/:id/upload", requireAuth, upload.single("file"), async (req, res) => {
    const contactId = req.params.id as string;
    if (!req.file) return res.status(400).json({ message: "No se recibió archivo" });
    if (!db) return res.status(500).json({ message: "DB no disponible" });

    try {
      // Find Drive folder from diagnostic
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
      if (!contact) return res.status(404).json({ message: "Contacto no encontrado" });

      // Resolve Drive folder: 1) cached on contact, 2) from diagnostic, 3) search/create by empresa
      let folderId: string | null = contact.driveFolderId || null;

      if (!folderId && contact.diagnosticId) {
        const [diag] = await db.select({ googleDriveUrl: diagnostics.googleDriveUrl }).from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId));
        if (diag?.googleDriveUrl) {
          folderId = extractFolderIdFromUrl(diag.googleDriveUrl);
        }
      }

      if (!folderId) {
        folderId = await findOrCreateClientFolder(contact.empresa);
      }

      // Cache folder ID on contact for future uploads
      if (folderId && folderId !== contact.driveFolderId) {
        db.update(contacts)
          .set({ driveFolderId: folderId })
          .where(eq(contacts.id, contactId))
          .catch(() => {});
      }

      // Upload to subfolder if specified
      const subfolder = req.body.subfolder;
      let targetFolderId = folderId;
      if (subfolder) {
        // Create subfolder in the client's folder
        const { google } = await import("googleapis");
        const auth = new google.auth.JWT({
          email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/drive"],
          subject: process.env.GOOGLE_DRIVE_IMPERSONATE || undefined,
        });
        const drive = google.drive({ version: "v3", auth });

        // Check if subfolder already exists
        const existing = await drive.files.list({
          q: `'${folderId}' in parents and name='${subfolder}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: "files(id)",
        });

        if (existing.data.files && existing.data.files.length > 0) {
          targetFolderId = existing.data.files[0].id!;
        } else {
          const folder = await drive.files.create({
            requestBody: { name: subfolder, mimeType: "application/vnd.google-apps.folder", parents: [folderId] },
            fields: "id",
          });
          targetFolderId = folder.data.id!;
        }
      }

      // Upload to Drive
      const { webViewLink } = await uploadFileToDrive(targetFolderId!, req.file.originalname, req.file.mimetype, req.file.buffer);

      // Detect type
      const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "";
      let fileType = req.body.type || "documento";
      if (fileType === "auto") {
        if (["pdf", "doc", "docx"].includes(ext)) fileType = "documento";
        else if (["mp4", "webm", "mov", "mp3", "wav"].includes(ext)) fileType = "grabacion";
        else if (["png", "jpg", "jpeg", "gif"].includes(ext)) fileType = "imagen";
        else fileType = "otro";
      }

      // Save to DB
      const [file] = await db.insert(contactFiles).values({
        contactId,
        name: req.body.name || req.file.originalname,
        type: fileType,
        url: webViewLink,
        size: req.file.size,
        uploadedBy: "team",
      }).returning();

      await logActivity(contactId, "contact_edited", `Documento subido a Drive: ${file.name}`);

      res.json(file);
    } catch (err: unknown) {
      res.status(500).json({ message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // Auditorías per contact (proxy to external service, filtered by company name)
  app.get("/api/admin/contacts/:id/auditorias", requireAuth, async (req, res) => {
    if (!db) return res.json([]);
    const AUDIT_URL = process.env.AUDIT_URL || process.env.AUDIT_GENERATOR_URL;
    if (!AUDIT_URL) return res.json([]);

    try {
      // Get contact's company name for matching
      const [contact] = await db.select({ empresa: contacts.empresa }).from(contacts).where(eq(contacts.id, req.params.id as string)).limit(1);
      if (!contact) return res.json([]);

      const r = await fetch(`${AUDIT_URL}/api/audits`);
      const rawResponse = await r.json();

      // Handle both array and object responses from audit service
      const allAudits: Array<{ company: string; [key: string]: unknown }> = Array.isArray(rawResponse)
        ? rawResponse
        : (rawResponse?.audits || rawResponse?.data || []);

      // Filter by company name (case-insensitive)
      const contactAudits = allAudits.filter((a: { company: string }) =>
        a.company?.toLowerCase().trim() === contact.empresa?.toLowerCase().trim()
      );

      res.json(contactAudits);
    } catch (err: unknown) {
      log(`Error fetching auditorias for contact: ${(err as Error).message}`);
      res.json([]);
    }
  });

  // ───────────────────────────────────────────────────────────────
  // Contact Associated Emails (stakeholders, team members)
  // ───────────────────────────────────────────────────────────────

  // ── Contact cross-links (projects, proposals, sessions) ──

  app.get("/api/admin/contacts/:id/projects", requireAuth, async (req, res) => {
    if (!db) return res.json([]);
    const projects = await db.select().from(clientProjects).where(eq(clientProjects.contactId, req.params.id as string)).orderBy(desc(clientProjects.createdAt));
    const enriched = await Promise.all(projects.map(async (p) => {
      const tasks = await db!.select({ status: projectTasks.status }).from(projectTasks).where(eq(projectTasks.projectId, p.id));
      const completed = tasks.filter(t => t.status === "completed").length;
      return { ...p, progress: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0 };
    }));
    res.json(enriched);
  });

  app.get("/api/admin/contacts/:id/proposals", requireAuth, async (req, res) => {
    if (!db) return res.json([]);
    const results = await db.select().from(proposals).where(eq(proposals.contactId, req.params.id as string)).orderBy(desc(proposals.createdAt));
    res.json(results);
  });

  app.get("/api/admin/contacts/:id/sessions", requireAuth, async (req, res) => {
    if (!db) return res.json([]);
    try {
      const results = await db.select().from(projectSessions).where(eq(projectSessions.contactId, req.params.id as string)).orderBy(desc(projectSessions.date));
      res.json(results);
    } catch { res.json([]); }
  });

  // WhatsApp messages history for a contact
  app.get("/api/admin/contacts/:id/whatsapp-messages", requireAuth, async (req, res) => {
    if (!db) return res.json([]);
    try {
      const rows = await db.select().from(whatsappMessages)
        .where(eq(whatsappMessages.contactId, req.params.id as string))
        .orderBy(asc(whatsappMessages.scheduledFor))
        .limit(100);
      res.json(rows);
    } catch { res.json([]); }
  });

  // Appointments/meetings for a contact (all types)
  app.get("/api/admin/contacts/:id/appointments", requireAuth, async (req, res) => {
    if (!db) return res.json([]);
    try {
      const rows = await db.select().from(appointments)
        .where(eq(appointments.contactId, req.params.id as string))
        .orderBy(desc(appointments.createdAt));
      res.json(rows);
    } catch { res.json([]); }
  });

  // List associated emails for a contact
  app.get("/api/admin/contacts/:id/associated-emails", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const rows = await db.select().from(contactEmails)
        .where(eq(contactEmails.contactId, req.params.id as string))
        .orderBy(desc(contactEmails.createdAt));
      res.json(rows);
    } catch (err: unknown) {
      res.status(500).json({ error: "Error fetching associated emails" });
    }
  });

  // Add associated email to a contact
  app.post("/api/admin/contacts/:id/associated-emails", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const { email, nombre, role } = req.body;
    if (!email) return res.status(400).json({ error: "Email es requerido" });

    try {
      const [created] = await db.insert(contactEmails).values({
        contactId: req.params.id as string,
        email: email.toLowerCase().trim(),
        nombre: nombre || null,
        role: role || null,
      }).returning();

      await logActivity(req.params.id as string, "contact_edited", `Email asociado agregado: ${email}${nombre ? ` (${nombre})` : ""}`, { associatedEmailId: created.id });

      res.json(created);
    } catch (err: unknown) {
      log(`Error adding associated email: ${(err as Error).message}`);
      res.status(500).json({ error: "Error adding associated email" });
    }
  });

  // Delete associated email
  app.delete("/api/admin/contacts/:id/associated-emails/:emailId", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [deleted] = await db.delete(contactEmails)
        .where(eq(contactEmails.id, req.params.emailId as string))
        .returning();

      if (!deleted) return res.status(404).json({ error: "Not found" });

      await logActivity(req.params.id as string, "contact_edited", `Email asociado eliminado: ${deleted.email}`);

      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: "Error deleting associated email" });
    }
  });

  // ───────────────────────────────────────────────────────────────
  // Gmail Sync — Email Timeline
  // ───────────────────────────────────────────────────────────────

  // Unified email timeline for a contact (Gmail + Resend merged)
  app.get("/api/admin/contacts/:id/email-timeline", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const contactId = req.params.id as string;

    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

      // Fetch Resend-sent emails
      const resendRows = await db
        .select()
        .from(sentEmails)
        .where(eq(sentEmails.contactId, contactId))
        .orderBy(desc(sentEmails.scheduledFor))
        .limit(limit);

      // Fetch Gmail emails
      const gmailRows = await db
        .select()
        .from(gmailEmails)
        .where(eq(gmailEmails.contactId, contactId))
        .orderBy(desc(gmailEmails.gmailDate))
        .limit(limit);

      // Map to unified shape
      type UnifiedEmail = {
        id: string;
        source: "resend" | "gmail";
        direction: "inbound" | "outbound";
        subject: string | null;
        bodyHtml: string | null;
        bodyText: string | null;
        snippet: string | null;
        status: string | null;
        date: string;
        templateName: string | null;
        gmailThreadId: string | null;
        hasAttachments: boolean;
        fromEmail: string | null;
      };

      const resendItems: UnifiedEmail[] = resendRows.filter(e => e.status !== "pending").map(e => ({
        id: e.id,
        source: "resend",
        direction: "outbound",
        subject: e.subject,
        bodyHtml: e.body,
        bodyText: null,
        snippet: null,
        status: e.status,
        date: (e.sentAt || e.scheduledFor).toISOString(),
        templateName: e.templateId,
        gmailThreadId: null,
        hasAttachments: false,
        fromEmail: null,
      }));

      const gmailItems: UnifiedEmail[] = gmailRows.map(e => ({
        id: e.id,
        source: "gmail",
        direction: e.direction as "inbound" | "outbound",
        subject: e.subject,
        bodyHtml: e.bodyHtml,
        bodyText: e.bodyText,
        snippet: e.snippet,
        status: null,
        date: e.gmailDate.toISOString(),
        templateName: null,
        gmailThreadId: e.gmailThreadId,
        hasAttachments: e.hasAttachments,
        fromEmail: e.fromEmail,
      }));

      // Merge and sort by date descending
      const timeline = [...resendItems, ...gmailItems].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      res.json(timeline);
    } catch (err: unknown) {
      log(`Error fetching email timeline: ${(err as Error).message}`);
      res.status(500).json({ error: "Error fetching email timeline" });
    }
  });

  // Unlink a Gmail email from a contact
  app.patch("/api/admin/gmail-emails/:emailId/unlink", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const emailId = req.params.emailId as string;

    try {
      // Get email before unlinking (for activity log)
      const [email] = await db
        .select({ id: gmailEmails.id, contactId: gmailEmails.contactId, subject: gmailEmails.subject })
        .from(gmailEmails)
        .where(eq(gmailEmails.id, emailId))
        .limit(1);

      if (!email) return res.status(404).json({ error: "Email not found" });

      // Log activity before unlinking
      if (email.contactId) {
        await db.insert(activityLog).values({
          contactId: email.contactId,
          type: "email_unlinked",
          description: `Email desvinculado manualmente: "${(email.subject || "Sin asunto").substring(0, 80)}"`,
          metadata: { gmailEmailId: emailId },
        }).catch(() => {});
      }

      // Unlink: clear contactId, set manuallyUnlinked flag
      const [updated] = await db
        .update(gmailEmails)
        .set({ contactId: null, matchMethod: null, manuallyUnlinked: true })
        .where(eq(gmailEmails.id, emailId))
        .returning();

      res.json(updated);
    } catch (err: unknown) {
      log(`Error unlinking email: ${(err as Error).message}`);
      res.status(500).json({ error: "Error unlinking email" });
    }
  });

  // Relink a Gmail email to a different contact
  app.patch("/api/admin/gmail-emails/:emailId/relink", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    const emailId = req.params.emailId as string;
    const { contactId } = req.body as { contactId: string };

    if (!contactId) return res.status(400).json({ error: "contactId is required" });

    try {
      // Validate contact exists
      const [contact] = await db
        .select({ id: contacts.id, nombre: contacts.nombre })
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);

      if (!contact) return res.status(404).json({ error: "Contact not found" });

      // Validate email exists
      const [email] = await db
        .select({ id: gmailEmails.id, subject: gmailEmails.subject })
        .from(gmailEmails)
        .where(eq(gmailEmails.id, emailId))
        .limit(1);

      if (!email) return res.status(404).json({ error: "Email not found" });

      // Relink
      const [updated] = await db
        .update(gmailEmails)
        .set({ contactId, matchMethod: "manual", manuallyUnlinked: false })
        .where(eq(gmailEmails.id, emailId))
        .returning();

      // Log activity on new contact
      await db.insert(activityLog).values({
        contactId,
        type: "email_linked",
        description: `Email vinculado manualmente: "${(email.subject || "Sin asunto").substring(0, 80)}"`,
        metadata: { gmailEmailId: emailId },
      }).catch(() => {});

      res.json(updated);
    } catch (err: unknown) {
      log(`Error relinking email: ${(err as Error).message}`);
      res.status(500).json({ error: "Error relinking email" });
    }
  });

  // Manual Gmail sync trigger
  app.post("/api/admin/gmail-sync", requireAuth, async (req, res) => {
    if (!isGmailConfigured()) {
      return res.status(400).json({ error: "Gmail not configured" });
    }
    try {
      const result = await syncGmailEmails();
      res.json(result);
    } catch (err: unknown) {
      log(`Manual Gmail sync error: ${(err as Error).message}`);
      res.status(500).json({ error: "Gmail sync failed" });
    }
  });

  // Gmail sync status
  app.get("/api/admin/gmail-sync-status", requireAuth, async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [state] = await db.select().from(gmailSyncState).limit(1);
      res.json(state || { lastSyncAt: null, lastHistoryId: null });
    } catch (err: unknown) {
      res.status(500).json({ error: "Error fetching sync status" });
    }
  });

  // Seed test contact with full diagnostic for proposal testing
  app.post("/api/admin/seed-test-contact", requireAuth, async (_req, res) => {
    if (!db) return res.status(500).json({ error: "DB not configured" });
    try {
      const [existing] = await db.select().from(contacts).where(eq(contacts.email, "carlos@caferoma.co")).limit(1);
      if (existing) return res.json({ message: "Contacto de prueba ya existe", contactId: existing.id });

      const [diag] = await db.insert(diagnostics).values({
        fechaCita: "2026-04-05",
        horaCita: "10:00 AM",
        empresa: "Café & Aroma S.A.S",
        industria: "Alimentos y bebidas / Cafeterías",
        anosOperacion: "8 años",
        empleados: "25-50",
        ciudades: "Bogotá, Medellín",
        participante: "Carlos Méndez",
        email: "carlos@caferoma.co",
        telefono: "+57 310 555 1234",
        // Step 2
        objetivos: ["Automatizar pedidos a proveedores", "Visibilidad de inventario en tiempo real", "Reducir desperdicio de insumos"],
        resultadoEsperado: "Un sistema que me diga cuándo pedir, cuánto pedir, y que conecte las 3 sedes para ver el inventario en tiempo real. Reducir desperdicio al menos 50%.",
        // Step 3
        productos: "Café especial, bebidas, repostería artesanal, almuerzos ejecutivos",
        volumenMensual: "3000-5000 transacciones/mes entre las 3 sedes",
        clientePrincipal: "B2C",
        // Step 4
        canalesAdquisicion: ["Redes sociales", "Referidos", "Ubicación física"],
        canalPrincipal: "Ubicación física y Google Maps",
        // Step 5
        herramientas: "Excel para inventario, WhatsApp para pedidos a proveedores, POS básico en cada sede, Instagram para marketing",
        conectadas: "No",
        // Step 6
        nivelTech: "Básico — usamos herramientas estándar pero no están conectadas",
        usaIA: "No",
        comodidadTech: "Media — dispuesto a aprender si es intuitivo",
        familiaridad: { automatizacion: "Bajo", crm: "Bajo", ia: "Bajo", integracion: "Bajo", desarrollo: "Ninguno" },
        // Step 7
        areaPrioridad: ["Gestión de inventario", "Automatización de pedidos", "Reportes y analytics"],
        presupuesto: "$5,000 - $10,000 USD",
        meetLink: null,
      }).returning();

      const [contact] = await db.insert(contacts).values({
        nombre: "Carlos Méndez",
        empresa: "Café & Aroma S.A.S",
        email: "carlos@caferoma.co",
        telefono: "+57 310 555 1234",
        diagnosticId: diag.id,
        status: "scheduled",
        leadScore: 75,
      }).returning();

      // Add some notes
      await db.insert(contactNotes).values({
        contactId: contact.id,
        content: "Carlos tiene 3 sedes en Bogotá y 1 en Medellín. Su mayor dolor es el desperdicio de café e insumos porque no tienen visibilidad del inventario. Pide pedidos por WhatsApp a 5 proveedores diferentes. Quiere un sistema que le diga cuándo pedir y cuánto.",
      });

      await db.insert(contactNotes).values({
        contactId: contact.id,
        content: "En la reunión mencionó que pierde aprox $800 USD/mes en desperdicio de insumos. Su equipo dedica 15 horas/semana a gestionar pedidos manualmente. Está dispuesto a invertir si ve ROI claro en 3-4 meses.",
      });

      res.json({ message: "Contacto de prueba creado: Carlos Méndez (Café & Aroma)", contactId: contact.id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Dashboard de Agentes — visualizar y operar los servicios
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/admin/agents", requireAuth, async (_req, res) => {
    if (!db) return res.status(503).json({ error: "Database not configured" });
    try {
      const recent = await db
        .select()
        .from(agentRuns)
        .orderBy(desc(agentRuns.startedAt))
        .limit(500);

      const byAgent = new Map<string, typeof recent>();
      for (const run of recent) {
        const arr = byAgent.get(run.agentName) ?? [];
        arr.push(run);
        byAgent.set(run.agentName, arr);
      }

      const agents = AGENT_REGISTRY.map((def) => {
        const runs = byAgent.get(def.name) ?? [];
        const lastRun = runs[0] ?? null;
        const last10 = runs.slice(0, 10);
        const errorCount = last10.filter((r) => r.status === "error").length;
        const successCount = last10.filter((r) => r.status === "success").length;

        let health: "healthy" | "warning" | "error" | "idle" = "idle";
        if (lastRun) {
          if (lastRun.status === "error") {
            health = def.criticality === "critical" ? "error" : "warning";
          } else if (errorCount >= 3) {
            health = "warning";
          } else {
            health = "healthy";
          }
        }

        return {
          ...def,
          runnable: undefined,
          hasRunnable: typeof def.runnable === "function",
          health,
          lastRun: lastRun
            ? {
                id: lastRun.id,
                status: lastRun.status,
                startedAt: lastRun.startedAt,
                completedAt: lastRun.completedAt,
                durationMs: lastRun.durationMs,
                recordsProcessed: lastRun.recordsProcessed,
                errorMessage: lastRun.errorMessage,
                triggeredBy: lastRun.triggeredBy,
              }
            : null,
          stats: {
            last10Success: successCount,
            last10Error: errorCount,
            last10Total: last10.length,
          },
        };
      });

      const summary = {
        total: agents.length,
        healthy: agents.filter((a) => a.health === "healthy").length,
        warning: agents.filter((a) => a.health === "warning").length,
        error: agents.filter((a) => a.health === "error").length,
        idle: agents.filter((a) => a.health === "idle").length,
      };

      res.json({ agents, domains: AGENT_DOMAINS, summary });
    } catch (err: any) {
      log(`Error fetching agents: ${err?.message}`);
      res.status(500).json({ error: err?.message });
    }
  });

  app.get("/api/admin/agents/:name/runs", requireAuth, async (req, res) => {
    if (!db) return res.status(503).json({ error: "Database not configured" });
    const name = String(req.params.name);
    const def = findAgent(name);
    if (!def) return res.status(404).json({ error: "Agent not found" });

    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
      const runs = await db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.agentName, name))
        .orderBy(desc(agentRuns.startedAt))
        .limit(limit);

      res.json({
        agent: { ...def, runnable: undefined, hasRunnable: typeof def.runnable === "function" },
        runs,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.post("/api/admin/agents/:name/run", requireAuth, async (req, res) => {
    const name = String(req.params.name);
    const def = findAgent(name);
    if (!def) return res.status(404).json({ error: "Agent not found" });
    if (typeof def.runnable !== "function") {
      return res.status(400).json({ error: "Este agente no soporta ejecución manual" });
    }

    // Fire and return immediately — el agente puede tardar. El dashboard refresca cada 30s.
    runAgent(name, def.runnable, { triggeredBy: "manual" }).catch((err) =>
      log(`Manual agent ${name} failed: ${err?.message}`)
    );

    res.json({ message: `Agente ${def.displayName} disparado`, name });
  });

  return httpServer;
}
