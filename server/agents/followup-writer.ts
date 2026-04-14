import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import {
  appointments,
  contacts,
  diagnostics,
  sentEmails,
  contactNotes,
} from "@shared/schema";
import { and, eq, isNull, desc, gte, lte, isNotNull } from "drizzle-orm";
import { sendEmail, isEmailConfigured } from "../email-sender";
import { log } from "../index";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

type FollowupDraft = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  keyPoints: string[];
};

export async function runFollowupWriter(): Promise<{ recordsProcessed: number }> {
  if (!db || !isEmailConfigured()) return { recordsProcessed: 0 };
  const anthropic = getClient();
  if (!anthropic) return { recordsProcessed: 0 };

  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  const completed = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.status, "completed"),
        isNotNull(appointments.completedAt),
        lte(appointments.completedAt, oneHourAgo),
        gte(appointments.completedAt, twentyFourHoursAgo),
        isNull(appointments.followupDraftedAt)
      )
    );

  if (completed.length === 0) return { recordsProcessed: 0 };

  log(`[followup-writer] generando follow-up para ${completed.length} reunión(es) completadas`);

  let drafted = 0;
  for (const apt of completed) {
    try {
      const ctx = apt.contactId ? await gatherContext(apt.contactId) : null;
      if (!ctx) {
        // No podemos generar follow-up sin contacto; marcar para no reintentar
        await db
          .update(appointments)
          .set({ followupDraftedAt: new Date() })
          .where(eq(appointments.id, apt.id));
        continue;
      }
      const draft = await generateDraft(anthropic, apt, ctx);
      await sendDraftEmail(apt, ctx, draft);
      await db
        .update(appointments)
        .set({ followupDraftedAt: new Date() })
        .where(eq(appointments.id, apt.id));
      drafted++;
    } catch (err) {
      log(`[followup-writer] falló para appointment ${apt.id}: ${err}`);
    }
  }

  return { recordsProcessed: drafted };
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
    .limit(5);

  const notes = await db
    .select()
    .from(contactNotes)
    .where(eq(contactNotes.contactId, contactId))
    .orderBy(desc(contactNotes.createdAt))
    .limit(5);

  return { contact, diag: diag ?? null, recentEmails, notes };
}

async function generateDraft(
  anthropic: Anthropic,
  apt: typeof appointments.$inferSelect,
  ctx: NonNullable<Awaited<ReturnType<typeof gatherContext>>>
): Promise<FollowupDraft> {
  const { contact, diag, notes } = ctx;

  let transcriptionSnippet = "";
  if (apt.transcriptUrl) {
    // Si hay transcripción disponible como URL, la admin puede pegarla en notas
    // Por ahora usamos solo las notas explícitas del admin
    transcriptionSnippet = `\nTranscripción disponible en: ${apt.transcriptUrl}`;
  }

  const language = contact.idioma === "en" ? "inglés" : "español";

  const prompt = `Eres un consultor senior que acaba de salir de una reunión y está escribiendo el follow-up al cliente. Tu tono es profesional pero cercano, concreto, orientado a próximos pasos.

═══ REUNIÓN ═══
Título: ${apt.title}
Fecha: ${apt.date} ${apt.time}
Duración: ${apt.duration} min
Notas del consultor: ${apt.notes ?? "(sin notas)"}
${transcriptionSnippet}

═══ CLIENTE ═══
Nombre: ${contact.nombre}
Empresa: ${contact.empresa}
Email: ${contact.email}
${diag ? `Industria: ${diag.industria} · Empleados: ${diag.empleados}
Objetivos: ${(diag.objetivos ?? []).join(", ")}
Resultado esperado: ${diag.resultadoEsperado}
Áreas prioritarias: ${(diag.areaPrioridad ?? []).join(", ")}` : ""}

═══ NOTAS INTERNAS PREVIAS ═══
${notes.map((n) => `- ${n.content.substring(0, 200)}`).join("\n") || "(sin notas)"}

Genera un email de follow-up en ${language}. Debe:
- Agradecer la reunión específicamente (no genérico)
- Recapitular 2-3 puntos clave de lo hablado (usar las notas del consultor como base)
- Definir próximos pasos CONCRETOS con fechas/compromisos si los hay
- Cerrar con pregunta abierta o invitación a siguiente paso
- Tono: profesional, humano, sin formalismos excesivos ("saludos cordiales" NO)
- Longitud: 150-250 palabras máximo

Responde SOLO con JSON válido, sin markdown:
{
  "subject": "Subject line específico y atractivo (no 'Follow-up de nuestra reunión')",
  "bodyText": "Cuerpo completo del email en texto plano con saltos de línea \\n\\n entre párrafos",
  "bodyHtml": "Mismo cuerpo pero en HTML simple con <p> entre párrafos, <strong> para énfasis",
  "keyPoints": ["3 puntos clave que el consultor debe validar antes de enviar"]
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text.trim() : "{}";
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      subject: parsed.subject ?? `Seguimiento: ${apt.title}`,
      bodyText: parsed.bodyText ?? "",
      bodyHtml: parsed.bodyHtml ?? "",
      keyPoints: parsed.keyPoints ?? [],
    };
  } catch (err) {
    log(`[followup-writer] no pudo parsear draft: ${err}`);
    return {
      subject: `Seguimiento: ${apt.title}`,
      bodyText: "Error generando borrador. Genera manualmente.",
      bodyHtml: "<p>Error generando borrador. Genera manualmente.</p>",
      keyPoints: [],
    };
  }
}

async function sendDraftEmail(
  apt: typeof appointments.$inferSelect,
  ctx: NonNullable<Awaited<ReturnType<typeof gatherContext>>>,
  draft: FollowupDraft
) {
  const adminEmail = process.env.ADMIN_EMAIL || "info@im3systems.com";
  const baseUrl = process.env.BASE_URL || "https://im3systems.com";
  const { contact } = ctx;

  const keyPointsHtml = draft.keyPoints
    .map((p) => `<li style="margin-bottom:6px;font-size:13px;color:#334155">${escapeHtml(p)}</li>`)
    .join("");

  const mailtoUrl = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.bodyText)}`;

  const html = `<div style="max-width:680px;margin:0 auto;font-family:sans-serif;color:#1a1a1a">
    <div style="background:linear-gradient(135deg,#7C3AED,#5B21B6);padding:24px 28px;border-radius:8px 8px 0 0">
      <p style="color:#fff;opacity:0.85;margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase">✉️ Draft de follow-up</p>
      <h1 style="color:#fff;font-size:20px;margin:6px 0 0">${escapeHtml(contact.nombre)} — ${escapeHtml(contact.empresa)}</h1>
      <p style="color:#fff;opacity:0.9;margin:4px 0 0;font-size:14px">Reunión: ${apt.date} ${apt.time} · ${apt.title}</p>
    </div>
    <div style="padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">

      ${
        draft.keyPoints.length
          ? `<div style="background:#FEF3C7;border-left:3px solid #F59E0B;padding:14px 16px;border-radius:4px;margin-bottom:24px">
          <p style="margin:0 0 8px;font-weight:600;font-size:13px;color:#92400E">Revisa antes de enviar:</p>
          <ul style="margin:0;padding-left:18px">${keyPointsHtml}</ul>
        </div>`
          : ""
      }

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px">Asunto</p>
        <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#0F172A">${escapeHtml(draft.subject)}</p>

        <p style="margin:0 0 4px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px">Para</p>
        <p style="margin:0 0 20px;font-size:14px;color:#0F172A">${escapeHtml(contact.email)}</p>

        <p style="margin:0 0 4px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px">Cuerpo</p>
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:16px;font-size:14px;line-height:1.6;color:#0F172A">
          ${draft.bodyHtml}
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid #E2E8F0">
        <a href="${mailtoUrl}" style="background:#7C3AED;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Abrir en cliente de correo →</a>
        <a href="${baseUrl}/admin/contacts/${contact.id}" style="background:#2FA4A9;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Ver contacto →</a>
      </div>

      <p style="color:#94A3B8;font-size:12px;margin-top:24px;text-align:center">— Follow-up Writer · IM3 Systems · Revisa siempre antes de enviar</p>
    </div>
  </div>`;

  await sendEmail(
    adminEmail,
    `✉️ Draft follow-up: ${contact.nombre} — ${contact.empresa}`,
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
