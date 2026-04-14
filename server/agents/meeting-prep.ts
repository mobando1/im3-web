import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import {
  appointments,
  contacts,
  diagnostics,
  sentEmails,
  contactNotes,
} from "@shared/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { sendEmail, isEmailConfigured } from "../email-sender";
import { parseFechaCita } from "../date-utils";
import { log } from "../index";
import { getIndustriaLabel } from "@shared/industrias";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

type MeetingBrief = {
  contactSummary: string;
  meetingPurpose: string;
  talkingPoints: string[];
  likelyObjections: Array<{ objection: string; response: string }>;
  keyQuestions: string[];
};

export async function runMeetingPrep(): Promise<{ recordsProcessed: number }> {
  if (!db || !isEmailConfigured()) return { recordsProcessed: 0 };
  const anthropic = getClient();
  if (!anthropic) return { recordsProcessed: 0 };

  const now = Date.now();
  const windowStart = now + 2 * 60 * 60 * 1000;
  const windowEnd = now + 3 * 60 * 60 * 1000;

  const candidates = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.status, "scheduled"), isNull(appointments.prepSentAt)));

  const dueAppointments = candidates.filter((apt) => {
    try {
      const aptTime = parseFechaCita(apt.date, apt.time).getTime();
      return aptTime >= windowStart && aptTime <= windowEnd;
    } catch {
      return false;
    }
  });

  if (dueAppointments.length === 0) return { recordsProcessed: 0 };

  log(`[meeting-prep] generando brief para ${dueAppointments.length} reunión(es)`);

  let sent = 0;
  for (const apt of dueAppointments) {
    try {
      const contextData = apt.contactId ? await gatherContext(apt.contactId) : null;
      const brief = await generateBrief(anthropic, apt, contextData);
      await sendBriefEmail(apt, brief, contextData);
      await db
        .update(appointments)
        .set({ prepSentAt: new Date() })
        .where(eq(appointments.id, apt.id));
      sent++;
    } catch (err) {
      log(`[meeting-prep] falló para appointment ${apt.id}: ${err}`);
    }
  }

  return { recordsProcessed: sent };
}

async function gatherContext(contactId: string) {
  if (!db) return null;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) return null;

  const [diag] = contact.diagnosticId
    ? await db.select().from(diagnostics).where(eq(diagnostics.id, contact.diagnosticId)).limit(1)
    : [null];

  const recentEmails = await db
    .select()
    .from(sentEmails)
    .where(eq(sentEmails.contactId, contactId))
    .orderBy(desc(sentEmails.scheduledFor))
    .limit(10);

  const notes = await db
    .select()
    .from(contactNotes)
    .where(eq(contactNotes.contactId, contactId))
    .orderBy(desc(contactNotes.createdAt))
    .limit(5);

  const priorMeetings = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.contactId, contactId), eq(appointments.status, "completed")))
    .orderBy(desc(appointments.completedAt))
    .limit(3);

  return { contact, diag: diag ?? null, recentEmails, notes, priorMeetings };
}

async function generateBrief(
  anthropic: Anthropic,
  apt: typeof appointments.$inferSelect,
  ctx: Awaited<ReturnType<typeof gatherContext>>
): Promise<MeetingBrief> {
  const contact = ctx?.contact;
  const diag = ctx?.diag;

  const prompt = `Eres un asistente de ventas consultivas que prepara a un consultor antes de cada reunión. Genera un brief conciso y accionable.

═══ REUNIÓN ═══
Título: ${apt.title}
Fecha/Hora: ${apt.date} ${apt.time}
Duración: ${apt.duration} min
Notas del admin: ${apt.notes ?? "(ninguna)"}
Tipo: ${apt.appointmentType}

═══ CONTACTO ═══
${contact ? `Nombre: ${contact.nombre}
Empresa: ${contact.empresa}
Email: ${contact.email}
Idioma: ${contact.idioma}
Status: ${contact.status} (${contact.substatus ?? "sin substatus"})
Lead score: ${contact.leadScore}` : "(sin contacto asociado)"}

═══ DIAGNÓSTICO ═══
${diag ? [
  `Industria: ${getIndustriaLabel(diag.industria)}${diag.industria === "otro" && diag.industriaOtro ? ` (${diag.industriaOtro})` : ""}`,
  `Empleados: ${diag.empleados}`,
  `Participante: ${diag.participante}`,
  diag.objetivos && (diag.objetivos as string[]).length ? `Objetivos: ${(diag.objetivos as string[]).join(", ")}` : null,
  diag.productos ? `Productos/servicios: ${diag.productos}` : null,
  diag.volumenMensual ? `Volumen mensual: ${diag.volumenMensual}` : null,
  diag.canalesAdquisicion && (diag.canalesAdquisicion as string[]).length ? `Canales: ${(diag.canalesAdquisicion as string[]).join(", ")}` : null,
  diag.herramientas ? `Herramientas: ${diag.herramientas}` : null,
  diag.nivelTech ? `Madurez tech: ${diag.nivelTech}` : null,
  diag.usaIA ? `Usa IA: ${diag.usaIA}` : null,
  `Área prioridad: ${(diag.areaPrioridad ?? []).join(", ")}`,
  `Presupuesto: ${diag.presupuesto}`,
  diag.phase2CompletedAt ? null : "(⚠ Fase 2 del formulario no completada — la info de operación y stack puede estar vacía)",
].filter(Boolean).join("\n") : "(sin diagnóstico)"}

═══ HISTORIAL DE EMAILS ═══
${(ctx?.recentEmails ?? []).slice(0, 5).map((e) => `- [${e.status}] ${e.subject ?? "(sin asunto)"} (${new Date(e.scheduledFor).toLocaleDateString("es-CO")})`).join("\n") || "(sin emails)"}

═══ NOTAS INTERNAS ═══
${(ctx?.notes ?? []).map((n) => `- ${n.content.substring(0, 200)}`).join("\n") || "(sin notas)"}

═══ REUNIONES PREVIAS ═══
${(ctx?.priorMeetings ?? []).map((m) => `- ${m.date} ${m.time}: ${m.title} (${m.notes?.substring(0, 150) ?? "sin notas"})`).join("\n") || "(primera reunión)"}

Genera un brief práctico. Responde SOLO con JSON válido, sin markdown:
{
  "contactSummary": "2 oraciones: quién es y qué busca",
  "meetingPurpose": "1 oración sobre el propósito probable de esta reunión específica",
  "talkingPoints": ["3 puntos prioritarios, concretos, no genéricos"],
  "likelyObjections": [{"objection": "objeción probable", "response": "cómo responderla"}],
  "keyQuestions": ["5 preguntas clave que descubran información valiosa sobre sus problemas/necesidades"]
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      contactSummary: parsed.contactSummary ?? "",
      meetingPurpose: parsed.meetingPurpose ?? "",
      talkingPoints: parsed.talkingPoints ?? [],
      likelyObjections: parsed.likelyObjections ?? [],
      keyQuestions: parsed.keyQuestions ?? [],
    };
  } catch (err) {
    log(`[meeting-prep] no pudo parsear brief: ${err}`);
    return {
      contactSummary: "Error generando brief",
      meetingPurpose: "",
      talkingPoints: [],
      likelyObjections: [],
      keyQuestions: [],
    };
  }
}

async function sendBriefEmail(
  apt: typeof appointments.$inferSelect,
  brief: MeetingBrief,
  ctx: Awaited<ReturnType<typeof gatherContext>>
) {
  const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";
  const contact = ctx?.contact;

  const objectionsHtml = brief.likelyObjections
    .map(
      (o) => `<div style="background:#FEF3C7;border-left:3px solid #F59E0B;padding:10px 14px;border-radius:4px;margin-bottom:8px">
      <p style="margin:0 0 4px;font-weight:600;font-size:13px;color:#92400E">"${escapeHtml(o.objection)}"</p>
      <p style="margin:0;font-size:13px;color:#78350F">→ ${escapeHtml(o.response)}</p>
    </div>`
    )
    .join("");

  const pointsHtml = brief.talkingPoints
    .map((p, i) => `<li style="margin-bottom:8px;font-size:14px;color:#0F172A"><strong>${i + 1}.</strong> ${escapeHtml(p)}</li>`)
    .join("");

  const questionsHtml = brief.keyQuestions
    .map((q) => `<li style="margin-bottom:6px;font-size:13px;color:#334155">${escapeHtml(q)}</li>`)
    .join("");

  const html = `<div style="max-width:640px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
    <div style="background:linear-gradient(135deg,#2FA4A9,#1E7A7F);padding:24px 28px;border-radius:8px 8px 0 0">
      <p style="color:#fff;opacity:0.85;margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase">Brief de reunión · en 2-3 horas</p>
      <h1 style="color:#fff;font-size:20px;margin:6px 0 0">${escapeHtml(contact?.nombre ?? apt.title)}</h1>
      <p style="color:#fff;opacity:0.9;margin:4px 0 0;font-size:14px">${escapeHtml(contact?.empresa ?? "")} · ${apt.date} ${apt.time}</p>
    </div>
    <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">

      <div style="background:#F1F5F9;padding:16px;border-radius:8px;margin-bottom:20px">
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.5">${escapeHtml(brief.contactSummary)}</p>
        ${brief.meetingPurpose ? `<p style="margin:10px 0 0;font-size:13px;color:#64748B;font-style:italic">${escapeHtml(brief.meetingPurpose)}</p>` : ""}
      </div>

      <h3 style="margin:0 0 12px;font-size:15px;color:#0F172A">🎯 Talking points</h3>
      <ol style="margin:0 0 24px;padding-left:0;list-style:none">${pointsHtml}</ol>

      ${
        objectionsHtml
          ? `<h3 style="margin:0 0 12px;font-size:15px;color:#0F172A">⚠️ Objeciones probables</h3>
             <div style="margin-bottom:24px">${objectionsHtml}</div>`
          : ""
      }

      <h3 style="margin:0 0 12px;font-size:15px;color:#0F172A">❓ Preguntas clave</h3>
      <ul style="margin:0 0 24px;padding-left:20px">${questionsHtml}</ul>

      <div style="padding-top:20px;border-top:1px solid #E2E8F0;display:flex;gap:8px;flex-wrap:wrap">
        ${apt.meetLink ? `<a href="${apt.meetLink}" style="background:#10B981;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Abrir Meet →</a>` : ""}
        ${contact ? `<a href="${baseUrl}/admin/contacts/${contact.id}" style="background:#2FA4A9;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Ver contacto en CRM →</a>` : ""}
      </div>

      <p style="color:#94A3B8;font-size:12px;margin-top:24px;text-align:center">— Meeting Prep Agent · IM3 Systems</p>
    </div>
  </div>`;

  await sendEmail(
    adminEmail,
    `🎯 Brief: ${contact?.nombre ?? apt.title} — ${apt.time}`,
    html
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
